import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AlertSeverity, AlertSource, AlertType } from '@common/enums/alert.enum';
import {
  HealthAccessAction,
  NurseRequestPriority,
  NurseRequestStatus,
} from '@common/enums/health.enum';
import { Role } from '@common/enums/role.enum';
import { HealthEventBus, HealthRealtimeEventType } from '@common/bus/health-event.bus';
import { buildPaginatedResult, PaginatedResult } from '@common/dto/pagination.dto';
import { AuthenticatedUser } from '@common/interfaces/authenticated-user.interface';
import {
  HealthReading,
  buildNurseRequestReference,
  isNurseRequestLate,
  nurseResponseDueAt,
  suggestPriority,
} from '@common/utils/health.util';
import { ClientProfile } from '@database/entities/client-profile.entity';
import {
  NurseRequest,
  NurseRequestMessage,
} from '@database/entities/nurse-request.entity';
import { AlertsService } from '@modules/alerts/alerts.service';
import {
  HealthAccessService,
  actorLabel,
  isHealthManager,
} from '@modules/healthcare/health-access.service';
import { HealthMeasurementsService } from '@modules/healthcare/health-measurements.service';
import { OrganizationScopeService } from '@modules/organizations/organizations.service';
import {
  CancelNurseRequestDto,
  CompleteNurseRequestDto,
  CreateNurseRequestDto,
  NurseRequestMessageDto,
  QueryNurseRequestsDto,
} from '@modules/healthcare/dto/health.dto';

const OPEN_STATUSES: NurseRequestStatus[] = [
  NurseRequestStatus.REQUESTED,
  NurseRequestStatus.ACCEPTED,
  NurseRequestStatus.IN_PROGRESS,
];

export interface NurseRequestView {
  id: string;
  reference: string;
  status: NurseRequestStatus;
  priority: NurseRequestPriority;
  reason: string;
  symptoms: string | null;
  client: { id: string; zengoId: string; fullName: string; primaryPhone: string };
  organizationId: string;
  requestedByLabel: string | null;
  createdAt: Date;
  acceptedAt: Date | null;
  assignedToLabel: string | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  resolution: string | null;
  advice: string | null;
  alertId: string | null;
  messages: NurseRequestMessage[];
  /** Echeance de prise en charge selon la priorite. */
  responseDueAt: Date;
  /** Prise en charge hors delai ou demandee depuis trop longtemps. */
  late: boolean;
}

export interface NurseRequestStats {
  total: number;
  byStatus: { status: NurseRequestStatus; total: number }[];
  byPriority: { priority: NurseRequestPriority; total: number }[];
  open: number;
  late: number;
  averageResponseMinutes: number | null;
  completedLast30Days: number;
}

/**
 * Demandes de soin et appels infirmiers.
 *
 * Le client (ou un agent pour son compte) ouvre une demande ; le personnel de
 * sante la prend en charge, echange dans le fil et la cloture avec une
 * conclusion et des conseils. Les demandes urgentes declenchent une alerte
 * medicale dans le pipeline du ZMC pour mobiliser les secours si necessaire.
 */
@Injectable()
export class NurseRequestsService {
  private readonly logger = new Logger(NurseRequestsService.name);

  constructor(
    @InjectRepository(NurseRequest)
    private readonly requestRepository: Repository<NurseRequest>,
    private readonly accessService: HealthAccessService,
    private readonly measurementsService: HealthMeasurementsService,
    private readonly alertsService: AlertsService,
    private readonly scopeServiceRef: OrganizationScopeService,
    private readonly healthBus: HealthEventBus,
  ) {}

