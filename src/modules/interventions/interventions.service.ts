import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThanOrEqual, Repository } from 'typeorm';
import { InterventionEventBus } from '@common/bus/intervention-event.bus';
import { PaginatedResult, buildPaginatedResult } from '@common/dto/pagination.dto';
import { AlertEventType, AlertResolution, AlertStatus, DispatchStatus } from '@common/enums/alert.enum';
import {
  FieldTeamStatus,
  InterventionOutcome,
  InterventionStatus,
} from '@common/enums/intervention.enum';
import { AuthenticatedUser } from '@common/interfaces/authenticated-user.interface';
import { describeDistance, estimateEtaMinutes, haversineMeters, isValidCoordinate } from '@common/utils/geo.util';
import {
  buildInterventionReference,
  canTransitionIntervention,
  computeInterventionDurationSeconds,
  isOpenInterventionStatus,
  isTerminalInterventionStatus,
  nextStatusesFor,
  pickNearestTeam,
  shouldWarnArrivalLate,
  shouldWarnDepartureLate,
} from '@common/utils/intervention-rules';
import { saveColumns } from '@common/utils/persistence.util';
import { AlertDispatch } from '@database/entities/alert-dispatch.entity';
import { Alert } from '@database/entities/alert.entity';
import { FieldTeam } from '@database/entities/field-team.entity';
import { InterventionReport } from '@database/entities/intervention-report.entity';
import { Intervention } from '@database/entities/intervention.entity';
import { Organization } from '@database/entities/organization.entity';
import { TeamPosition } from '@database/entities/team-position.entity';
import { AlertLifecycleService } from '@modules/alerts/alert-lifecycle.service';
import {
  AbortInterventionDto,
  CreateInterventionDto,
  CreateInterventionReportDto,
  QueryInterventionsDto,
} from '@modules/interventions/dto/intervention.dto';
import { FieldTeamsService } from '@modules/interventions/field-teams.service';
import { OrganizationScopeService } from '@modules/organizations/organizations.service';

const INTERVENTION_RELATIONS = {
  alert: { client: true, organization: true },
  team: { station: true },
  station: true,
  dispatch: true,
  report: true,
};

/**
 * Conclusion du rapport -> cloture de l'alerte.
 *
 * Le rapport de terrain fait foi : il porte le compte rendu officiel et, sauf
 * demande contraire, cloture l'alerte avec le classement correspondant.
 */
const ALERT_CLOSURE_BY_OUTCOME: Record<InterventionOutcome, { status: AlertStatus; resolution: AlertResolution }> = {
  [InterventionOutcome.RESOLVED_ON_SITE]: {
    status: AlertStatus.RESOLVED,
    resolution: AlertResolution.HANDLED_BY_TEAM,
  },
  [InterventionOutcome.FALSE_ALARM_ON_SITE]: {
    status: AlertStatus.FALSE_ALARM,
    resolution: AlertResolution.NO_ACTION_REQUIRED,
  },
  [InterventionOutcome.NO_ACTION_REQUIRED]: {
    status: AlertStatus.RESOLVED,
    resolution: AlertResolution.NO_ACTION_REQUIRED,
  },
  [InterventionOutcome.DAMAGE_REPORTED]: {
    status: AlertStatus.RESOLVED,
    resolution: AlertResolution.HANDLED_BY_TEAM,
  },
  [InterventionOutcome.HANDOVER_TO_AUTHORITIES]: {
    status: AlertStatus.RESOLVED,
    resolution: AlertResolution.HANDLED_BY_TEAM,
  },
  [InterventionOutcome.CLIENT_ABSENT]: {
    status: AlertStatus.RESOLVED,
    resolution: AlertResolution.NO_ACTION_REQUIRED,
  },
  [InterventionOutcome.EQUIPMENT_ISSUE]: {
    status: AlertStatus.FALSE_ALARM,
    resolution: AlertResolution.TECHNICAL_ISSUE,
  },
};

/**
 * Missions d'intervention terrain.
 *
 * Enchaine le cycle : affectation d'une equipe (manuelle ou automatique par
 * distance), suivi du trajet, arrivee sur site, rapport de fin d'intervention et
 * cloture de l'alerte. Chaque etape alimente la chronologie de l'alerte et le
 * canal temps reel.
 */
@Injectable()
export class InterventionsService {
  private readonly logger = new Logger(InterventionsService.name);

