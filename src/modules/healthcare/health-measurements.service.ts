import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { AlertSeverity, AlertSource, AlertType } from '@common/enums/alert.enum';
import {
  HealthAccessAction,
  HealthMeasurementSource,
  HealthMetric,
  HealthReadingStatus,
} from '@common/enums/health.enum';
import { Role } from '@common/enums/role.enum';
import { HealthEventBus, HealthRealtimeEventType } from '@common/bus/health-event.bus';
import { buildPaginatedResult, PaginatedResult } from '@common/dto/pagination.dto';
import { AuthenticatedUser } from '@common/interfaces/authenticated-user.interface';
import {
  HealthReading,
  HEALTH_METRIC_LABELS,
  HEALTH_METRIC_UNITS,
  VitalSummary,
  classifyReading,
  countByStatus,
  summarizeVitals,
} from '@common/utils/health.util';
import { ClientHealthMeasurement } from '@database/entities/client-health-measurement.entity';
import { ClientProfile } from '@database/entities/client-profile.entity';
import { Device } from '@database/entities/device.entity';
import { AlertsService } from '@modules/alerts/alerts.service';
import { OrganizationScopeService } from '@modules/organizations/organizations.service';
import {
  HealthAccessService,
  actorLabel,
} from '@modules/healthcare/health-access.service';
import {
  QueryMeasurementsDto,
  RecordMeasurementDto,
} from '@modules/healthcare/dto/health.dto';

export interface HealthMeasurementView {
  id: string;
  metric: HealthMetric;
  metricLabel: string;
  value: number;
  secondaryValue: number | null;
  unit: string;
  status: HealthReadingStatus;
  label: string;
  advice: string;
  fasting: boolean;
  source: HealthMeasurementSource;
  measuredAt: Date;
  deviceSerial: string | null;
  recordedByLabel: string | null;
  note: string | null;
  alertId: string | null;
}

export interface ClientHealthDossier {
  client: {
    id: string;
    zengoId: string;
    fullName: string;
    primaryPhone: string;
    organizationId: string;
    organizationName: string | null;
  };
  vitals: VitalSummary[];
  counts: Record<HealthReadingStatus, number>;
  /** Nombre de mesures suivies sur la periode analysee. */
  sampleSize: number;
  /** Dernier contact de sante (demande de soin ou mesure). */
  lastReadingAt: Date | null;
  /** Mesures critiques sans prise en charge : priorite d'appel. */
  criticalReadings: HealthMeasurementView[];
}

export interface HealthStats {
  totalMeasurements: number;
  byStatus: Record<HealthReadingStatus, number>;
  byMetric: { metric: HealthMetric; label: string; total: number }[];
  criticalLast24h: number;
  clientsFollowed: number;
  criticalClients: number;
  sourceSplit: { source: HealthMeasurementSource; total: number }[];
}

/**
 * Mesures de sante des clients.
 *
 * Chaque mesure est qualifiee a l'ingestion (seuils de `health.util.ts`) : les
 * valeurs critiques declenchent une alerte medicale dans le pipeline du ZMC et
 * une diffusion temps reel vers le personnel de sante du perimetre.
 */
@Injectable()
export class HealthMeasurementsService {
  private readonly logger = new Logger(HealthMeasurementsService.name);

  /** Anticipation de la diffusion : seules les valeurs anormales alertent. */
  private static readonly ALERT_SEVERITY: Record<
    HealthReadingStatus,
    AlertSeverity
  > = {
    [HealthReadingStatus.NORMAL]: AlertSeverity.LOW,
    [HealthReadingStatus.WATCH]: AlertSeverity.MEDIUM,
    [HealthReadingStatus.CRITICAL]: AlertSeverity.CRITICAL,
  };

  constructor(
    @InjectRepository(ClientHealthMeasurement)
    private readonly measurementRepository: Repository<ClientHealthMeasurement>,
    @InjectRepository(ClientProfile)
    private readonly clientRepository: Repository<ClientProfile>,
    @InjectRepository(Device)
    private readonly deviceRepository: Repository<Device>,
    private readonly accessService: HealthAccessService,
    private readonly alertsService: AlertsService,
    private readonly healthBus: HealthEventBus,
    private readonly scopeService: OrganizationScopeService,
  ) {}