  /** Ouvre une demande de soin pour un client du perimetre. */
  async create(
    actor: AuthenticatedUser,
    dto: CreateNurseRequestDto,
  ): Promise<NurseRequestView> {
    const client = await this.accessService.resolveClient(actor, dto.clientId);
    const isClientRole = actor.roles.includes(Role.CLIENT);
    if (!isClientRole) {
      this.accessService.assertHealthStaff(actor);
    }

    const open = await this.requestRepository.findOne({
      where: [
        { clientId: client.id, status: NurseRequestStatus.REQUESTED },
        { clientId: client.id, status: NurseRequestStatus.ACCEPTED },
        { clientId: client.id, status: NurseRequestStatus.IN_PROGRESS },
      ],
    });
    if (open) {
      throw new ConflictException(
        `Une demande de soin est deja ouverte pour ce client (${open.reference}).`,
      );
    }

    const priority = dto.priority ?? (await this.suggestPriorityForClient(client));
    const messages: NurseRequestMessage[] = [];
    if (dto.message) {
      messages.push({
        authorId: actor.id,
        authorLabel: actorLabel(actor),
        authorSide: isClientRole ? 'CLIENT' : 'HEALTH_STAFF',
        body: dto.message,
        at: new Date().toISOString(),
      });
    }

    const request = await this.persistWithReference(client, actor, () =>
      this.requestRepository.create({
        clientId: client.id,
        organizationId: client.organizationId,
        status: NurseRequestStatus.REQUESTED,
        priority,
        reason: dto.reason,
        symptoms: dto.symptoms ?? null,
        requestedById: actor.id,
        requestedByLabel: actorLabel(actor),
        messages,
        metadata: { source: isClientRole ? 'CLIENT_APP' : 'AGENT' },
      }),
    );

    if (priority === NurseRequestPriority.EMERGENCY) {
      const alert = await this.raiseEmergencyAlert(client, request);
      if (alert) {
        request.alertId = alert.id;
        await this.requestRepository.update(request.id, { alertId: alert.id });
      }
    }

    this.publish(
      HealthRealtimeEventType.NURSE_REQUEST_CREATED,
      client,
      request,
      `Nouvelle demande de soin (${request.reference}) — ${client.fullName}`,
    );

    await this.accessService.log({
      clientId: client.id,
      action: HealthAccessAction.SHARE,
      actor,
      reason: `Demande de soin ${request.reference} ouverte.`,
      detail: `${request.reason} (priorite ${request.priority}).`,
    });

    return this.toView(request, client);
  }