  constructor(
    @InjectRepository(Intervention)
    private readonly interventionRepository: Repository<Intervention>,
    @InjectRepository(InterventionReport)
    private readonly reportRepository: Repository<InterventionReport>,
    @InjectRepository(AlertDispatch)
    private readonly dispatchRepository: Repository<AlertDispatch>,
    @InjectRepository(TeamPosition)
    private readonly positionRepository: Repository<TeamPosition>,
    @InjectRepository(Organization)
    private readonly organizationRepository: Repository<Organization>,
    private readonly alertLifecycle: AlertLifecycleService,
    private readonly fieldTeams: FieldTeamsService,
    private readonly scopeService: OrganizationScopeService,
    private readonly configService: ConfigService,
    private readonly interventionEventBus: InterventionEventBus,
  ) {}

  // ---------------------------------------------------------------------------
  // Affectation
  // ---------------------------------------------------------------------------

  /**
   * Engage une equipe sur une alerte.
   *
   * Sans `teamId`, l'affectation est automatique : equipe disponible la plus
   * proche dont la specialite correspond au type d'alerte. L'alerte passe en
   * `ASSIGNED` (et gagne l'accuse de prise en charge si elle etait nouvelle).
   */
  async create(actor: AuthenticatedUser, dto: CreateInterventionDto): Promise<Intervention> {
    const alert = await this.alertLifecycle.loadAlertOrFail(dto.alertId, true);
    await this.assertAlertInScope(actor, alert);

    if (isTerminalAlertStatus(alert.status)) {
      throw new BadRequestException('Alerte deja cloturee : aucune mission ne peut etre engagee.');
    }

    const destination = await this.resolveDestination(alert);

    const team = dto.teamId
      ? await this.resolveRequestedTeam(actor, dto.teamId)
      : await this.resolveNearestTeam(actor, alert, destination);

    let distanceMeters: number | null = null;
    let etaMinutes: number | null = null;
    if (destination && isValidCoordinate(team.currentLatitude, team.currentLongitude)) {
      distanceMeters = haversineMeters(
        { latitude: team.currentLatitude as number, longitude: team.currentLongitude as number },
        destination,
      );
      etaMinutes = estimateEtaMinutes(
        distanceMeters,
        this.configService.get<number>('app.interventions.averageSpeedKmh', 28),
      );
    }

    await this.assertNoOpenMission(alert.id, team.id);
    this.assertTeamEngageable(team);

    const intervention = await this.persistWithReference({
      alertId: alert.id,
      dispatchId: dto.dispatchId ?? null,
      teamId: team.id,
      stationId: team.stationId,
      status: InterventionStatus.ASSIGNED,
      destinationLabel: alert.address,
      city: alert.city,
      latitude: alert.latitude,
      longitude: alert.longitude,
      distanceMeters,
      etaMinutes,
      assignedById: actor.id,
      assignedByLabel: `${actor.firstName} ${actor.lastName}`.trim(),
      autoAssigned: !dto.teamId,
      notes: dto.note ?? null,
    });

    await this.fieldTeams.markEngaged(team.id);
    await this.linkDispatch(alert.id, team.stationId, actor.id, dto.dispatchId);
    await this.syncAlertOnAssignment(actor, alert);

    await this.alertLifecycle.recordEvent(alert.id, AlertEventType.DISPATCHED, {
      message: `Equipe ${team.name} engagee (${intervention.reference}${
        distanceMeters !== null ? `, ${describeDistance(distanceMeters)}` : ''
      }).`,
      actor: AlertLifecycleService.actorFrom(actor),
      data: {
        interventionId: intervention.id,
        interventionReference: intervention.reference,
        teamId: team.id,
        teamName: team.name,
        autoAssigned: intervention.autoAssigned,
        distanceMeters,
        etaMinutes,
      },
    });

    this.alertLifecycle.publish('alert.updated', alert, {
      interventionId: intervention.id,
      teamName: team.name,
      status: alert.status,
    });

    this.publish(intervention, 'intervention.assigned', { teamName: team.name, distanceMeters, etaMinutes });

    this.logger.log(
      `Mission ${intervention.reference} : equipe ${team.name} engagee sur ${alert.reference}${
        intervention.autoAssigned ? ' (affectation automatique)' : ''
      }.`,
    );

    return this.loadOrFail(intervention.id);
  }

  // ---------------------------------------------------------------------------
  // Deroulement de la mission
  // ---------------------------------------------------------------------------

  /** Confirme le depart de l'equipe (passage en route). */
  async markEnRoute(actor: AuthenticatedUser, id: string, note?: string): Promise<Intervention> {
    return this.transition(actor, id, InterventionStatus.EN_ROUTE, note);
  }

