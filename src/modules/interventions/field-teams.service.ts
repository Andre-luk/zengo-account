import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { InterventionEventBus } from '@common/bus/intervention-event.bus';
import { PaginatedResult, buildPaginatedResult } from '@common/dto/pagination.dto';
import { AlertType } from '@common/enums/alert.enum';
import { FieldTeamStatus } from '@common/enums/intervention.enum';
import { OrganizationType, StationType } from '@common/enums/organization.enum';
import { AuthenticatedUser } from '@common/interfaces/authenticated-user.interface';
import { isValidCoordinate } from '@common/utils/geo.util';
import {
  OPEN_INTERVENTION_STATUSES,
  TeamCandidate,
  isTeamPositionStale,
  requiredSpecialityFor,
} from '@common/utils/intervention-rules';
import { saveColumns } from '@common/utils/persistence.util';
import { FieldTeam } from '@database/entities/field-team.entity';
import { Intervention } from '@database/entities/intervention.entity';
import { Organization } from '@database/entities/organization.entity';
import { TeamPosition } from '@database/entities/team-position.entity';
import {
  CreateFieldTeamDto,
  QueryFieldTeamsDto,
  TeamPositionDto,
  UpdateFieldTeamDto,
} from '@modules/interventions/dto/field-team.dto';
import { OrganizationScopeService } from '@modules/organizations/organizations.service';

const TEAM_RELATIONS = { station: true };

/**
 * Equipes d'intervention terrain.
 *
 * Ce service est la source de verite de la disponibilite et de la position des
 * equipes ; il alimente l'affectation automatique de l'equipe la plus proche et
 * diffuse les changements de statut / de position aux consoles.
 */
@Injectable()
export class FieldTeamsService {
  private readonly logger = new Logger(FieldTeamsService.name);

  constructor(
    @InjectRepository(FieldTeam)
    private readonly teamRepository: Repository<FieldTeam>,
    @InjectRepository(TeamPosition)
    private readonly positionRepository: Repository<TeamPosition>,
    @InjectRepository(Intervention)
    private readonly interventionRepository: Repository<Intervention>,
    @InjectRepository(Organization)
    private readonly organizationRepository: Repository<Organization>,
    private readonly scopeService: OrganizationScopeService,
    private readonly interventionEventBus: InterventionEventBus,
  ) {}

  // ---------------------------------------------------------------------------
  // Consultation
  // ---------------------------------------------------------------------------

  async findAll(actor: AuthenticatedUser, query: QueryFieldTeamsDto): Promise<PaginatedResult<FieldTeam>> {
    const builder = this.teamRepository
      .createQueryBuilder('team')
      .leftJoinAndSelect('team.station', 'station');

    const scope = await this.scopeService.getAccessibleOrganizationIds(actor);
    if (scope !== null) {
      if (scope.length === 0) return buildPaginatedResult<FieldTeam>([], 0, query.page, query.limit);
      builder.andWhere('team.stationId IN (:...scope)', { scope });
    }

    if (query.status) builder.andWhere('team.status = :status', { status: query.status });
    if (query.speciality) builder.andWhere('team.speciality = :speciality', { speciality: query.speciality });
    if (query.stationId) builder.andWhere('team.stationId = :stationId', { stationId: query.stationId });
    if (query.organizationId) {
      // Stations descendantes de l'organisation demandee (agence, zone...).
      const organization = await this.organizationRepository.findOne({ where: { id: query.organizationId } });
      if (!organization) throw new NotFoundException('Organisation introuvable.');
      builder.andWhere('(station.id = :organizationId OR station.path LIKE :organizationPath)', {
        organizationId: organization.id,
        organizationPath: `${organization.path}/%`,
      });
    }
    if (query.availableOnly) {
      builder.andWhere('team.status = :available', { available: FieldTeamStatus.AVAILABLE });
      builder.andWhere('team.isActive = true');
    }
    if (query.withPositionOnly) {
      builder.andWhere('team.currentLatitude IS NOT NULL AND team.currentLongitude IS NOT NULL');
    }
    if (query.search) {
      builder.andWhere('(team.name ILIKE :search OR team.code ILIKE :search OR team.leaderName ILIKE :search)', {
        search: `%${query.search}%`,
      });
    }

    // Tri par distance croissante lorsqu'un point de reference est fourni.
    if (isValidCoordinate(query.nearLatitude, query.nearLongitude)) {
      builder
        .addSelect(
          `(6371000 * 2 * asin(sqrt(power(sin(radians(team.currentLatitude - :nearLat) / 2), 2)
            + cos(radians(:nearLat)) * cos(radians(team.currentLatitude))
            * power(sin(radians(team.currentLongitude - :nearLng) / 2), 2))))`,
          'distance_meters',
        )
        .setParameters({ nearLat: query.nearLatitude, nearLng: query.nearLongitude })
        .orderBy('distance_meters', 'ASC', 'NULLS LAST')
        .addOrderBy('team.name', 'ASC');
    } else {
      builder.orderBy('team.name', query.order.toUpperCase() as 'ASC' | 'DESC');
    }

    builder.skip(query.skip).take(query.limit);

    const [items, total] = await builder.getManyAndCount();
    return buildPaginatedResult(items, total, query.page, query.limit);
  }