  /**
   * Enregistre une mesure saisie par un agent, un infirmier ou le client.
   *
   * Le client ne peut saisir que pour son propre dossier ; le personnel de sante
   * saisit pour les dossiers de son perimetre.
   */
  async record(
    actor: AuthenticatedUser,
    dto: RecordMeasurementDto,
  ): Promise<HealthMeasurementView> {
    const client = await this.accessService.resolveClient(actor, dto.clientId);
    const isClientRole = actor.roles.includes(Role.CLIENT);
    if (!isClientRole) {
      this.accessService.assertHealthStaff(actor);
    }

    const device = dto.deviceSerial
      ? await this.deviceRepository.findOne({
          where: { serialNumber: dto.deviceSerial },
        })
      : null;

    const source =
      dto.source ??
      (isClientRole
        ? HealthMeasurementSource.CLIENT_APP
        : HealthMeasurementSource.MANUAL);

    return this.persist({
      client,
      metric: dto.metric,
      value: dto.value,
      secondaryValue: dto.secondaryValue ?? null,
      fasting: dto.fasting ?? false,
      measuredAt: dto.measuredAt ? new Date(dto.measuredAt) : new Date(),
      source,
      deviceId: device?.id ?? null,
      deviceSerial: dto.deviceSerial ?? null,
      recordedById: actor.id,
      recordedByLabel: actorLabel(actor),
      note: dto.note ?? null,
    });
  }

  /**
   * Ingestion d'une mesure envoyee par un dispositif connecte (MQTT).
   *
   * Aucune session utilisateur : l'organisation est celle du dossier client et
   * l'auteur est le dispositif lui-meme.
   */
  async ingestFromDevice(input: {
    serialNumber: string;
    payload: Record<string, unknown>;
  }): Promise<HealthMeasurementView | null> {
    const device = await this.deviceRepository.findOne({
      where: { serialNumber: input.serialNumber },
    });
    if (!device?.clientId) {
      this.logger.warn(
        `Mesure de sante ignoree : dispositif ${input.serialNumber} sans dossier client.`,
      );
      return null;
    }

    const client = await this.clientRepository.findOne({
      where: { id: device.clientId },
    });
    if (!client) {
      this.logger.warn(
        `Mesure de sante ignoree : dossier client du dispositif ${input.serialNumber} introuvable.`,
      );
      return null;
    }

    const metric = this.parseMetric(input.payload.metric);
    const value = Number(input.payload.value);
    if (!metric || !Number.isFinite(value)) {
      this.logger.warn(
        `Mesure de sante illisible depuis ${input.serialNumber} : ${JSON.stringify(input.payload)}`,
      );
      return null;
    }

    const secondary = input.payload.secondaryValue ?? input.payload.diastolic;

    return this.persist({
      client,
      metric,
      value,
      secondaryValue:
        secondary !== undefined && secondary !== null ? Number(secondary) : null,
      fasting: Boolean(input.payload.fasting),
      measuredAt: input.payload.measuredAt
        ? new Date(String(input.payload.measuredAt))
        : new Date(),
      source: HealthMeasurementSource.DEVICE,
      deviceId: device.id,
      deviceSerial: device.serialNumber,
      recordedById: null,
      recordedByLabel: `Dispositif ${device.serialNumber}`,
      note: null,
    });
  }