  /** Confirme l'arrivee sur site : l'alerte passe en intervention en cours. */
  async markOnSite(actor: AuthenticatedUser, id: string, note?: string): Promise<Intervention> {
    return this.transition(actor, id, InterventionStatus.ON_SITE, note);
  }

  private async transition(
    actor: AuthenticatedUser,
    id: string,
    target: InterventionStatus,
    note?: string,
  ): Promise<Intervention> {
    const intervention = await this.loadOrFail(id);
    await this.assertInScope(actor, intervention);

    if (!canTransitionIntervention(intervention.status, target)) {
      throw new BadRequestException(
        `Transition impossible de ${intervention.status} vers ${target} (statuts autorises : ${
          nextStatusesFor(intervention.status).join(', ') || 'aucun'
        }).`,
      );
    }

    const now = new Date();
    intervention.status = target;
    if (note) intervention.notes = note;
    if (target === InterventionStatus.EN_ROUTE) intervention.enRouteAt = now;
    if (target === InterventionStatus.ON_SITE) intervention.onSiteAt = now;

    await saveColumns(this.interventionRepository, intervention);

    const alert = await this.alertLifecycle.loadAlertOrFail(intervention.alertId);
    if (target === InterventionStatus.ON_SITE && isOpenAlertStatus(alert.status) && alert.status !== AlertStatus.IN_PROGRESS) {
      alert.status = AlertStatus.IN_PROGRESS;
      await this.alertLifecycle.save(alert);
    }

    await this.alertLifecycle.recordEvent(alert.id, AlertEventType.STATUS_CHANGED, {
      message:
        target === InterventionStatus.EN_ROUTE
          ? `Equipe ${intervention.team?.name ?? ''} en route vers le site.`.trim()
          : `Equipe ${intervention.team?.name ?? ''} arrivee sur place.`.trim(),
      actor: AlertLifecycleService.actorFrom(actor),
      data: { interventionId: intervention.id, status: target },
    });

    this.alertLifecycle.publish('alert.updated', alert, { interventionId: intervention.id, status: alert.status });
    this.publish(intervention, 'intervention.status_changed', { status: target, note: note ?? null });

    return this.loadOrFail(id);
  }

  /** Abandon d'une mission (faux positif, annulation client, doublon...). */
  async abort(actor: AuthenticatedUser, id: string, dto: AbortInterventionDto): Promise<Intervention> {
    const intervention = await this.loadOrFail(id);
    await this.assertInScope(actor, intervention);

    if (isTerminalInterventionStatus(intervention.status)) {
      throw new BadRequestException('Mission deja cloturee.');
    }

    const now = new Date();
    intervention.status = InterventionStatus.ABORTED;
    intervention.abortedAt = now;
    intervention.abortReason = dto.reason;
    if (dto.note) intervention.notes = dto.note;
    await saveColumns(this.interventionRepository, intervention);

    await this.fieldTeams.markAvailable(intervention.teamId);

    const alert = await this.alertLifecycle.loadAlertOrFail(intervention.alertId);
    await this.alertLifecycle.recordEvent(alert.id, AlertEventType.STATUS_CHANGED, {
      message: `Mission ${intervention.reference} abandonnee (${dto.reason.toLowerCase().replace(/_/g, ' ')}).`,
      actor: AlertLifecycleService.actorFrom(actor),
      data: { interventionId: intervention.id, reason: dto.reason },
    });
    this.alertLifecycle.publish('alert.updated', alert, { interventionId: intervention.id, status: alert.status });

    this.publish(intervention, 'intervention.aborted', { reason: dto.reason, note: dto.note ?? null });
    return this.loadOrFail(id);
  }