  async findOne(actor: AuthenticatedUser, id: string): Promise<FieldTeam> {
    const team = await this.teamRepository.findOne({ where: { id }, relations: TEAM_RELATIONS });
    if (!team) throw new NotFoundException('Equipe introuvable.');
    await this.assertInScope(actor, team.stationId);
    return team;
  }

  /** Historique de positions d'une equipe (trace du dernier trajet). */
  async listPositions(actor: AuthenticatedUser, id: string, limit = 100): Promise<TeamPosition[]> {
    const team = await this.findOne(actor, id);
    return this.positionRepository.find({
      where: { teamId: team.id },
      order: { recordedAt: 'DESC' },
      take: Math.min(Math.max(limit, 1), 500),
    });
  }

  /**
   * Equipes candidates pour une affectation automatique.
   *
   * Le filtrage par perimetre est applique ici : un operateur d'agence ne peut
   * engager que les equipes de son perimetre.
   */
  async listCandidates(
    actor: AuthenticatedUser | null,
    options: { alertType?: AlertType; speciality?: StationType; stationIds?: string[] } = {},
  ): Promise<TeamCandidate[]> {
    const builder = this.teamRepository
      .createQueryBuilder('team')
      .where('team.status = :available', { available: FieldTeamStatus.AVAILABLE })
      .andWhere('team.isActive = true');

    if (options.stationIds?.length) {
      builder.andWhere('team.stationId IN (:...stationIds)', { stationIds: options.stationIds });
    }

    const specialities = options.speciality
      ? [options.speciality]
      : options.alertType
        ? requiredSpecialityFor(options.alertType)
        : null;
    if (specialities) {
      builder.andWhere('team.speciality IN (:...specialities)', { specialities });
    }

    if (actor) {
      const scope = await this.scopeService.getAccessibleOrganizationIds(actor);
      if (scope !== null) {
        if (scope.length === 0) return [];
        builder.andWhere('team.stationId IN (:...scope)', { scope });
      }
    }

    const teams = await builder.getMany();
    return teams.map((team) => ({
      id: team.id,
      name: team.name,
      stationId: team.stationId,
      speciality: team.speciality,
      status: team.status,
      latitude: team.currentLatitude as number,
      longitude: team.currentLongitude as number,
      lastPositionAt: team.lastPositionAt,
    }));
  }

  // ---------------------------------------------------------------------------
  // Administration
  // ---------------------------------------------------------------------------