  /** Historique filtrable des mesures, dans le perimetre de l'utilisateur. */
  async findAll(
    actor: AuthenticatedUser,
    query: QueryMeasurementsDto,
  ): Promise<PaginatedResult<HealthMeasurementView>> {
    const queryBuilder = this.measurementRepository
      .createQueryBuilder('measurement')
      .leftJoinAndSelect('measurement.client', 'client')
      .orderBy('measurement.measuredAt', query.order === 'asc' ? 'ASC' : 'DESC')
      .skip(query.skip)
      .take(query.limit);

    const scope = await this.scopeIds(actor);
    if (scope !== null) {
      if (scope.length === 0) {
        return buildPaginatedResult([], 0, query.page, query.limit);
      }
      queryBuilder.andWhere('measurement.organizationId IN (:...scope)', {
        scope,
      });
    }
    if (query.clientId) {
      queryBuilder.andWhere('measurement.clientId = :clientId', {
        clientId: query.clientId,
      });
    }
    if (query.metric) {
      queryBuilder.andWhere('measurement.metric = :metric', {
        metric: query.metric,
      });
    }
    if (query.status) {
      queryBuilder.andWhere('measurement.status = :status', {
        status: query.status,
      });
    }
    if (query.source) {
      queryBuilder.andWhere('measurement.source = :source', {
        source: query.source,
      });
    }
    if (query.criticalOnly) {
      queryBuilder.andWhere('measurement.status = :critical', {
        critical: HealthReadingStatus.CRITICAL,
      });
    }
    if (query.from) {
      queryBuilder.andWhere('measurement.measuredAt >= :from', {
        from: new Date(query.from),
      });
    }
    if (query.to) {
      queryBuilder.andWhere('measurement.measuredAt <= :to', {
        to: new Date(query.to),
      });
    }

    const [rows, total] = await queryBuilder.getManyAndCount();
    return buildPaginatedResult(
      rows.map((row) => this.toView(row)),
      total,
      query.page,
      query.limit,
    );
  }

  /**
   * Dossier de sante d'un client : dernieres valeurs, tendances et mesures
   * critiques recentes. L'acces est conditionne au consentement du client.
   */
  async dossier(
    actor: AuthenticatedUser,
    clientId: string,
    options: { days?: number; emergency?: boolean } = {},
  ): Promise<ClientHealthDossier> {
    const client = await this.accessService.resolveClient(actor, clientId);
    await this.accessService.assertReadAccess(actor, client, {
      emergency: options.emergency,
    });

    const days = options.days ?? 90;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const measurements = await this.measurementRepository.find({
      where: { clientId: client.id, measuredAt: MoreThanOrEqual(since) },
      order: { measuredAt: 'ASC' },
    });

    const readings: HealthReading[] = measurements.map((measurement) => ({
      metric: measurement.metric,
      value: Number(measurement.value),
      secondaryValue:
        measurement.secondaryValue === null
          ? null
          : Number(measurement.secondaryValue),
      measuredAt: measurement.measuredAt,
    }));

    await this.accessService.log({
      clientId: client.id,
      action: options.emergency
        ? HealthAccessAction.EMERGENCY
        : HealthAccessAction.VIEW,
      actor,
      reason: options.emergency
        ? "Consultation d'urgence du dossier de sante."
        : 'Consultation du dossier de sante.',
      detail: `${measurements.length} mesure(s) sur ${days} jours.`,
    });

    const critical = measurements.filter(
      (measurement) => measurement.status === HealthReadingStatus.CRITICAL,
    );

    return {
      client: {
        id: client.id,
        zengoId: client.zengoId,
        fullName: client.fullName,
        primaryPhone: client.primaryPhone,
        organizationId: client.organizationId,
        organizationName: client.organization?.name ?? null,
      },
      vitals: summarizeVitals(readings),
      counts: countByStatus(readings),
      sampleSize: measurements.length,
      lastReadingAt:
        measurements.length > 0
          ? measurements[measurements.length - 1].measuredAt
          : null,
      criticalReadings: critical
        .reverse()
        .slice(0, 10)
        .map((measurement) => this.toView(measurement)),
    };
  }

  /** Dernieres mesures d'un client (histogramme / courbes de la console). */
  async history(
    actor: AuthenticatedUser,
    clientId: string,
    query: QueryMeasurementsDto,
  ): Promise<PaginatedResult<HealthMeasurementView>> {
    const client = await this.accessService.resolveClient(actor, clientId);
    await this.accessService.assertReadAccess(actor, client, {});
    await this.accessService.log({
      clientId: client.id,
      action: HealthAccessAction.VIEW,
      actor,
      reason: 'Consultation de l historique des mesures.',
    });

    return this.findAll(
      actor,
      Object.assign(new QueryMeasurementsDto(), query, {
        clientId: client.id,
      }),
    );
  }