  /**
   * Rapport de fin d'intervention : cloture la mission, libere l'equipe,
   * marque l'affectation station comme terminee et, par defaut, cloture
   * l'alerte avec le classement correspondant a la conclusion.
   */
  async submitReport(
    actor: AuthenticatedUser,
    id: string,
    dto: CreateInterventionReportDto,
  ): Promise<Intervention> {
    const intervention = await this.loadOrFail(id);
    await this.assertInScope(actor, intervention);

    if (isTerminalInterventionStatus(intervention.status)) {
      throw new BadRequestException('Mission deja cloturee : le rapport a ete depose.');
    }

    const now = new Date();
    const existing = await this.reportRepository.findOne({ where: { interventionId: intervention.id } });
    if (existing) throw new ConflictException('Un rapport existe deja pour cette mission.');

    const durationSeconds = computeInterventionDurationSeconds(
      intervention.enRouteAt ?? intervention.assignedAt,
      now,
    );

    const report = await this.reportRepository.save(
      this.reportRepository.create({
        interventionId: intervention.id,
        outcome: dto.outcome,
        summary: dto.summary.trim(),
        actionsTaken: dto.actionsTaken ?? null,
        damages: dto.damages ?? null,
        peopleAssisted: dto.peopleAssisted ?? 0,
        photos: dto.photos ?? [],
        signatureName: dto.signatureName ?? null,
        signedAt: dto.signatureName ? now : null,
        durationSeconds,
        createdById: actor.id,
        createdByLabel: `${actor.firstName} ${actor.lastName}`.trim(),
        clientNotified: dto.clientNotified ?? false,
      }),
    );

    intervention.status = InterventionStatus.COMPLETED;
    intervention.completedAt = now;
    await saveColumns(this.interventionRepository, intervention);

    await this.fieldTeams.markAvailable(intervention.teamId);
    await this.completeDispatches(intervention);

    const alert = await this.alertLifecycle.loadAlertOrFail(intervention.alertId);
    const closeAlert = dto.closeAlert ?? true;

    if (closeAlert && !isTerminalAlertStatus(alert.status)) {
      const closure = ALERT_CLOSURE_BY_OUTCOME[dto.outcome];
      alert.status = closure.status;
      alert.resolution = closure.resolution;
      alert.resolutionNote = report.summary;
      alert.resolvedAt = now;
      alert.resolvedById = actor.id;
      await this.alertLifecycle.save(alert);

      await this.alertLifecycle.recordEvent(alert.id, AlertEventType.RESOLVED, {
        message: `Rapport de mission ${intervention.reference} : ${report.summary}`,
        actor: AlertLifecycleService.actorFrom(actor),
        data: { interventionId: intervention.id, outcome: dto.outcome, photos: report.photos.length },
      });

      this.alertLifecycle.publish('alert.resolved', alert, {
        interventionId: intervention.id,
        outcome: dto.outcome,
        resolution: closure.resolution,
      });
    } else {
      await this.alertLifecycle.recordEvent(alert.id, AlertEventType.NOTE_ADDED, {
        message: `Rapport de mission ${intervention.reference} : ${report.summary}`,
        actor: AlertLifecycleService.actorFrom(actor),
        data: { interventionId: intervention.id, outcome: dto.outcome, alertKeptOpen: true },
      });
      this.alertLifecycle.publish('alert.updated', alert, { interventionId: intervention.id });
    }

    this.publish(intervention, 'intervention.completed', {
      outcome: dto.outcome,
      durationSeconds,
      photos: report.photos.length,
      alertClosed: closeAlert,
    });

    this.logger.log(
      `Mission ${intervention.reference} cloturee (${dto.outcome})${closeAlert ? ` - alerte ${alert.reference} classee` : ''}.`,
    );

    return this.loadOrFail(id);
  }

  // ---------------------------------------------------------------------------
  // Consultation
  // ---------------------------------------------------------------------------