  async create(actor: AuthenticatedUser, dto: CreateFieldTeamDto): Promise<FieldTeam> {
    const station = await this.organizationRepository.findOne({ where: { id: dto.stationId } });
    if (!station) throw new NotFoundException('Station introuvable.');
    if (station.type !== OrganizationType.STATION) {
      throw new BadRequestException(
        `L'organisation "${station.name}" n'est pas une station d'intervention.`,
      );
    }
    await this.scopeService.assertInScope(actor, station.id);

    const existing = await this.teamRepository.findOne({
      where: { stationId: station.id, name: dto.name.trim() },
    });
    if (existing) {
      throw new BadRequestException(`Une equipe nommee "${dto.name}" existe deja dans cette station.`);
    }

    const team = this.teamRepository.create({
      name: dto.name.trim(),
      code: dto.code?.trim().toUpperCase() ?? null,
      stationId: station.id,
      speciality: dto.speciality,
      status: FieldTeamStatus.AVAILABLE,
      leaderName: dto.leaderName ?? null,
      leaderPhone: dto.leaderPhone ?? null,
      membersCount: dto.membersCount ?? 2,
      vehiclePlate: dto.vehiclePlate ?? null,
      notes: dto.notes ?? null,
      currentLatitude: dto.latitude ?? station.latitude ?? null,
      currentLongitude: dto.longitude ?? station.longitude ?? null,
      lastPositionAt: dto.latitude && dto.longitude ? new Date() : null,
    });

    const saved = await this.teamRepository.save(team);
    this.logger.log(`Equipe ${saved.name} creee (station ${station.name}).`);
    return this.findOne(actor, saved.id);
  }

  async update(actor: AuthenticatedUser, id: string, dto: UpdateFieldTeamDto): Promise<FieldTeam> {
    const team = await this.findOne(actor, id);

    Object.assign(team, {
      name: dto.name?.trim() ?? team.name,
      code: dto.code !== undefined ? (dto.code?.trim().toUpperCase() ?? null) : team.code,
      speciality: dto.speciality ?? team.speciality,
      leaderName: dto.leaderName !== undefined ? dto.leaderName : team.leaderName,
      leaderPhone: dto.leaderPhone !== undefined ? dto.leaderPhone : team.leaderPhone,
      membersCount: dto.membersCount ?? team.membersCount,
      vehiclePlate: dto.vehiclePlate !== undefined ? dto.vehiclePlate : team.vehiclePlate,
      isActive: dto.isActive ?? team.isActive,
      notes: dto.notes !== undefined ? dto.notes : team.notes,
    });

    await saveColumns(this.teamRepository, team);
    return this.findOne(actor, id);
  }

  /** Bascule manuelle de disponibilite (maintenance, fin de service...). */
  async updateStatus(
    actor: AuthenticatedUser,
    id: string,
    status: FieldTeamStatus,
    note?: string,
  ): Promise<FieldTeam> {
    const team = await this.findOne(actor, id);

    const previousStatus = team.status;

    if (previousStatus === FieldTeamStatus.ENGAGED && status !== FieldTeamStatus.ENGAGED) {
      const active = await this.hasOpenMission(team.id);
      if (active) {
        throw new BadRequestException(
          "Cette equipe est engagee sur une mission en cours : cloturez ou abandonnez la mission avant de liberer l'equipe.",
        );
      }
    }

    team.status = status;
    if (note) team.notes = note;
    await saveColumns(this.teamRepository, team);

    this.publish(team, 'team.status_changed', { previousStatus, status });
    return this.findOne(actor, id);
  }

  // ---------------------------------------------------------------------------
  // Positions
  // ---------------------------------------------------------------------------

  /**
   * Enregistre un releve de position : historique append-only + derniere
   * position denormalisee sur l'equipe (utilisee pour l'affectation).
   */
  async recordPosition(
    actor: AuthenticatedUser,
    id: string,
    dto: TeamPositionDto,
    interventionId?: string | null,
  ): Promise<TeamPosition> {
    const team = await this.findOne(actor, id);
    const missionId = interventionId ?? dto.interventionId ?? (await this.findOpenMissionId(team.id));

    const position = await this.positionRepository.save(
      this.positionRepository.create({
        teamId: team.id,
        interventionId: missionId ?? null,
        latitude: dto.latitude,
        longitude: dto.longitude,
        accuracyMeters: dto.accuracyMeters ?? null,
        speedKmh: dto.speedKmh ?? null,
        headingDegrees: dto.headingDegrees ?? null,
        source: dto.source ?? undefined,
        recordedAt: new Date(),
      }),
    );

    await this.teamRepository.update(team.id, {
      currentLatitude: dto.latitude,
      currentLongitude: dto.longitude,
      lastPositionAt: position.recordedAt,
    });

    this.publish(team, 'team.position_updated', {
      latitude: dto.latitude,
      longitude: dto.longitude,
      speedKmh: dto.speedKmh ?? null,
      recordedAt: position.recordedAt.toISOString(),
    });

    return position;
  }

