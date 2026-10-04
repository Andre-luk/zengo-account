import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, IsNull, MoreThanOrEqual, Repository, SelectQueryBuilder } from 'typeorm';
import { buildPaginatedResult } from '@common/dto/pagination.dto';
import {
  AlertEventType,
  AlertResolution,
  AlertSeverity,
  AlertSource,
  AlertStatus,
  AlertType,
  DispatchStatus,
  EscalationLevel,
} from '@common/enums/alert.enum';
import { OrganizationType, OrganizationStatus } from '@common/enums/organization.enum';
import { Role } from '@common/enums/role.enum';
import { AuthenticatedUser } from '@common/interfaces/authenticated-user.interface';
import { ClientProfile } from '@database/entities/client-profile.entity';
import { Device } from '@database/entities/device.entity';
import { SubDevice } from '@database/entities/sub-device.entity';
import { AlertEvent } from '@database/entities/alert-event.entity';
import { Alert } from '@database/entities/alert.entity';
import { Organization } from '@database/entities/organization.entity';
import { AlertLifecycleService, ALERT_DETAIL_RELATIONS } from '@modules/alerts/alert-lifecycle.service';
import { AlertVoiceCallService } from '@modules/alerts/alert-voice-call.service';
import { AlertSmsService } from '@modules/alerts/alert-sms.service';
import {
  buildAlertReference,
  computeSeverity,
  isEscalationDue,
  isOpenStatus,
  resolveAlertType,
  shouldGroupOccurrence,
} from '@modules/alerts/alert-rules';
import {
  AddAlertNoteDto,
  AcknowledgeAlertDto,
  CreateManualAlertDto,
  DispatchAlertDto,
  EscalateAlertDto,
  QueryAlertsDto,
  ResolveAlertDto,
  UpdateDispatchStatusDto,
} from '@modules/alerts/dto/alert.dto';
import { OrganizationScopeService } from '@modules/organizations/organizations.service';

export interface CreateAlertInput {
  type: AlertType;
  source: AlertSource;
  severity?: AlertSeverity;
  clientId?: string | null;
  deviceId?: string | null;
  subDeviceId?: string | null;
  organizationId?: string | null;
  triggerMessage?: string | null;
  subDeviceCode?: string | null;
  rawType?: number | null;
  autoVoiceCall?: boolean;
  metadata?: Record<string, unknown>;
}

export interface DeviceAlarmPayload {
  id?: string;
  message?: string;
  name?: string;
  type?: number;
}