  async findAll(actor: AuthenticatedUser, query: QueryInterventionsDto): Promise<PaginatedResult<Intervention>> {
    const builder = this.interventionRepository
      .createQueryBuilder('intervention')
      .leftJoinAndSelect('intervention.alert', 'alert')
      .leftJoinAndSelect('alert.client', 'client')
      .leftJoinAndSelect('intervention.team', 'team')
      .leftJoinAndSelect('intervention.station', 'station')
      .leftJoinAndSelect('intervention.report', 'report');

    const scope = await this.scopeService.getAccessibleOrganizationIds(actor);
    if (scope !== null) {
      if (scope.length === 0) return buildPaginatedResult<Intervention>([], 0, query.page, query.limit);
      builder.andWhere('intervention.stationId IN (:...scope)', { scope });
    }

    if (query.status) builder.andWhere('intervention.status = :status', { status: query.status });
    if (query.openOnly) {
      builder.andWhere('intervention.status IN (:...openStatuses)', {
        openStatuses: [
          InterventionStatus.ASSIGNED,
          InterventionStatus.EN_ROUTE,
          InterventionStatus.ON_SITE,
        ],
      });
    }
    if (query.alertId) builder.andWhere('intervention.alertId = :alertId', { alertId: query.alertId });
    if (query.teamId) builder.andWhere('intervention.teamId = :teamId', { teamId: query.teamId });
    if (query.stationId) builder.andWhere('intervention.stationId = :stationId', { stationId: query.stationId });
    if (query.organizationId) {
      const organization = await this.organizationRepository.findOne({ where: { id: query.organizationId } });
      if (!organization) throw new NotFoundException('Organisation introuvable.');
      builder.andWhere('(station.id = :organizationId OR station.path LIKE :organizationPath)', {
        organizationId: organization.id,
        organizationPath: `${organization.path}/%`,
      });
    }
    if (query.from) builder.andWhere('intervention.assignedAt >= :from', { from: new Date(query.from) });
    if (query.to) builder.andWhere('intervention.assignedAt <= :to', { to: new Date(query.to) });
    if (query.search) {
      builder.andWhere(
        '(intervention.reference ILIKE :search OR alert.reference ILIKE :search OR team.name ILIKE :search OR client.fullName ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }

    // Les missions en cours d'abord, puis les plus recentes.
    builder
      .addSelect(
        `CASE WHEN intervention.status IN ('ASSIGNED','EN_ROUTE','ON_SITE') THEN 0 ELSE 1 END`,
        'open_rank',
      )
      .orderBy('open_rank', 'ASC')
      .addOrderBy('intervention.assignedAt', query.order.toUpperCase() as 'ASC' | 'DESC')
      .skip(query.skip)
      .take(query.limit);

    const [items, total] = await builder.getManyAndCount();
    return buildPaginatedResult(items, total, query.page, query.limit);
  }

  async findOne(actor: AuthenticatedUser, id: string): Promise<Intervention> {
    const intervention = await this.loadOrFail(id);
    await this.assertInScope(actor, intervention);
    return intervention;
  }

  async listByAlert(actor: AuthenticatedUser, alertId: string): Promise<Intervention[]> {
    const alert = await this.alertLifecycle.loadAlertOrFail(alertId);
    await this.assertAlertInScope(actor, alert);
    return this.interventionRepository.find({
      where: { alertId },
      relations: { team: { station: true }, station: true, report: true },
      order: { assignedAt: 'DESC' },
    });
  }

  /** Trace GPS d'une mission : releves de l'equipe + position courante. */
  async track(actor: AuthenticatedUser, id: string) {
    const intervention = await this.findOne(actor, id);

    // Priorite aux releves rattaches explicitement a la mission : la trace ne
    // melange pas les trajets des missions precedentes de la meme equipe. Les
    // releves non rattaches restent un repli (equipes equipees d'un boitier
    // qui n'annonce pas la mission).
    const linked = await this.positionRepository.find({
      where: { interventionId: intervention.id },
      order: { recordedAt: 'ASC' },
      take: 200,
    });
    const positions = linked.length
      ? linked
      : await this.positionRepository.find({
          where: { teamId: intervention.teamId },
          order: { recordedAt: 'ASC' },
          take: 200,
        });

    const destination =
      isValidCoordinate(intervention.latitude, intervention.longitude)
        ? { latitude: intervention.latitude as number, longitude: intervention.longitude as number }
        : null;

    const teamPosition = isValidCoordinate(intervention.team?.currentLatitude, intervention.team?.currentLongitude)
      ? { latitude: intervention.team?.currentLatitude as number, longitude: intervention.team?.currentLongitude as number }
      : null;

    const remainingMeters =
      destination && teamPosition ? haversineMeters(teamPosition, destination) : null;

    return {
      interventionId: intervention.id,
      reference: intervention.reference,
      status: intervention.status,
      destination,
      teamPosition,
      remainingMeters,
      remainingEtaMinutes:
        remainingMeters === null
          ? null
          : estimateEtaMinutes(
              remainingMeters,
              this.configService.get<number>('app.interventions.averageSpeedKmh', 28),
            ),
      positions,
      positionCount: positions.length,
    };
  }

  /** Indicateurs de performance des interventions terrain. */
  async stats(actor: AuthenticatedUser, query: QueryInterventionsDto) {
    const builder = this.interventionRepository.createQueryBuilder('intervention');
    const scope = await this.scopeService.getAccessibleOrganizationIds(actor);

    if (scope !== null) {
      if (scope.length === 0) {
        return {
          total: 0,
          open: 0,
          byStatus: [],
          last24h: 0,
          averageResponseSeconds: null,
          averageDurationSeconds: null,
          completionRate: null,
          delayed: 0,
        };
      }
      builder.andWhere('intervention.stationId IN (:...scope)', { scope });
    }
    if (query.organizationId) {
      builder.andWhere('intervention.stationId = :organizationId', { organizationId: query.organizationId });
    }

    const byStatus = await builder
      .clone()
      .select('intervention.status', 'status')
      .addSelect('COUNT(*)::int', 'count')
      .groupBy('intervention.status')
      .getRawMany<{ status: InterventionStatus; count: number }>();

    const open = byStatus
      .filter((row) => isOpenInterventionStatus(row.status))
      .reduce((total, row) => total + row.count, 0);
    const completed = byStatus.find((row) => row.status === InterventionStatus.COMPLETED)?.count ?? 0;
    const aborted = byStatus.find((row) => row.status === InterventionStatus.ABORTED)?.count ?? 0;

    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const last24h = await builder.clone().andWhere('intervention.assignedAt >= :since', { since }).getCount();

    const performance = await builder
      .clone()
      .select('AVG(EXTRACT(EPOCH FROM (intervention.onSiteAt - intervention.assignedAt)))', 'responseSeconds')
      .addSelect('AVG(EXTRACT(EPOCH FROM (intervention.completedAt - intervention.assignedAt)))', 'durationSeconds')
      .where('intervention.onSiteAt IS NOT NULL OR intervention.completedAt IS NOT NULL')
      .getRawOne<{ responseSeconds: string | null; durationSeconds: string | null }>();

    const departureWarnMinutes = this.configService.get<number>('app.interventions.departureWarnMinutes', 5);
    const arrivalWarnMinutes = this.configService.get<number>('app.interventions.arrivalWarnMinutes', 45);
    const now = new Date();

    const openMissions = await builder
      .clone()
      .andWhere('intervention.status IN (:...openStatuses)', {
        openStatuses: [
          InterventionStatus.ASSIGNED,
          InterventionStatus.EN_ROUTE,
          InterventionStatus.ON_SITE,
        ],
      })
      .getMany();

    const delayed = openMissions.filter(
      (mission) =>
        shouldWarnDepartureLate(mission.assignedAt, now, departureWarnMinutes) ||
        shouldWarnArrivalLate(mission.enRouteAt, mission.onSiteAt, now, arrivalWarnMinutes),
    ).length;

    const closed = completed + aborted;

    return {
      total: byStatus.reduce((total, row) => total + row.count, 0),
      open,
      byStatus,
      last24h,
      averageResponseSeconds: performance?.responseSeconds ? Math.round(Number(performance.responseSeconds)) : null,
      averageDurationSeconds: performance?.durationSeconds ? Math.round(Number(performance.durationSeconds)) : null,
      completionRate: closed > 0 ? Number((completed / closed).toFixed(3)) : null,
      delayed,
    };
  }

  // ---------------------------------------------------------------------------
  // Watchdog
  // ---------------------------------------------------------------------------

  /**
   * Missions en souffrance : depart non confirme ou trajet anormalement long.
   * Retourne les missions a signaler au superviseur (utilise par le watchdog).
   */
  async findDelayedMissions(): Promise<Intervention[]> {
    const departureWarnMinutes = this.configService.get<number>('app.interventions.departureWarnMinutes', 5);
    const arrivalWarnMinutes = this.configService.get<number>('app.interventions.arrivalWarnMinutes', 45);
    const now = new Date();

    const openMissions = await this.interventionRepository.find({
      where: {
        status: In([InterventionStatus.ASSIGNED, InterventionStatus.EN_ROUTE, InterventionStatus.ON_SITE]),
      },
      relations: { team: true, alert: true },
    });

    return openMissions.filter(
      (mission) =>
        shouldWarnDepartureLate(mission.assignedAt, now, departureWarnMinutes) ||
        shouldWarnArrivalLate(mission.enRouteAt, mission.onSiteAt, now, arrivalWarnMinutes),
    );
  }

  /** Diffuse une alerte de retard (appele par le watchdog). */
  publishDelay(intervention: Intervention): void {
    const now = new Date();
    const departureWarnMinutes = this.configService.get<number>('app.interventions.departureWarnMinutes', 5);
    const arrivalWarnMinutes = this.configService.get<number>('app.interventions.arrivalWarnMinutes', 45);

    const reason = shouldWarnDepartureLate(intervention.assignedAt, now, departureWarnMinutes)
      ? 'DEPARTURE_NOT_CONFIRMED'
      : shouldWarnArrivalLate(intervention.enRouteAt, intervention.onSiteAt, now, arrivalWarnMinutes)
        ? 'ARRIVAL_LATE'
        : 'UNKNOWN';

    this.publish(intervention, 'intervention.delayed', {
      reason,
      assignedAt: intervention.assignedAt.toISOString(),
      enRouteAt: intervention.enRouteAt?.toISOString() ?? null,
      teamName: intervention.team?.name ?? null,
    });
  }

  // ---------------------------------------------------------------------------
  // Assistance interne
  // ---------------------------------------------------------------------------

  private async loadOrFail(id: string): Promise<Intervention> {
    const intervention = await this.interventionRepository.findOne({
      where: { id },
      relations: INTERVENTION_RELATIONS,
    });
    if (!intervention) throw new NotFoundException('Mission introuvable.');
    return intervention;
  }

  /**
   * L'equipe doit etre active et disponible. Volontairement separe du chargement
   * pour que le double engagement (409) soit signale avant l'indisponibilite.
   */
  private assertTeamEngageable(team: FieldTeam): void {
    if (!team.isActive) throw new BadRequestException(`L'equipe ${team.name} est desactivee.`);
    if (team.status !== FieldTeamStatus.AVAILABLE) {
      throw new BadRequestException(
        `L'equipe ${team.name} n'est pas disponible (statut : ${team.status.toLowerCase()}).`,
      );
    }
  }

  private async resolveRequestedTeam(actor: AuthenticatedUser, teamId: string): Promise<FieldTeam> {
    const team = await this.fieldTeams.loadTeamOrFail(teamId);
    await this.fieldTeams.assertInScope(actor, team.stationId);
    return team;
  }

  private async resolveNearestTeam(
    actor: AuthenticatedUser,
    alert: Alert,
    destination: { latitude: number; longitude: number } | null,
  ): Promise<FieldTeam> {
    const maxAgeMinutes = this.configService.get<number>('app.interventions.positionMaxAgeMinutes', 60);
    const candidates = await this.fieldTeams.listCandidates(actor, { alertType: alert.type });
    const nearest = pickNearestTeam(candidates, destination, { alertType: alert.type, maxAgeMinutes });

    if (!nearest) {
      throw new BadRequestException(
        destination
          ? "Aucune equipe disponible avec une position recente pour ce type d'alerte : designez une equipe manuellement."
          : "Ni le lieu de l'alerte ni son agence ne sont geolocalises : designez une equipe manuellement.",
      );
    }

    return this.fieldTeams.loadTeamOrFail(nearest.team.id);
  }

  /**
   * Point de reference de l'affectation : le lieu de l'alerte, a defaut le siege
   * de l'agence porteuse (les stations affectees sont de toute facon celles de
   * cette agence). Sans aucun repere, l'affectation reste manuelle.
   */
  private async resolveDestination(
    alert: Alert,
  ): Promise<{ latitude: number; longitude: number } | null> {
    if (isValidCoordinate(alert.latitude, alert.longitude)) {
      return { latitude: alert.latitude as number, longitude: alert.longitude as number };
    }
    if (!alert.organizationId) return null;

    const organization = await this.organizationRepository.findOne({
      where: { id: alert.organizationId },
      select: { id: true, latitude: true, longitude: true },
    });
    if (!organization || !isValidCoordinate(organization.latitude, organization.longitude)) return null;

    return {
      latitude: organization.latitude as number,
      longitude: organization.longitude as number,
    };
  }

  private async assertNoOpenMission(alertId: string, teamId: string): Promise<void> {
    const existing = await this.interventionRepository.findOne({
      where: {
        alertId,
        teamId,
        status: In([InterventionStatus.ASSIGNED, InterventionStatus.EN_ROUTE, InterventionStatus.ON_SITE]),
      },
    });
    if (existing) {
      throw new ConflictException('Cette equipe est deja engagee sur cette alerte.');
    }
  }

  /** L'affectation station passe en accusee reception des qu'une equipe part. */
  private async linkDispatch(
    alertId: string,
    stationId: string,
    actorId: string,
    dispatchId?: string,
  ): Promise<void> {
    const dispatch = dispatchId
      ? await this.dispatchRepository.findOne({ where: { id: dispatchId } })
      : await this.dispatchRepository.findOne({ where: { alertId, stationId } });

    if (!dispatch) return;
    if (
      dispatch.status === DispatchStatus.ACKNOWLEDGED ||
      dispatch.status === DispatchStatus.ARRIVED ||
      dispatch.status === DispatchStatus.COMPLETED
    ) {
      return;
    }

    dispatch.status = DispatchStatus.ACKNOWLEDGED;
    dispatch.respondedAt = new Date();
    dispatch.respondedById = actorId;
    await saveColumns(this.dispatchRepository, dispatch);
  }

  private async completeDispatches(intervention: Intervention): Promise<void> {
    const dispatch = intervention.dispatchId
      ? await this.dispatchRepository.findOne({ where: { id: intervention.dispatchId } })
      : await this.dispatchRepository.findOne({
          where: { alertId: intervention.alertId, stationId: intervention.stationId },
        });

    if (!dispatch) return;
    dispatch.status = DispatchStatus.COMPLETED;
    dispatch.respondedAt = dispatch.respondedAt ?? new Date();
    await saveColumns(this.dispatchRepository, dispatch);
  }

  private async syncAlertOnAssignment(actor: AuthenticatedUser, alert: Alert): Promise<void> {
    let changed = false;

    if (alert.status === AlertStatus.NEW) {
      alert.acknowledgedAt = alert.acknowledgedAt ?? new Date();
      alert.acknowledgedById = alert.acknowledgedById ?? actor.id;
      alert.status = AlertStatus.ASSIGNED;
      changed = true;
    } else if (alert.status === AlertStatus.ACKNOWLEDGED) {
      alert.status = AlertStatus.ASSIGNED;
      changed = true;
    }

    if (!alert.dispatchedAt) {
      alert.dispatchedAt = new Date();
      changed = true;
    }

    if (changed) await this.alertLifecycle.save(alert);
  }

  private async assertInScope(actor: AuthenticatedUser, intervention: Intervention): Promise<void> {
    const scope = await this.scopeService.getAccessibleOrganizationIds(actor);
    if (scope === null) return;
    if (scope.includes(intervention.stationId)) return;
    if (intervention.alert?.organizationId && scope.includes(intervention.alert.organizationId)) return;
    throw new ForbiddenException('Acces refuse : mission hors de votre perimetre.');
  }

  private async assertAlertInScope(actor: AuthenticatedUser, alert: Alert): Promise<void> {
    const scope = await this.scopeService.getAccessibleOrganizationIds(actor);
    if (scope === null) return;
    if (alert.organizationId && scope.includes(alert.organizationId)) return;
    throw new ForbiddenException('Acces refuse : alerte hors de votre perimetre.');
  }

  private publish(
    intervention: Intervention,
    type:
      | 'intervention.assigned'
      | 'intervention.status_changed'
      | 'intervention.completed'
      | 'intervention.aborted'
      | 'intervention.delayed',
    payload: Record<string, unknown>,
  ): void {
    void this.roomsFor(intervention).then((organizationIds) => {
      this.interventionEventBus.publish({
        type,
        interventionId: intervention.id,
        interventionReference: intervention.reference,
        alertId: intervention.alertId,
        alertReference: intervention.alert?.reference ?? null,
        status: intervention.status,
        teamId: intervention.teamId,
        teamName: intervention.team?.name ?? null,
        stationId: intervention.stationId,
        organizationIds,
        occurredAt: new Date().toISOString(),
        payload,
      });
    });
  }

  /** Salles a notifier : station d'affectation, agence porteuse et ancetres. */
  private async roomsFor(intervention: Intervention): Promise<string[]> {
    const rooms = new Set<string>([intervention.stationId]);

    const alertPath =
      typeof intervention.alert?.metadata?.organizationPath === 'string'
        ? intervention.alert.metadata.organizationPath
        : '';
    for (const segment of alertPath.split('/')) {
      if (segment) rooms.add(segment);
    }

    if (!intervention.station?.path) {
      const station = await this.organizationRepository.findOne({
        where: { id: intervention.stationId },
        select: { id: true, path: true },
      });
      for (const segment of (station?.path ?? '').split('/')) {
        if (segment) rooms.add(segment);
      }
    } else {
      for (const segment of intervention.station.path.split('/')) {
        if (segment) rooms.add(segment);
      }
    }

    return [...rooms];
  }

  private async persistWithReference(payload: Partial<Intervention>, attempt = 0): Promise<Intervention> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const createdToday = await this.interventionRepository.count({
      where: { createdAt: MoreThanOrEqual(startOfDay) },
      withDeleted: true,
    });

    const intervention = this.interventionRepository.create({
      ...payload,
      reference: buildInterventionReference(new Date(), createdToday + 1 + attempt),
    });

    try {
      return await this.interventionRepository.save(intervention);
    } catch (error) {
      const isUniqueViolation =
        typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505';
      if (isUniqueViolation && attempt < 5) {
        return this.persistWithReference(payload, attempt + 1);
      }
      throw error;
    }
  }
}

const isOpenAlertStatus = (status: AlertStatus): boolean =>
  [AlertStatus.NEW, AlertStatus.ACKNOWLEDGED, AlertStatus.ASSIGNED, AlertStatus.IN_PROGRESS].includes(status);

const isTerminalAlertStatus = (status: AlertStatus): boolean =>
  [AlertStatus.RESOLVED, AlertStatus.FALSE_ALARM, AlertStatus.CANCELLED].includes(status);