  /** Indicateurs de sante du perimetre (pilotage e-sante). */
  async stats(actor: AuthenticatedUser): Promise<HealthStats> {
    const scope = await this.scopeIds(actor);
    const build = () => {
      const builder = this.measurementRepository.createQueryBuilder('measurement');
      if (scope !== null) {
        if (scope.length === 0) return null;
        builder.where('measurement.organizationId IN (:...scope)', { scope });
      }
      return builder;
    };

    const builder = build();
    if (!builder) {
      return {
        totalMeasurements: 0,
        byStatus: {
          [HealthReadingStatus.NORMAL]: 0,
          [HealthReadingStatus.WATCH]: 0,
          [HealthReadingStatus.CRITICAL]: 0,
        },
        byMetric: [],
        criticalLast24h: 0,
        clientsFollowed: 0,
        criticalClients: 0,
        sourceSplit: [],
      };
    }

    const total = await builder.getCount();

    const statusRows = await builder
      .clone()
      .select('measurement.status', 'status')
      .addSelect('COUNT(*)', 'total')
      .groupBy('measurement.status')
      .getRawMany<{ status: HealthReadingStatus; total: string }>();

    const metricRows = await builder
      .clone()
      .select('measurement.metric', 'metric')
      .addSelect('COUNT(*)', 'total')
      .groupBy('measurement.metric')
      .getRawMany<{ metric: HealthMetric; total: string }>();

    const sourceRows = await builder
      .clone()
      .select('measurement.source', 'source')
      .addSelect('COUNT(*)', 'total')
      .groupBy('measurement.source')
      .getRawMany<{ source: HealthMeasurementSource; total: string }>();

    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const criticalLast24h = await builder
      .clone()
      .andWhere('measurement.status = :critical', {
        critical: HealthReadingStatus.CRITICAL,
      })
      .andWhere('measurement.measuredAt >= :since24h', { since24h })
      .getCount();

    const clientRows = await builder
      .clone()
      .select('measurement.client_id', 'client_id')
      .addSelect(
        `MAX(CASE WHEN measurement.status = 'CRITICAL' THEN 1 ELSE 0 END)`,
        'has_critical',
      )
      .groupBy('measurement.client_id')
      .getRawMany<{ client_id: string; has_critical: number }>();

    return {
      totalMeasurements: total,
      byStatus: {
        [HealthReadingStatus.NORMAL]:
          Number(
            statusRows.find((row) => row.status === HealthReadingStatus.NORMAL)
              ?.total ?? 0,
          ),
        [HealthReadingStatus.WATCH]: Number(
          statusRows.find((row) => row.status === HealthReadingStatus.WATCH)
            ?.total ?? 0,
        ),
        [HealthReadingStatus.CRITICAL]: Number(
          statusRows.find((row) => row.status === HealthReadingStatus.CRITICAL)
            ?.total ?? 0,
        ),
      },
      byMetric: metricRows.map((row) => ({
        metric: row.metric,
        label: HEALTH_METRIC_LABELS[row.metric],
        total: Number(row.total),
      })),
      criticalLast24h,
      clientsFollowed: clientRows.length,
      criticalClients: clientRows.filter((row) => Number(row.has_critical) === 1)
        .length,
      sourceSplit: sourceRows.map((row) => ({
        source: row.source,
        total: Number(row.total),
      })),
    };
  }

  /** Mesures critiques d'un client sur une periode (usage interne / taches). */
  async criticalForClient(
    clientId: string,
    since: Date,
  ): Promise<ClientHealthMeasurement[]> {
    return this.measurementRepository.find({
      where: {
        clientId,
        status: HealthReadingStatus.CRITICAL,
        measuredAt: MoreThanOrEqual(since),
      },
      order: { measuredAt: 'DESC' },
    });
  }