  /** File des demandes de soin, dans le perimetre de l'utilisateur. */
  async findAll(
    actor: AuthenticatedUser,
    query: QueryNurseRequestsDto,
  ): Promise<PaginatedResult<NurseRequestView>> {
    const builder = this.requestRepository
      .createQueryBuilder('request')
      .leftJoinAndSelect('request.client', 'client')
      .orderBy('request.createdAt', query.order === 'asc' ? 'ASC' : 'DESC')
      .skip(query.skip)
      .take(query.limit);

    const scope = await this.scopeService(actor);
    if (scope !== null) {
      if (scope.length === 0) {
        return buildPaginatedResult([], 0, query.page, query.limit);
      }
      builder.andWhere('request.organizationId IN (:...scope)', { scope });
    }
    if (query.clientId) {
      builder.andWhere('request.clientId = :clientId', {
        clientId: query.clientId,
      });
    }
    if (query.status) {
      builder.andWhere('request.status = :status', { status: query.status });
    }
    if (query.priority) {
      builder.andWhere('request.priority = :priority', {
        priority: query.priority,
      });
    }
    if (query.openOnly) {
      builder.andWhere('request.status IN (:...openStatuses)', {
        openStatuses: OPEN_STATUSES,
      });
    }
    if (query.mine) {
      builder.andWhere('request.assignedToId = :actorId', { actorId: actor.id });
    }
    if (query.search) {
      builder.andWhere(
        '(request.reference ILIKE :search OR client.fullName ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }

    const [rows, total] = await builder.getManyAndCount();
    return buildPaginatedResult(
      rows.map((row) => this.toView(row, row.client)),
      total,
      query.page,
      query.limit,
    );
  }

  /** Detail d'une demande de soin. */
  async findOne(
    actor: AuthenticatedUser,
    id: string,
  ): Promise<NurseRequestView> {
    const request = await this.load(id);
    await this.accessService.resolveClient(actor, request.clientId);
    return this.toView(request, request.client);
  }

  /** Demandes de soin d'un client (historique de sante). */
  async forClient(
    actor: AuthenticatedUser,
    clientId: string,
  ): Promise<NurseRequestView[]> {
    const client = await this.accessService.resolveClient(actor, clientId);
    await this.accessService.assertReadAccess(actor, client, {});
    const requests = await this.requestRepository.find({
      where: { clientId: client.id },
      order: { createdAt: 'DESC' },
      take: 50,
    });
    return requests.map((request) => this.toView(request, client));
  }

  /** Prise en charge par le personnel de sante. */
  async accept(
    actor: AuthenticatedUser,
    id: string,
  ): Promise<NurseRequestView> {
    this.accessService.assertHealthManager(actor);
    const request = await this.load(id);
    if (
      request.status !== NurseRequestStatus.REQUESTED &&
      request.status !== NurseRequestStatus.ACCEPTED
    ) {
      throw new BadRequestException(
        `Une demande ${request.status} ne peut plus etre prise en charge.`,
      );
    }

    request.status = NurseRequestStatus.IN_PROGRESS;
    request.assignedToId = actor.id;
    request.assignedToLabel = actorLabel(actor);
    request.acceptedAt = request.acceptedAt ?? new Date();
    request.messages = [
      ...request.messages,
      this.systemMessage(
        `Prise en charge par ${actorLabel(actor)}.`,
      ),
    ];
    const saved = await this.requestRepository.save(request);

    this.publish(
      HealthRealtimeEventType.NURSE_REQUEST_UPDATED,
      request.client,
      saved,
      `Demande ${saved.reference} prise en charge par ${actorLabel(actor)}.`,
    );
    await this.accessService.log({
      clientId: request.clientId,
      action: HealthAccessAction.VIEW,
      actor,
      reason: `Prise en charge de la demande de soin ${saved.reference}.`,
    });

    return this.toView(saved, saved.client);
  }

  /** Ajout d'un message au fil de la demande. */
  async addMessage(
    actor: AuthenticatedUser,
    id: string,
    dto: NurseRequestMessageDto,
  ): Promise<NurseRequestView> {
    const request = await this.load(id);
    const client = await this.accessService.resolveClient(actor, request.clientId);
    const isClientRole = actor.roles.includes(Role.CLIENT);
    if (!isClientRole) {
      this.accessService.assertHealthManager(actor);
    }
    if (this.isClosed(request)) {
      throw new BadRequestException(
        'Cette demande est cloturee : ouvrez une nouvelle demande de soin.',
      );
    }

    request.messages = [
      ...request.messages,
      {
        authorId: actor.id,
        authorLabel: actorLabel(actor),
        authorSide: isClientRole ? 'CLIENT' : 'HEALTH_STAFF',
        body: dto.body,
        at: new Date().toISOString(),
      },
    ];
    const saved = await this.requestRepository.save(request);

    this.publish(
      HealthRealtimeEventType.NURSE_REQUEST_MESSAGE,
      client,
      saved,
      `Nouveau message sur la demande ${saved.reference}.`,
    );

    return this.toView(saved, client);
  }

  /** Cloture de la demande avec conclusion et conseils. */
  async complete(
    actor: AuthenticatedUser,
    id: string,
    dto: CompleteNurseRequestDto,
  ): Promise<NurseRequestView> {
    this.accessService.assertHealthManager(actor);
    const request = await this.load(id);
    if (this.isClosed(request)) {
      throw new BadRequestException('Cette demande est deja cloturee.');
    }

    request.status = NurseRequestStatus.COMPLETED;
    request.completedAt = new Date();
    request.resolution = dto.resolution;
    request.advice = dto.advice ?? null;
    request.assignedToId = request.assignedToId ?? actor.id;
    request.assignedToLabel = request.assignedToLabel ?? actorLabel(actor);
    request.acceptedAt = request.acceptedAt ?? new Date();
    request.messages = [
      ...request.messages,
      this.systemMessage(
        `Demande cloturee par ${actorLabel(actor)} : ${dto.resolution}`,
      ),
    ];
    const saved = await this.requestRepository.save(request);

    this.publish(
      HealthRealtimeEventType.NURSE_REQUEST_UPDATED,
      request.client,
      saved,
      `Demande ${saved.reference} cloturee.`,
    );
    await this.accessService.log({
      clientId: request.clientId,
      action: HealthAccessAction.VIEW,
      actor,
      reason: `Cloture de la demande de soin ${saved.reference}.`,
      detail: dto.resolution,
    });

    return this.toView(saved, saved.client);
  }

  /** Annulation par le demandeur (ou la direction). */
  async cancel(
    actor: AuthenticatedUser,
    id: string,
    dto: CancelNurseRequestDto,
  ): Promise<NurseRequestView> {
    const request = await this.load(id);
    const isRequester = request.requestedById === actor.id;
    if (!isRequester && !isHealthManager(actor)) {
      throw new ForbiddenException(
        'Seul le demandeur ou le personnel de sante peut annuler cette demande.',
      );
    }
    if (this.isClosed(request)) {
      throw new BadRequestException('Cette demande est deja cloturee.');
    }

    request.status = NurseRequestStatus.CANCELLED;
    request.cancelledAt = new Date();
    request.resolution = dto.reason;
    request.messages = [
      ...request.messages,
      this.systemMessage(
        `Demande annulee par ${actorLabel(actor)} : ${dto.reason}`,
      ),
    ];
    const saved = await this.requestRepository.save(request);

    this.publish(
      HealthRealtimeEventType.NURSE_REQUEST_UPDATED,
      request.client,
      saved,
      `Demande ${saved.reference} annulee.`,
    );

    return this.toView(saved, saved.client);
  }

  /** Indicateurs du centre de sante. */
  async stats(actor: AuthenticatedUser): Promise<NurseRequestStats> {
    const scope = await this.scopeService(actor);
    const builder = this.requestRepository.createQueryBuilder('request');
    if (scope !== null) {
      if (scope.length === 0) {
        return {
          total: 0,
          byStatus: [],
          byPriority: [],
          open: 0,
          late: 0,
          averageResponseMinutes: null,
          completedLast30Days: 0,
        };
      }
      builder.where('request.organizationId IN (:...scope)', { scope });
    }

    const total = await builder.getCount();
    const statusRows = await builder
      .clone()
      .select('request.status', 'status')
      .addSelect('COUNT(*)', 'total')
      .groupBy('request.status')
      .getRawMany<{ status: NurseRequestStatus; total: string }>();
    const priorityRows = await builder
      .clone()
      .select('request.priority', 'priority')
      .addSelect('COUNT(*)', 'total')
      .groupBy('request.priority')
      .getRawMany<{ priority: NurseRequestPriority; total: string }>();

    const openRequests = await builder
      .clone()
      .andWhere('request.status IN (:...openStatuses)', {
        openStatuses: OPEN_STATUSES,
      })
      .getMany();

    const late = openRequests.filter((request) =>
      isNurseRequestLate(
        { createdAt: request.createdAt, priority: request.priority },
        request.acceptedAt,
      ),
    ).length;

    const accepted = await builder
      .clone()
      .andWhere('request.acceptedAt IS NOT NULL')
      .getMany();
    const responseMinutes = accepted
      .map(
        (request) =>
          (request.acceptedAt as Date).getTime() -
          request.createdAt.getTime(),
      )
      .filter((delta) => delta >= 0);
    const averageResponseMinutes =
      responseMinutes.length > 0
        ? Math.round(
            responseMinutes.reduce((sum, delta) => sum + delta, 0) /
              responseMinutes.length /
              60000,
          )
        : null;

    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const completedLast30Days = await builder
      .clone()
      .andWhere('request.status = :completed', {
        completed: NurseRequestStatus.COMPLETED,
      })
      .andWhere('request.completedAt >= :since30d', { since30d })
      .getCount();

    return {
      total,
      byStatus: statusRows.map((row) => ({
        status: row.status,
        total: Number(row.total),
      })),
      byPriority: priorityRows.map((row) => ({
        priority: row.priority,
        total: Number(row.total),
      })),
      open: openRequests.length,
      late,
      averageResponseMinutes,
      completedLast30Days,
    };
  }

  /** Demandes de soin non cloturees, pour les relances automatiques. */
  async findOpenRequests(): Promise<NurseRequest[]> {
    return this.requestRepository.find({
      where: [
        { status: NurseRequestStatus.REQUESTED },
        { status: NurseRequestStatus.ACCEPTED },
        { status: NurseRequestStatus.IN_PROGRESS },
      ],
      relations: ['client'],
    });
  }

  /** Priorite suggeree a partir des dernieres mesures du client. */
  private async suggestPriorityForClient(
    client: ClientProfile,
  ): Promise<NurseRequestPriority> {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const measurements = await this.measurementsService.criticalForClient(
      client.id,
      since,
    );
    if (measurements.length > 0) return NurseRequestPriority.EMERGENCY;

    const recent = await this.measurementsService.readingsForClient(client.id, {
      from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      limit: 20,
    });
    if (recent.length === 0) return NurseRequestPriority.URGENT;

    const readings: HealthReading[] = recent.map((measurement) => ({
      metric: measurement.metric,
      value: Number(measurement.value),
      secondaryValue:
        measurement.secondaryValue === null
          ? null
          : Number(measurement.secondaryValue),
      measuredAt: measurement.measuredAt,
    }));
    return suggestPriority(readings) as NurseRequestPriority;
  }

  private async raiseEmergencyAlert(
    client: ClientProfile,
    request: NurseRequest,
  ): Promise<{ id: string } | null> {
    try {
      return await this.alertsService.create({
        type: AlertType.MEDICAL,
        source: AlertSource.AUTOMATION,
        severity: AlertSeverity.CRITICAL,
        clientId: client.id,
        organizationId: client.organizationId,
        triggerMessage: `Urgence de sante declaree (${request.reference}) : ${request.reason}`,
        autoVoiceCall: false,
        metadata: {
          origin: 'NURSE_REQUEST',
          nurseRequestId: request.id,
          reference: request.reference,
        },
      });
    } catch (error) {
      this.logger.error(
        `Echec de creation de l'alerte medicale pour la demande ${request.reference}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  private async load(id: string): Promise<NurseRequest> {
    const request = await this.requestRepository.findOne({
      where: { id },
      relations: ['client'],
    });
    if (!request) {
      throw new NotFoundException('Demande de soin introuvable.');
    }
    return request;
  }

  /**
   * Persiste la demande en generant une reference journaliere unique.
   * Une collision concurrente (`23505`) relance la generation avec le compteur
   * suivant, sans jamais reutiliser un numero deja attribue.
   */
  private async persistWithReference(
    client: ClientProfile,
    actor: AuthenticatedUser,
    build: () => NurseRequest,
  ): Promise<NurseRequest> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const sequence = await this.nextSequence();
      const request = build();
      request.reference = buildNurseRequestReference(new Date(), sequence);
      request.requestedById = request.requestedById ?? actor.id;

      try {
        return await this.requestRepository.save(request);
      } catch (error) {
        if (
          error instanceof Error &&
          'code' in error &&
          (error as { code?: string }).code === '23505'
        ) {
          this.logger.warn(
            `Reference ${request.reference} deja utilisee, nouvelle tentative.`,
          );
          continue;
        }
        throw error;
      }
    }
    throw new ConflictException(
      'Impossible de generer une reference unique pour cette demande de soin.',
    );
  }

  /** Compteur du jour, calcule sur les demandes deja enregistrees. */
  private async nextSequence(): Promise<number> {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    const today = await this.requestRepository
      .createQueryBuilder('request')
      .where('request.createdAt >= :start', { start })
      .getCount();
    return today + 1;
  }

  private async scopeService(
    actor: AuthenticatedUser,
  ): Promise<string[] | null> {
    return this.scopeServiceRef.getAccessibleOrganizationIds(actor);
  }

  private isClosed(request: NurseRequest): boolean {
    return (
      request.status === NurseRequestStatus.COMPLETED ||
      request.status === NurseRequestStatus.CANCELLED
    );
  }

  private systemMessage(body: string): NurseRequestMessage {
    return {
      authorId: null,
      authorLabel: 'Systeme',
      authorSide: 'SYSTEM',
      body,
      at: new Date().toISOString(),
    };
  }

  private publish(
    type: HealthRealtimeEventType,
    client: ClientProfile | undefined,
    request: NurseRequest,
    message: string,
  ): void {
    this.healthBus.publish({
      type,
      clientId: request.clientId,
      clientName: client?.fullName ?? request.client?.fullName ?? 'Client Zengo',
      organizationId: request.organizationId,
      entityId: request.id,
      reference: request.reference,
      message,
      payload: {
        status: request.status,
        priority: request.priority,
        alertId: request.alertId,
      },
      occurredAt: new Date().toISOString(),
    });
  }

  private toView(
    request: NurseRequest,
    client?: ClientProfile | null,
  ): NurseRequestView {
    const resolved = client ?? request.client;
    return {
      id: request.id,
      reference: request.reference,
      status: request.status,
      priority: request.priority,
      reason: request.reason,
      symptoms: request.symptoms,
      client: {
        id: request.clientId,
        zengoId: resolved?.zengoId ?? '',
        fullName: resolved?.fullName ?? 'Client Zengo',
        primaryPhone: resolved?.primaryPhone ?? '',
      },
      organizationId: request.organizationId,
      requestedByLabel: request.requestedByLabel,
      createdAt: request.createdAt,
      acceptedAt: request.acceptedAt,
      assignedToLabel: request.assignedToLabel,
      completedAt: request.completedAt,
      cancelledAt: request.cancelledAt,
      resolution: request.resolution,
      advice: request.advice,
      alertId: request.alertId,
      messages: request.messages ?? [],
      responseDueAt: nurseResponseDueAt(request.createdAt, request.priority),
      late: isNurseRequestLate(
        { createdAt: request.createdAt, priority: request.priority },
        request.acceptedAt,
      ),
    };
  }
}