const TERMINAL_STATUSES = [AlertStatus.RESOLVED, AlertStatus.FALSE_ALARM, AlertStatus.CANCELLED];
const OPEN_STATUSES = [AlertStatus.NEW, AlertStatus.ACKNOWLEDGED, AlertStatus.ASSIGNED, AlertStatus.IN_PROGRESS];

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(
    @InjectRepository(Alert)
    private readonly alertRepository: Repository<Alert>,
    @InjectRepository(AlertEvent)
    private readonly alertEventRepository: Repository<AlertEvent>,
    @InjectRepository(ClientProfile)
    private readonly clientRepository: Repository<ClientProfile>,
    @InjectRepository(Device)
    private readonly deviceRepository: Repository<Device>,
    @InjectRepository(SubDevice)
    private readonly subDeviceRepository: Repository<SubDevice>,
    @InjectRepository(Organization)
    private readonly organizationRepository: Repository<Organization>,
    private readonly scopeService: OrganizationScopeService,
    private readonly alertLifecycle: AlertLifecycleService,
    private readonly alertVoiceCall: AlertVoiceCallService,
    private readonly alertSms: AlertSmsService,
    private readonly configService: ConfigService,
  ) {}

  // ---------------------------------------------------------------------------
  // Creation d'alertes
  // ---------------------------------------------------------------------------

  /**
   * Ingestion d'une alarme transmise par une centrale SafAlert (MQTT).
   * Retourne l'alerte creee ou regroupee.
   *
   * `options.autoVoiceCall` permet au banc d'essai de forcer ou d'inhiber
   * l'appel de verification ; laisse a `undefined`, la regle du projet
   * s'applique (parametre `ALERT_AUTO_VOICE_CALL`).
   */
  async ingestDeviceAlarm(
    device: Device,
    payload: DeviceAlarmPayload,
    options: { autoVoiceCall?: boolean } = {},
  ): Promise<Alert> {
    const subDevice = payload.id
      ? await this.subDeviceRepository.findOne({ where: { deviceId: device.id, subId: payload.id } })
      : null;

    const type = resolveAlertType(subDevice?.code ?? null, payload.type ?? null);

    return this.create({
      type,
      source: AlertSource.SENSOR,
      clientId: device.clientId,
      deviceId: device.id,
      subDeviceId: subDevice?.id ?? null,
      subDeviceCode: subDevice?.code ?? null,
      rawType: payload.type ?? null,
      triggerMessage: payload.message ?? payload.name ?? null,
      autoVoiceCall: options.autoVoiceCall,
      metadata: { deviceSerial: device.serialNumber, subDeviceLabel: subDevice?.name ?? payload.name ?? null },
    });
  }

  /** Alerte declenchee par le client depuis l'application mobile (bouton SOS). */
  async createByClient(userId: string, dto: CreateManualAlertDto): Promise<Alert> {
    const profile = await this.clientRepository.findOne({ where: { userId } });
    if (!profile) throw new NotFoundException('Aucun compte client associe a cet utilisateur.');

    return this.create({
      type: dto.type,
      source: dto.source ?? AlertSource.CLIENT_APP,
      severity: dto.severity,
      clientId: profile.id,
      triggerMessage: dto.note ?? "Demande d'intervention envoyee depuis l'application mobile.",
      // Inutile d'appeler le client qui vient lui-meme de declencher l'alerte.
      autoVoiceCall: dto.autoVoiceCall ?? false,
    });
  }

  /** Alerte declenchee manuellement par un operateur du ZMC. */
  async createByOperator(actor: AuthenticatedUser, dto: CreateManualAlertDto): Promise<Alert> {
    if (!dto.clientId) {
      throw new BadRequestException('Le client concerne est obligatoire pour une alerte creee par un operateur.');
    }

    const profile = await this.clientRepository.findOne({ where: { id: dto.clientId } });
    if (!profile) throw new NotFoundException('Compte client introuvable.');
    await this.scopeService.assertInScope(actor, profile.organizationId);

    return this.create({
      type: dto.type,
      source: dto.source ?? AlertSource.OPERATOR,
      severity: dto.severity,
      clientId: profile.id,
      triggerMessage: dto.note ?? `Alerte declenchee manuellement par ${actor.firstName} ${actor.lastName}.`,
      autoVoiceCall: dto.autoVoiceCall,
      metadata: { createdBy: actor.id },
    });
  }

  /**
   * Cree une alerte : photographie du client, de la localisation et du
   * portefeuille, regroupement des declenchements repetitifs, journalisation
   * et diffusion temps reel.
   */
  async create(input: CreateAlertInput): Promise<Alert> {
    const client = input.clientId
      ? await this.clientRepository.findOne({ where: { id: input.clientId } })
      : null;

    const organizationId =
      input.organizationId ?? client?.organizationId ?? (await this.resolveDeviceOrganization(input.deviceId));

    const severity = input.severity ?? computeSeverity(input.type);

    const grouped = await this.findGroupableAlert(input);
    if (grouped) return this.registerOccurrence(grouped, input);

    const organization = organizationId
      ? await this.organizationRepository.findOne({ where: { id: organizationId } })
      : null;

    const alert = await this.persistWithReference({
      type: input.type,
      severity,
      status: AlertStatus.NEW,
      source: input.source,
      clientId: client?.id ?? null,
      deviceId: input.deviceId ?? null,
      subDeviceId: input.subDeviceId ?? null,
      organizationId: organization?.id ?? null,
      triggerMessage: input.triggerMessage ?? null,
      subDeviceCode: (input.subDeviceCode as Alert['subDeviceCode']) ?? null,
      rawType: input.rawType ?? null,
      address: client?.address ?? null,
      city: client?.city ?? null,
      country: client?.country ?? null,
      latitude: client?.latitude ?? null,
      longitude: client?.longitude ?? null,
      openedAt: new Date(),
      escalationLevel: EscalationLevel.NONE,
      occurrenceCount: 1,
      lastOccurrenceAt: new Date(),
      metadata: {
        ...(input.metadata ?? {}),
        organizationPath: organization?.path ?? null,
        organizationName: organization?.name ?? null,
        clientName: client?.fullName ?? null,
        clientZengoId: client?.zengoId ?? null,
      },
    });

    await this.alertLifecycle.recordEvent(alert.id, AlertEventType.CREATED, {
      message: alert.triggerMessage ?? `Alerte ${alert.type} enregistree.`,
      data: {
        source: alert.source,
        severity: alert.severity,
        deviceId: alert.deviceId,
        subDeviceCode: alert.subDeviceCode,
      },
    });

    this.alertLifecycle.publish('alert.created', alert, {
      type: alert.type,
      severity: alert.severity,
      clientName: client?.fullName ?? null,
    });

    this.logger.warn(
      `Alerte ${alert.reference} [${alert.type}/${alert.severity}] client=${client?.zengoId ?? 'inconnu'} source=${alert.source}`,
    );

    await this.maybeStartVoiceCall(alert, input.autoVoiceCall);
    await this.maybeNotifyBySms(alert);

    return this.alertLifecycle.loadAlertOrFail(alert.id, true);
  }

  // ---------------------------------------------------------------------------
  // Consultation
  // ---------------------------------------------------------------------------

  async findAll(actor: AuthenticatedUser, query: QueryAlertsDto) {
    const builder = this.alertRepository
      .createQueryBuilder('alert')
      .leftJoinAndSelect('alert.client', 'client')
      .leftJoinAndSelect('alert.organization', 'organization');

    const restricted = await this.applyAccessFilter(builder, actor);
    if (restricted) return buildPaginatedResult<Alert>([], 0, query.page, query.limit);

    if (query.status) builder.andWhere('alert.status = :status', { status: query.status });
    if (query.openOnly) builder.andWhere('alert.status IN (:...openStatuses)', { openStatuses: OPEN_STATUSES });
    if (query.type) builder.andWhere('alert.type = :type', { type: query.type });
    if (query.severity) builder.andWhere('alert.severity = :severity', { severity: query.severity });
    if (query.organizationId) {
      builder.andWhere('alert.organizationId = :organizationId', { organizationId: query.organizationId });
    }
    if (query.clientId) builder.andWhere('alert.clientId = :clientId', { clientId: query.clientId });
    if (query.deviceId) builder.andWhere('alert.deviceId = :deviceId', { deviceId: query.deviceId });
    if (query.from) builder.andWhere('alert.openedAt >= :from', { from: new Date(query.from) });
    if (query.to) builder.andWhere('alert.openedAt <= :to', { to: new Date(query.to) });
    if (query.search) {
      builder.andWhere(
        new Brackets((qb) => {
          qb.where('alert.reference ILIKE :search', { search: `%${query.search}%` })
            .orWhere('client.fullName ILIKE :search', { search: `%${query.search}%` })
            .orWhere('client.zengoId ILIKE :search', { search: `%${query.search}%` })
            .orWhere('alert.city ILIKE :search', { search: `%${query.search}%` })
            .orWhere('alert.triggerMessage ILIKE :search', { search: `%${query.search}%` });
        }),
      );
    }

    builder
      .orderBy('alert.openedAt', query.order.toUpperCase() as 'ASC' | 'DESC')
      .skip(query.skip)
      .take(query.limit);

    const [items, total] = await builder.getManyAndCount();
    return buildPaginatedResult(items, total, query.page, query.limit);
  }

  async findOne(actor: AuthenticatedUser, id: string): Promise<Alert> {
    const alert = await this.alertLifecycle.loadAlert(id, true);
    if (!alert) throw new NotFoundException('Alerte introuvable.');
    await this.assertCanAccessAlert(actor, alert);
    return alert;
  }

  async getTimeline(actor: AuthenticatedUser, id: string): Promise<AlertEvent[]> {
    await this.findOne(actor, id);
    return this.alertEventRepository.find({ where: { alertId: id }, order: { createdAt: 'ASC' } });
  }

  async listVoiceCalls(actor: AuthenticatedUser, id: string) {
    await this.findOne(actor, id);
    return this.alertVoiceCall.listForAlert(id);
  }

  async stats(actor: AuthenticatedUser, query: QueryAlertsDto) {
    const builder = this.alertRepository.createQueryBuilder('alert');
    const restricted = await this.applyAccessFilter(builder, actor);
    if (restricted) {
      return { total: 0, open: 0, byStatus: [], byType: [], last24h: 0, averageAcknowledgeSeconds: null, averageResolutionSeconds: null };
    }
    if (query.organizationId) {
      builder.andWhere('alert.organizationId = :organizationId', { organizationId: query.organizationId });
    }

    const byStatus = await builder
      .clone()
      .select('alert.status', 'status')
      .addSelect('COUNT(*)::int', 'count')
      .groupBy('alert.status')
      .getRawMany<{ status: AlertStatus; count: number }>();

    const byType = await builder
      .clone()
      .select('alert.type', 'type')
      .addSelect('COUNT(*)::int', 'count')
      .andWhere('alert.status IN (:...openStatuses)', { openStatuses: OPEN_STATUSES })
      .groupBy('alert.type')
      .getRawMany<{ type: AlertType; count: number }>();

    const open = byStatus
      .filter((row) => OPEN_STATUSES.includes(row.status))
      .reduce((total, row) => total + row.count, 0);

    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const last24h = await builder.clone().andWhere('alert.openedAt >= :since', { since }).getCount();

    const performance = await builder
      .clone()
      .select(
        'AVG(EXTRACT(EPOCH FROM (alert.acknowledgedAt - alert.openedAt)))',
        'averageAcknowledgeSeconds',
      )
      .addSelect('AVG(EXTRACT(EPOCH FROM (alert.resolvedAt - alert.openedAt)))', 'averageResolutionSeconds')
      .where('alert.acknowledgedAt IS NOT NULL OR alert.resolvedAt IS NOT NULL')
      .getRawOne<{ averageAcknowledgeSeconds: string | null; averageResolutionSeconds: string | null }>();

    return {
      total: open + byStatus.filter((row) => TERMINAL_STATUSES.includes(row.status)).reduce((t, r) => t + r.count, 0),
      open,
      byStatus,
      byType,
      last24h,
      averageAcknowledgeSeconds: performance?.averageAcknowledgeSeconds
        ? Math.round(Number(performance.averageAcknowledgeSeconds))
        : null,
      averageResolutionSeconds: performance?.averageResolutionSeconds
        ? Math.round(Number(performance.averageResolutionSeconds))
        : null,
    };
  }

  // ---------------------------------------------------------------------------
  // Commandes operateur
  // ---------------------------------------------------------------------------

  async acknowledge(actor: AuthenticatedUser, id: string, dto: AcknowledgeAlertDto): Promise<Alert> {
    const alert = await this.findOne(actor, id);
    if (TERMINAL_STATUSES.includes(alert.status)) {
      throw new BadRequestException('Alerte deja cloturee.');
    }

    if (alert.status === AlertStatus.NEW) {
      alert.status = AlertStatus.ACKNOWLEDGED;
      alert.acknowledgedAt = new Date();
      alert.acknowledgedById = actor.id;
      await this.alertLifecycle.save(alert);
    }

    const actorInfo = AlertLifecycleService.actorFrom(actor);
    await this.alertLifecycle.recordEvent(alert.id, AlertEventType.ACKNOWLEDGED, {
      message: dto.note ?? `Alerte prise en charge par ${actorInfo?.label}.`,
      actor: actorInfo,
    });

    this.alertLifecycle.publish('alert.acknowledged', alert, { by: actorInfo?.label });
    return this.alertLifecycle.loadAlertOrFail(alert.id, true);
  }

  async dispatch(actor: AuthenticatedUser, id: string, dto: DispatchAlertDto) {
    const alert = await this.alertLifecycle.loadAlertOrFail(id, true);
    await this.assertCanAccessAlert(actor, alert);

    if (TERMINAL_STATUSES.includes(alert.status)) {
      throw new BadRequestException('Alerte deja cloturee.');
    }

    let stations: Organization[];
    if (dto.stationIds?.length) {
      stations = await this.organizationRepository.find({ where: { id: In(dto.stationIds) } });
      if (stations.length !== dto.stationIds.length) {
        throw new NotFoundException('Une ou plusieurs stations sont introuvables.');
      }
      const notStation = stations.find((station) => station.type !== OrganizationType.STATION);
      if (notStation) {
        throw new BadRequestException(`L'organisation "${notStation.name}" n'est pas une station d'intervention.`);
      }
      for (const station of stations) {
        const scope = await this.scopeService.getAccessibleOrganizationIds(actor);
        if (scope !== null && !scope.includes(station.id)) {
          throw new ForbiddenException(`Station hors de votre perimetre : ${station.name}.`);
        }
      }
    } else {
      stations = await this.alertLifecycle.findDispatchableStations(alert, { allTeams: false });
    }

    if (stations.length === 0) {
      throw new BadRequestException(
        "Aucune station d'intervention n'est rattachee a cette agence. Configurez les stations du point de distribution.",
      );
    }

    const actorInfo = AlertLifecycleService.actorFrom(actor);
    const dispatches = await this.alertLifecycle.createDispatches(alert, stations, {
      isEscalation: false,
      actor: actorInfo,
      note: dto.note ?? null,
    });

    const alreadyDispatched = Boolean(alert.dispatchedAt);
    await this.alertLifecycle.markDispatched(alert, new Date());

    if (dispatches.length > 0 || !alreadyDispatched) {
      await this.alertLifecycle.recordEvent(alert.id, AlertEventType.DISPATCHED, {
        message:
          dispatches.length > 0
            ? `Mission transmise a ${dispatches.length} station(s) : ${stations.map((s) => s.name).join(', ')}.`
            : 'Aucune nouvelle station a notifier.',
        actor: actorInfo,
        data: { stationIds: stations.map((s) => s.id), note: dto.note ?? null },
      });
      this.alertLifecycle.publish('alert.dispatched', alert, {
        stationCount: dispatches.length,
        stations: stations.map((station) => ({ id: station.id, name: station.name })),
      });
    }

    return { alert: await this.alertLifecycle.loadAlertOrFail(alert.id, true), dispatches };
  }

  async escalate(actor: AuthenticatedUser, id: string, dto: EscalateAlertDto) {
    const alert = await this.findOne(actor, id);
    if (TERMINAL_STATUSES.includes(alert.status)) {
      throw new BadRequestException('Alerte deja cloturee.');
    }

    const result = await this.alertLifecycle.escalate(alert, {
      reason: dto.reason ?? `Escalade manuelle demandee par ${actor.firstName} ${actor.lastName}.`,
      level: dto.regional ? EscalationLevel.REGIONAL : EscalationLevel.ALL_TEAMS,
      actor: AlertLifecycleService.actorFrom(actor),
    });

    return {
      alert: await this.alertLifecycle.loadAlertOrFail(result.alert.id, true),
      dispatches: result.dispatches,
    };
  }

  async resolve(actor: AuthenticatedUser, id: string, dto: ResolveAlertDto): Promise<Alert> {
    const alert = await this.findOne(actor, id);
    if (TERMINAL_STATUSES.includes(alert.status)) {
      throw new BadRequestException('Alerte deja cloturee.');
    }

    alert.status = AlertStatus.RESOLVED;
    alert.resolution = dto.resolution;
    alert.resolutionNote = dto.note ?? null;
    alert.resolvedAt = new Date();
    alert.resolvedById = actor.id;
    await this.alertLifecycle.save(alert);

    const actorInfo = AlertLifecycleService.actorFrom(actor);
    await this.alertLifecycle.recordEvent(alert.id, AlertEventType.RESOLVED, {
      message: dto.note ?? `Alerte cloturee (${dto.resolution}).`,
      actor: actorInfo,
      data: { resolution: dto.resolution },
    });

    this.alertLifecycle.publish('alert.resolved', alert, { resolution: dto.resolution });
    return this.alertLifecycle.loadAlertOrFail(alert.id, true);
  }

  async markFalseAlarm(actor: AuthenticatedUser, id: string, dto: ResolveAlertDto): Promise<Alert> {
    const alert = await this.findOne(actor, id);
    if (TERMINAL_STATUSES.includes(alert.status)) {
      throw new BadRequestException('Alerte deja cloturee.');
    }

    alert.status = AlertStatus.FALSE_ALARM;
    alert.resolution = dto.resolution;
    alert.resolutionNote = dto.note ?? null;
    alert.resolvedAt = new Date();
    alert.resolvedById = actor.id;
    await this.alertLifecycle.save(alert);

    const actorInfo = AlertLifecycleService.actorFrom(actor);
    await this.alertLifecycle.recordEvent(alert.id, AlertEventType.RESOLVED, {
      message: dto.note ?? `Alerte classee en faux positif (${dto.resolution}).`,
      actor: actorInfo,
      data: { resolution: dto.resolution, falseAlarm: true },
    });

    this.alertLifecycle.publish('alert.resolved', alert, { resolution: dto.resolution, falseAlarm: true });
    return this.alertLifecycle.loadAlertOrFail(alert.id, true);
  }

  async cancel(actor: AuthenticatedUser, id: string, dto: AddAlertNoteDto): Promise<Alert> {
    const alert = await this.findOne(actor, id);
    if (TERMINAL_STATUSES.includes(alert.status)) {
      throw new BadRequestException('Alerte deja cloturee.');
    }

    alert.status = AlertStatus.CANCELLED;
    alert.resolutionNote = dto.note;
    alert.resolvedAt = new Date();
    alert.resolvedById = actor.id;
    await this.alertLifecycle.save(alert);

    const actorInfo = AlertLifecycleService.actorFrom(actor);
    await this.alertLifecycle.recordEvent(alert.id, AlertEventType.CANCELLED, {
      message: dto.note,
      actor: actorInfo,
    });

    this.alertLifecycle.publish('alert.cancelled', alert, { note: dto.note });
    return this.alertLifecycle.loadAlertOrFail(alert.id, true);
  }

  async addNote(actor: AuthenticatedUser, id: string, dto: AddAlertNoteDto): Promise<Alert> {
    const alert = await this.findOne(actor, id);
    const actorInfo = AlertLifecycleService.actorFrom(actor);

    await this.alertLifecycle.recordEvent(alert.id, AlertEventType.NOTE_ADDED, {
      message: dto.note,
      actor: actorInfo,
    });

    this.alertLifecycle.publish('alert.updated', alert, { note: dto.note });
    return this.alertLifecycle.loadAlertOrFail(alert.id, true);
  }

  async updateDispatchStatus(
    actor: AuthenticatedUser,
    alertId: string,
    dispatchId: string,
    dto: UpdateDispatchStatusDto,
  ) {
    const alert = await this.findOne(actor, alertId);
    const dispatch = await this.alertLifecycle.loadDispatch(alertId, dispatchId);
    if (!dispatch) throw new NotFoundException('Affectation introuvable.');

    const actorInfo = AlertLifecycleService.actorFrom(actor);
    await this.alertLifecycle.updateDispatchStatus(
      dispatch,
      dto.status as DispatchStatus,
      actorInfo,
      dto.note ?? null,
    );

    if (
      (dto.status === 'ARRIVED' || dto.status === 'COMPLETED') &&
      !TERMINAL_STATUSES.includes(alert.status) &&
      alert.status !== AlertStatus.IN_PROGRESS
    ) {
      alert.status = AlertStatus.IN_PROGRESS;
      await this.alertLifecycle.save(alert);
      await this.alertLifecycle.recordEvent(alert.id, AlertEventType.STATUS_CHANGED, {
        message:
          dto.status === 'ARRIVED'
            ? `Equipe sur place (${dispatch.station?.name ?? 'station'}).`
            : `Intervention terminee (${dispatch.station?.name ?? 'station'}).`,
        actor: actorInfo,
      });
    } else {
      await this.alertLifecycle.recordEvent(alert.id, AlertEventType.NOTE_ADDED, {
        message: `Statut de la station ${dispatch.station?.name ?? ''} : ${dto.status}.`,
        actor: actorInfo,
      });
    }

    this.alertLifecycle.publish('alert.updated', alert, { dispatchId, dispatchStatus: dto.status });
    return this.alertLifecycle.loadAlertOrFail(alert.id, true);
  }

  // ---------------------------------------------------------------------------
  // Watchdog de temporisation (5 minutes par defaut)
  // ---------------------------------------------------------------------------

  /**
   * Escalade les alertes restees sans affectation au-dela du delai configure.
   * Appelee par la tache planifiee.
   */
  async escalateOverdue(): Promise<number> {
    const delaySeconds = this.configService.get<number>('app.alerts.escalationSeconds', 300);

    const candidates = await this.alertRepository.find({
      where: { escalationLevel: EscalationLevel.NONE, dispatchedAt: IsNull(), status: In(OPEN_STATUSES) },
      order: { openedAt: 'ASC' },
      take: 200,
    });

    let escalated = 0;
    for (const alert of candidates) {
      const due = isEscalationDue(
        {
          status: alert.status,
          dispatchedAt: alert.dispatchedAt,
          escalationLevel: alert.escalationLevel,
          openedAt: alert.openedAt,
        },
        delaySeconds,
      );
      if (!due) continue;

      await this.alertLifecycle.escalate(alert, {
        reason: `Aucune action enregistree dans le delai de ${Math.round(delaySeconds / 60)} minute(s).`,
        level: EscalationLevel.ALL_TEAMS,
        automatic: true,
      });
      escalated += 1;
    }

    if (escalated > 0) {
      this.logger.warn(`${escalated} alerte(s) escaladee(s) automatiquement faute d'action.`);
    }
    return escalated;
  }

  // ---------------------------------------------------------------------------
  // Helpers prives
  // ---------------------------------------------------------------------------

  private async maybeStartVoiceCall(alert: Alert, autoVoiceCall?: boolean): Promise<void> {
    const enabled = autoVoiceCall ?? this.configService.get<boolean>('app.alerts.autoVoiceCall', true);
    if (!enabled) return;
    if (!AlertVoiceCallService.isVoiceCallSupported(alert.type)) return;
    if (!alert.clientId) {
      this.logger.warn(`Alerte ${alert.reference} sans client rattache : appel vocal impossible.`);
      return;
    }

    try {
      await this.alertVoiceCall.startForAlert(alert);
    } catch (error) {
      this.logger.error(
        `Appel vocal non declenche pour ${alert.reference} : ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * SMS d'information au client, en parallele de l'appel vocal.
   *
   * Le SMS part quel que soit le sort de l'appel : c'est lui qui laisse une
   * trace ecrite si le client ne decroche pas. Un echec d'envoi ne doit jamais
   * empecher la creation de l'alerte.
   */
  private async maybeNotifyBySms(alert: Alert): Promise<void> {
    if (!this.configService.get<boolean>('app.sms.enabled', true)) return;

    try {
      await this.alertSms.notifyAlertRaised(alert);
    } catch (error) {
      this.logger.error(
        `SMS non envoye pour ${alert.reference} : ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async findGroupableAlert(input: CreateAlertInput): Promise<Alert | null> {
    if (!input.deviceId || !shouldGroupOccurrence(input.type)) return null;

    const windowSeconds = this.configService.get<number>('app.alerts.groupingWindowSeconds', 120);
    const since = new Date(Date.now() - windowSeconds * 1_000);

    return this.alertRepository
      .createQueryBuilder('alert')
      .where('alert.deviceId = :deviceId', { deviceId: input.deviceId })
      .andWhere('alert.type = :type', { type: input.type })
      .andWhere('alert.subDeviceCode IS NOT DISTINCT FROM :code', { code: input.subDeviceCode ?? null })
      .andWhere('alert.status IN (:...statuses)', { statuses: OPEN_STATUSES })
      .andWhere('alert.lastOccurrenceAt >= :since', { since })
      .orderBy('alert.lastOccurrenceAt', 'DESC')
      .getOne();
  }

  private async registerOccurrence(alert: Alert, input: CreateAlertInput): Promise<Alert> {
    alert.occurrenceCount += 1;
    alert.lastOccurrenceAt = new Date();
    if (input.triggerMessage) alert.triggerMessage = input.triggerMessage;
    const saved = await this.alertRepository.save(alert);

    await this.alertLifecycle.recordEvent(saved.id, AlertEventType.NOTE_ADDED, {
      message: `Nouveau declenchement du meme capteur (${saved.occurrenceCount}e) : ${
        input.triggerMessage ?? 'sans description'
      }.`,
      data: { occurrenceCount: saved.occurrenceCount },
    });

    this.alertLifecycle.publish('alert.updated', saved, { occurrenceCount: saved.occurrenceCount });
    return this.alertLifecycle.loadAlertOrFail(saved.id, true);
  }

  private async persistWithReference(payload: Partial<Alert>, attempt = 0): Promise<Alert> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const createdToday = await this.alertRepository.count({
      where: { createdAt: MoreThanOrEqual(startOfDay) },
      withDeleted: true,
    });

    const alert = this.alertRepository.create({
      ...payload,
      reference: buildAlertReference(createdToday + 1 + attempt),
    });

    try {
      return await this.alertRepository.save(alert);
    } catch (error) {
      const isUniqueViolation =
        typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505';
      if (isUniqueViolation && attempt < 5) {
        return this.persistWithReference(payload, attempt + 1);
      }
      throw error;
    }
  }

  private async resolveDeviceOrganization(deviceId?: string | null): Promise<string | null> {
    if (!deviceId) return null;
    const device = await this.deviceRepository.findOne({ where: { id: deviceId } });
    return device?.organizationId ?? null;
  }

  /**
   * Applique le filtre de perimetre. Retourne `true` si l'utilisateur ne peut
   * rien voir (aucune organisation en portee, ou client sans profil).
   */
  private async applyAccessFilter(
    builder: SelectQueryBuilder<Alert>,
    actor: AuthenticatedUser,
  ): Promise<boolean> {
    if (this.isClientActor(actor)) {
      const profile = await this.clientRepository.findOne({ where: { userId: actor.id } });
      if (!profile) return true;
      builder.andWhere('alert.clientId = :ownClientId', { ownClientId: profile.id });
      return false;
    }

    const scope = await this.scopeService.getAccessibleOrganizationIds(actor);
    if (scope === null) return false;
    if (scope.length === 0) return true;

    builder.andWhere('alert.organizationId IN (:...scope)', { scope });
    return false;
  }

  private async assertCanAccessAlert(actor: AuthenticatedUser, alert: Alert): Promise<void> {
    if (this.isClientActor(actor)) {
      const profile = await this.clientRepository.findOne({ where: { userId: actor.id } });
      if (profile && alert.clientId === profile.id) return;
      throw new ForbiddenException('Acces refuse a cette alerte.');
    }

    if (!alert.organizationId) {
      const scope = await this.scopeService.getAccessibleOrganizationIds(actor);
      if (scope !== null) {
        throw new ForbiddenException('Acces refuse a cette alerte.');
      }
      return;
    }

    await this.scopeService.assertInScope(actor, alert.organizationId);
  }

  /** Un utilisateur n'ayant que le role CLIENT ne voit que ses propres alertes. */
  private isClientActor(actor: AuthenticatedUser): boolean {
    return (
      !actor.isSuperAdmin &&
      actor.roles.length > 0 &&
      actor.roles.every((role) => role === Role.CLIENT || role === Role.CLIENT_ADMIN)
    );
  }

  /** Nombre d'alertes ouvertes, utilise par les tableaux de bord. */
  async countOpen(actor: AuthenticatedUser): Promise<number> {
    const builder = this.alertRepository.createQueryBuilder('alert');
    const restricted = await this.applyAccessFilter(builder, actor);
    if (restricted) return 0;
    return builder.andWhere('alert.status IN (:...statuses)', { statuses: OPEN_STATUSES }).getCount();
  }

  /**
   * Stations d'intervention rattachees a une organisation (agence / PDC),
   * utilisees par l'interface de deploiement des equipes.
   */
  async listStations(actor: AuthenticatedUser, organizationId: string): Promise<Organization[]> {
    await this.scopeService.assertInScope(actor, organizationId);
    const organization = await this.organizationRepository.findOne({ where: { id: organizationId } });
    if (!organization) throw new NotFoundException('Organisation introuvable.');

    return this.organizationRepository
      .createQueryBuilder('organization')
      .where('organization.type = :type', { type: OrganizationType.STATION })
      .andWhere('organization.status != :archived', { archived: OrganizationStatus.ARCHIVED })
      .andWhere('(organization.path = :path OR organization.path LIKE :prefix)', {
        path: organization.path,
        prefix: `${organization.path}/%`,
      })
      .orderBy('organization.name', 'ASC')
      .getMany();
  }
}

export { ALERT_DETAIL_RELATIONS };