  /** Clients suivis mais sans aucune mesure depuis `days` jours (relance). */
  async clientsWithoutRecentMeasurement(days: number): Promise<string[]> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const followed = await this.measurementRepository
      .createQueryBuilder('measurement')
      .select('measurement.client_id', 'client_id')
      .addSelect('MAX(measurement.measuredAt)', 'last_measured_at')
      .groupBy('measurement.client_id')
      .getRawMany<{ client_id: string; last_measured_at: string }>();

    return followed
      .filter(
        (row) => new Date(row.last_measured_at).getTime() < since.getTime(),
      )
      .map((row) => row.client_id);
  }

  /** Mesures d'un client triees, sans controle d'acces (usage interne). */
  async readingsForClient(
    clientId: string,
    options: { from?: Date; to?: Date; limit?: number } = {},
  ): Promise<ClientHealthMeasurement[]> {
    const where: Record<string, unknown> = { clientId };
    if (options.from && options.to) {
      where.measuredAt = Between(options.from, options.to);
    } else if (options.from) {
      where.measuredAt = MoreThanOrEqual(options.from);
    } else if (options.to) {
      where.measuredAt = LessThanOrEqual(options.to);
    }

    return this.measurementRepository.find({
      where,
      order: { measuredAt: 'DESC' },
      take: options.limit ?? 100,
    });
  }

  private async persist(input: {
    client: ClientProfile;
    metric: HealthMetric;
    value: number;
    secondaryValue: number | null;
    fasting: boolean;
    measuredAt: Date;
    source: HealthMeasurementSource;
    deviceId: string | null;
    deviceSerial: string | null;
    recordedById: string | null;
    recordedByLabel: string | null;
    note: string | null;
  }): Promise<HealthMeasurementView> {
    if (Number.isNaN(input.measuredAt.getTime())) {
      throw new BadRequestException('Date de mesure invalide.');
    }
    if (
      input.metric === HealthMetric.BLOOD_PRESSURE &&
      (input.secondaryValue === null || input.secondaryValue <= 0)
    ) {
      throw new BadRequestException(
        'La valeur diastolique est obligatoire pour une mesure de tension.',
      );
    }

    const verdict = classifyReading(
      input.metric,
      input.value,
      input.secondaryValue,
      { fasting: input.fasting },
    );

    const measurement = this.measurementRepository.create({
      clientId: input.client.id,
      organizationId: input.client.organizationId,
      metric: input.metric,
      value: input.value,
      secondaryValue: input.secondaryValue,
      unit: HEALTH_METRIC_UNITS[input.metric],
      status: verdict.status,
      label: verdict.label,
      source: input.source,
      fasting: input.fasting,
      measuredAt: input.measuredAt,
      deviceId: input.deviceId,
      deviceSerial: input.deviceSerial,
      recordedById: input.recordedById,
      recordedByLabel: input.recordedByLabel,
      note: input.note,
      metadata: null,
    });

    const saved = await this.measurementRepository.save(measurement);

    if (verdict.status === HealthReadingStatus.CRITICAL) {
      const alert = await this.raiseMedicalAlert(saved, verdict.advice);
      if (alert) {
        saved.alertId = alert.id;
        await this.measurementRepository.update(saved.id, {
          alertId: alert.id,
        });
      }
    }

    this.publish(
      verdict.status === HealthReadingStatus.CRITICAL
        ? HealthRealtimeEventType.CRITICAL_READING
        : HealthRealtimeEventType.MEASUREMENT_RECORDED,
      input.client,
      saved,
      verdict.status,
    );

    return { ...this.toView(saved), advice: verdict.advice };
  }

  /**
   * Ouvre une alerte medicale pour une mesure critique.
   *
   * Aucun appel vocal automatique : l'alerte vise le personnel de sante et les
   * equipes du ZMC, qui decident de l'escalade (contrairement a une intrusion).
   */
  private async raiseMedicalAlert(
    measurement: ClientHealthMeasurement,
    advice: string,
  ): Promise<{ id: string } | null> {
    try {
      const client = await this.clientRepository.findOne({
        where: { id: measurement.clientId },
      });

      const alert = await this.alertsService.create({
        type: AlertType.MEDICAL,
        source: AlertSource.AUTOMATION,
        severity: HealthMeasurementsService.ALERT_SEVERITY[measurement.status],
        clientId: measurement.clientId,
        deviceId: measurement.deviceId,
        organizationId: measurement.organizationId,
        triggerMessage: `Mesure de sante critique : ${measurement.label}${
          client ? ` (${client.fullName})` : ''
        }. ${advice}`,
        autoVoiceCall: false,
        metadata: {
          origin: 'HEALTH_MEASUREMENT',
          measurementId: measurement.id,
          metric: measurement.metric,
          value: Number(measurement.value),
          secondaryValue:
            measurement.secondaryValue === null
              ? null
              : Number(measurement.secondaryValue),
        },
      });
      return alert;
    } catch (error) {
      this.logger.error(
        `Echec de creation de l'alerte medicale pour la mesure ${measurement.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  private publish(
    type: HealthRealtimeEventType,
    client: ClientProfile,
    measurement: ClientHealthMeasurement,
    status: HealthReadingStatus,
  ): void {
    this.healthBus.publish({
      type,
      clientId: client.id,
      clientName: client.fullName,
      organizationId: client.organizationId,
      entityId: measurement.id,
      reference: null,
      message:
        status === HealthReadingStatus.CRITICAL
          ? `Mesure critique : ${measurement.label} — ${client.fullName}`
          : `Nouvelle mesure : ${measurement.label} — ${client.fullName}`,
      payload: {
        metric: measurement.metric,
        value: Number(measurement.value),
        secondaryValue:
          measurement.secondaryValue === null
            ? null
            : Number(measurement.secondaryValue),
        status,
        alertId: measurement.alertId,
      },
      occurredAt: new Date().toISOString(),
    });
  }

  private parseMetric(raw: unknown): HealthMetric | null {
    if (typeof raw !== 'string') return null;
    const candidate = raw.trim().toUpperCase().replace(/[\s-]+/g, '_');
    const values = Object.values(HealthMetric) as string[];
    if (values.includes(candidate)) return candidate as HealthMetric;

    const aliases: Record<string, HealthMetric> = {
      BP: HealthMetric.BLOOD_PRESSURE,
      PRESSURE: HealthMetric.BLOOD_PRESSURE,
      TEMP: HealthMetric.TEMPERATURE,
      GLUCOSE: HealthMetric.BLOOD_GLUCOSE,
      SPO2: HealthMetric.SPO2,
      OXYGEN: HealthMetric.SPO2,
      PULSE: HealthMetric.HEART_RATE,
    };
    return aliases[candidate] ?? null;
  }

  private toView(
    measurement: ClientHealthMeasurement,
  ): HealthMeasurementView {
    const verdict = classifyReading(
      measurement.metric,
      Number(measurement.value),
      measurement.secondaryValue === null
        ? null
        : Number(measurement.secondaryValue),
      { fasting: measurement.fasting },
    );

    return {
      id: measurement.id,
      metric: measurement.metric,
      metricLabel: HEALTH_METRIC_LABELS[measurement.metric],
      value: Number(measurement.value),
      secondaryValue:
        measurement.secondaryValue === null
          ? null
          : Number(measurement.secondaryValue),
      unit: measurement.unit,
      status: measurement.status,
      label: measurement.label,
      advice: verdict.advice,
      fasting: measurement.fasting,
      source: measurement.source,
      measuredAt: measurement.measuredAt,
      deviceSerial: measurement.deviceSerial,
      recordedByLabel: measurement.recordedByLabel,
      note: measurement.note,
      alertId: measurement.alertId,
    };
  }

  private async scopeIds(actor: AuthenticatedUser): Promise<string[] | null> {
    return this.scopeService.getAccessibleOrganizationIds(actor);
  }
}