  // ---------------------------------------------------------------------------
  // Exploitation interne (appele par InterventionsService)
  // ---------------------------------------------------------------------------

  async loadTeamOrFail(id: string): Promise<FieldTeam> {
    const team = await this.teamRepository.findOne({ where: { id }, relations: TEAM_RELATIONS });
    if (!team) throw new NotFoundException('Equipe introuvable.');
    return team;
  }

  async markEngaged(teamId: string): Promise<void> {
    await this.teamRepository.update(teamId, { status: FieldTeamStatus.ENGAGED });
  }

  async markAvailable(teamId: string): Promise<void> {
    const team = await this.teamRepository.findOne({ where: { id: teamId } });
    if (!team) return;
    if (!team.isActive) return;
    await this.teamRepository.update(teamId, { status: FieldTeamStatus.AVAILABLE });
  }

  /** Equipes dont la position n'a plus ete transmise depuis trop longtemps. */
  async findTeamsWithStalePosition(maxAgeMinutes: number): Promise<FieldTeam[]> {
    const teams = await this.teamRepository.find({ where: { isActive: true } });
    const now = new Date();
    return teams.filter((team) => isTeamPositionStale(team.lastPositionAt, now, maxAgeMinutes));
  }

  async assertInScope(actor: AuthenticatedUser, stationId: string): Promise<void> {
    const scope = await this.scopeService.getAccessibleOrganizationIds(actor);
    if (scope === null) return;
    if (!scope.includes(stationId)) {
      throw new ForbiddenException("Acces refuse : equipe hors de votre perimetre.");
    }
  }

  private async hasOpenMission(teamId: string): Promise<boolean> {
    const open = await this.interventionRepository.findOne({
      where: { teamId, status: In(OPEN_INTERVENTION_STATUSES) },
      select: { id: true },
    });
    return Boolean(open);
  }

  /**
   * Mission en cours d'une equipe. Sert a rattacher les releves GPS a la bonne
   * mission sans que l'appelant ait a preciser l'identifiant.
   */
  private async findOpenMissionId(teamId: string): Promise<string | null> {
    const open = await this.interventionRepository.findOne({
      where: { teamId, status: In(OPEN_INTERVENTION_STATUSES) },
      select: { id: true },
      order: { assignedAt: 'DESC' },
    });
    return open?.id ?? null;
  }

  /** Diffuse un evenement equipe dans les salles de sa station et de ses ancetres. */
  private publish(team: FieldTeam, type: 'team.status_changed' | 'team.position_updated', payload: Record<string, unknown>): void {
    void this.roomsForStation(team.stationId).then((organizationIds) => {
      this.interventionEventBus.publish({
        type,
        interventionId: null,
        interventionReference: null,
        alertId: null,
        alertReference: null,
        status: null,
        teamId: team.id,
        teamName: team.name,
        stationId: team.stationId,
        organizationIds,
        occurredAt: new Date().toISOString(),
        payload,
      });
    });
  }

  private async roomsForStation(stationId: string): Promise<string[]> {
    const station = await this.organizationRepository.findOne({
      where: { id: stationId },
      select: { id: true, path: true },
    });
    if (!station) return [stationId];

    const rooms = new Set<string>([station.id]);
    for (const segment of station.path.split('/')) {
      if (segment) rooms.add(segment);
    }
    return [...rooms];
  }
}
