import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { AlertStatus } from '@common/enums/alert.enum';
import { ClientStatus } from '@common/enums/client.enum';
import {
  IntegrationHorizon,
  IntegrationOutcome,
  MutationReason,
  MutationStatus,
  MutationType,
} from '@common/enums/mutation.enum';
import { OrganizationType } from '@common/enums/organization.enum';
import { Role } from '@common/enums/role.enum';
import { SmsTemplate } from '@common/enums/sms.enum';
import { MutationEventBus } from '@common/bus/mutation-event.bus';
import { AuthenticatedUser } from '@common/interfaces/authenticated-user.interface';
import {
  buildMutationReference,
  canApplyMutation,
  canRevertMutation,
  canTransitionMutation,
  canValidateMutation,
  describeTransferImpact,
  dueIntegrationReports,
  integrationDueAt,
  isIntegrationReportLate,
  summarizeCaseLoad,
} from '@common/utils/mutation.util';
import { OPEN_INTERVENTION_STATUSES } from '@common/utils/intervention-rules';
import { ClientMutation } from '@database/entities/client-mutation.entity';
import { ClientProfile } from '@database/entities/client-profile.entity';
import { Device } from '@database/entities/device.entity';
import { Organization } from '@database/entities/organization.entity';
import { SubDevice } from '@database/entities/sub-device.entity';
import { Alert } from '@database/entities/alert.entity';
import { Intervention } from '@database/entities/intervention.entity';
import { Subscription } from '@database/entities/subscription.entity';
import { AlertSmsService } from '@modules/alerts/alert-sms.service';
import { OrganizationScopeService } from '@modules/organizations/organizations.service';
import {
  CreateMutationDto,
  QueryMutationsDto,
  ReportIntegrationDto,
  ReviewMutationDto,
} from '@modules/mutations/dto/mutation.dto';

/** Profils habilites a valider une mutation (seconde validation). */
const QUALITY_REVIEWER_ROLES: Role[] = [
  Role.QUALITY_DIRECTOR,
  Role.NATIONAL_DIRECTOR,
  Role.TECHNICAL_DIRECTOR,
  Role.SUPER_ADMIN,
];

/** Profils habilites a appliquer ou annuler le transfert. */
const APPLY_ROLES: Role[] = [
  Role.SUPER_ADMIN,
  Role.NATIONAL_DIRECTOR,
  Role.TECHNICAL_DIRECTOR,
  Role.PLATFORM_MANAGER,
  Role.QUALITY_DIRECTOR,
  Role.REGION_MANAGER,
  Role.AGENCY_MANAGER,
];

export interface MutationView {
  id: string;
  reference: string;
  type: MutationType;
  status: MutationStatus;
  reason: MutationReason;
  note: string | null;
  client: { id: string; zengoId: string; fullName: string; primaryPhone: string } | null;
  from: { id: string; name: string; city: string | null };
  to: { id: string; name: string; city: string | null };
  requestedByLabel: string | null;
  requestedAt: Date;
  reviewedByLabel: string | null;
  reviewedAt: Date | null;
  reviewComment: string | null;
  rejectionReason: string | null;
  appliedAt: Date | null;
  appliedByLabel: string | null;
  regionChanged: boolean;
  alertsRedirected: number;
  caseLoadSummary: string | null;
  servicesNotified: string[];
  clientNotifiedAt: Date | null;
  revertedAt: Date | null;
  revertReason: string | null;
  integration: {
    horizon: IntegrationHorizon;
    dueAt: Date | null;
    reportedAt: Date | null;
    outcome: IntegrationOutcome | null;
    note: string | null;
    late: boolean;
  }[];
  pendingIntegration: IntegrationHorizon[];
  canBeReviewed: boolean;
  canBeApplied: boolean;
  canBeReverted: boolean;
}

/**
 * Mutations geographiques des dossiers clients.
 *
 * Le parcours du cahier des charges : une agence demande le transfert d'un
 * dossier, le Directeur controle qualite valide ou refuse, l'application
 * deplace le dossier (client, equipements, alertes en cours) vers l'agence de
 * destination, le client est informe par SMS, puis le controle qualite suit
 * l'integration a 7 et 30 jours. A tout moment apres application, un retour vers
 * l'agence d'origine reste possible et laisse une trace.
 */
@Injectable()
export class ClientMutationsService {
  private readonly logger = new Logger(ClientMutationsService.name);

  constructor(
    @InjectRepository(ClientMutation)
    private readonly mutationRepository: Repository<ClientMutation>,
    @InjectRepository(ClientProfile)
    private readonly clientRepository: Repository<ClientProfile>,
    @InjectRepository(Organization)
    private readonly organizationRepository: Repository<Organization>,
    @InjectRepository(Device)
    private readonly deviceRepository: Repository<Device>,
    @InjectRepository(SubDevice)
    private readonly subDeviceRepository: Repository<SubDevice>,
    @InjectRepository(Alert)
    private readonly alertRepository: Repository<Alert>,
    @InjectRepository(Intervention)
    private readonly interventionRepository: Repository<Intervention>,
    @InjectRepository(Subscription)
    private readonly subscriptionRepository: Repository<Subscription>,
    private readonly scopeService: OrganizationScopeService,
    private readonly alertSms: AlertSmsService,
    private readonly mutationEventBus: MutationEventBus,
    private readonly dataSource: DataSource,
  ) {}

  // ---------------------------------------------------------------------------
  // Demande
  // ---------------------------------------------------------------------------

  /**
   * Depose une demande de mutation.
   *
   * L'agence de destination doit etre une agence (les clients sont rattaches a
   * une agence, pas a une station) et differente de l'agence actuelle. Une seule
   * demande ouverte par client est acceptee : deux transferts simultanes
   * produiraient un portefeuille incoherent.
   */
  async request(actor: AuthenticatedUser, clientId: string, dto: CreateMutationDto): Promise<MutationView> {
    const client = await this.loadClientOrFail(clientId);
    await this.assertInScope(actor, client.organizationId);

    const from = await this.loadOrganizationOrFail(client.organizationId);
    const to = await this.loadOrganizationOrFail(dto.toOrganizationId);

    if (to.type !== OrganizationType.AGENCY) {
      throw new BadRequestException(
        `La destination doit etre une agence (recue : ${to.type.toLowerCase()}).`,
      );
    }
    if (to.id === from.id) {
      throw new BadRequestException('Le dossier est deja rattache a cette agence.');
    }

    if (MUTATION_BLOCKED_CLIENT_STATUSES.includes(client.status)) {
      throw new BadRequestException(
        'Ce dossier est archive : il doit etre reactive avant tout transfert.',
      );
    }

    const openMutation = await this.mutationRepository.findOne({
      where: { clientId, status: In([MutationStatus.REQUESTED, MutationStatus.IN_REVIEW, MutationStatus.APPROVED]) },
    });
    if (openMutation) {
      throw new ConflictException(
        `Une demande est deja en cours sur ce dossier (${openMutation.reference}).`,
      );
    }

    const counts = await this.collectCaseLoad(client);
    const impact = describeTransferImpact(
      {
        fromOrganizationId: from.id,
        fromOrganizationName: from.name,
        fromRegionId: from.parentId ?? null,
        toOrganizationId: to.id,
        toOrganizationName: to.name,
        toRegionId: to.parentId ?? null,
      },
      counts.openAlerts,
    );

    const mutation = await this.persistWithReference({
      clientId: client.id,
      type: MutationType.TRANSFER,
      status: MutationStatus.REQUESTED,
      reason: dto.reason,
      note: dto.note ?? null,
      fromOrganizationId: from.id,
      fromRegionId: from.parentId ?? null,
      toOrganizationId: to.id,
      toRegionId: to.parentId ?? null,
      requestedById: actor.id,
      requestedByLabel: `${actor.firstName} ${actor.lastName}`.trim(),
      requestedAt: new Date(),
      regionChanged: impact.regionChanged,
      caseLoadSummary: summarizeCaseLoad(counts),
      metadata: { impact, counts },
    });

    this.publish(mutation, 'mutation.requested', actorLabel(actor), {
      message: `${mutation.reference} : transfert de ${client.fullName} de ${from.name} vers ${to.name} demande.`,
    });

    this.logger.log(
      `Mutation ${mutation.reference} demandee par ${actor.email ?? actor.id} : ${from.name} -> ${to.name}.`,
    );

    return this.toView(await this.loadOrFail(mutation.id));
  }

  // ---------------------------------------------------------------------------
  // Controle qualite (seconde validation)
  // ---------------------------------------------------------------------------

  /**
   * Instruction par le controle qualite. Le validateur ne peut pas etre le
   * demandeur : c'est la double validation exigee par le cahier des charges.
   */
  async review(actor: AuthenticatedUser, id: string, dto: ReviewMutationDto): Promise<MutationView> {
    const mutation = await this.loadOrFail(id);

    const decision = canValidateMutation({
      requester: { userId: mutation.requestedById ?? '', labels: [] },
      validator: { userId: actor.id, labels: actor.roles },
      reviewerRoles: QUALITY_REVIEWER_ROLES as unknown as string[],
      status: mutation.status,
    });

    if (!decision.allowed) {
      if (decision.reason === 'SAME_ACTOR') {
        throw new ForbiddenException(
          'Le demandeur ne peut pas valider sa propre demande : un autre profil doit instruire le dossier.',
        );
      }
      if (decision.reason === 'MISSING_QUALITY_ROLE') {
        throw new ForbiddenException(
          'Seul le controle qualite (ou une direction) peut valider une mutation.',
        );
      }
      throw new BadRequestException(
        `Cette demande est deja instruite (statut ${mutation.status}).`,
      );
    }

    const target = dto.approve ? MutationStatus.APPROVED : MutationStatus.REJECTED;
    if (!canTransitionMutation(mutation.status, target)) {
      throw new BadRequestException(`Transition impossible de ${mutation.status} vers ${target}.`);
    }
    if (!dto.approve && !dto.comment) {
      throw new BadRequestException('Un refus doit etre motive.');
    }

    mutation.status = target;
    mutation.reviewedById = actor.id;
    mutation.reviewedByLabel = `${actor.firstName} ${actor.lastName}`.trim();
    mutation.reviewedAt = new Date();
    mutation.reviewComment = dto.comment ?? null;
    mutation.rejectionReason = dto.approve ? null : (dto.comment ?? 'refus sans motif');

    const saved = await this.mutationRepository.save(mutation);

    this.publish(
      saved,
      dto.approve ? 'mutation.approved' : 'mutation.rejected',
      actorLabel(actor),
      {
        message: dto.approve
          ? `${saved.reference} validee par ${saved.reviewedByLabel} : le transfert peut etre applique.`
          : `${saved.reference} refusee par ${saved.reviewedByLabel} : ${saved.rejectionReason}.`,
      },
    );

    return this.toView(await this.loadOrFail(saved.id));
  }

  // ---------------------------------------------------------------------------
  // Application du transfert
  // ---------------------------------------------------------------------------

  /**
   * Applique le transfert : le dossier complet change d'agence.
   *
   * Dans une seule transaction : le client, ses equipements, ses sous-appareils
   * et ses abonnements rejoignent l'agence de destination ; les alertes encore
   * ouvertes sont redirigees lorsque la region change, afin que les secours de
   * la nouvelle region prennent le relais. Le client est informe par SMS, et un
   * echec d'envoi ne remet pas le transfert en cause (il est trace).
   */
  async apply(actor: AuthenticatedUser, id: string): Promise<MutationView> {
    const mutation = await this.loadOrFail(id);

    if (!canApplyMutation(mutation.status)) {
      throw new BadRequestException(
        `Le transfert ne peut etre applique que sur une demande validee (statut ${mutation.status}).`,
      );
    }

    const client = await this.loadClientOrFail(mutation.clientId);
    await this.assertInScope(actor, mutation.fromOrganizationId);

    const destination = await this.loadOrganizationOrFail(mutation.toOrganizationId);
    const counts = await this.collectCaseLoad(client);

    const applied = await this.dataSource.transaction(async (manager) => {
      // Alertes ouvertes : elles suivent le client, sinon les secours de
      // l'ancienne region continueraient d'etre mobilises.
      const openAlerts = await manager.find(Alert, {
        where: {
          clientId: client.id,
          status: In([
            AlertStatus.NEW,
            AlertStatus.ACKNOWLEDGED,
            AlertStatus.ASSIGNED,
            AlertStatus.IN_PROGRESS,
          ]),
        },
        select: { id: true },
      });

      // Les equipements portent l'organisation ; les sous-appareils en heritent
      // par leur dispositif parent, ils n'ont pas d'agence propre.
      await manager.update(ClientProfile, client.id, { organizationId: destination.id });
      await manager.update(Device, { clientId: client.id }, { organizationId: destination.id });

      if (mutation.regionChanged && openAlerts.length > 0) {
        await manager
          .createQueryBuilder()
          .update(Alert)
          .set({ organizationId: destination.id })
          .whereInIds(openAlerts.map((alert) => alert.id))
          .execute();
      }

      mutation.status = MutationStatus.APPLIED;
      mutation.appliedAt = new Date();
      mutation.appliedById = actor.id;
      mutation.appliedByLabel = actorLabel(actor);
      mutation.alertsRedirected = mutation.regionChanged ? openAlerts.length : 0;
      mutation.caseLoadSummary = summarizeCaseLoad(counts);
      mutation.servicesNotified = describeTransferImpact(
        {
          fromOrganizationId: mutation.fromOrganizationId,
          fromOrganizationName: '',
          fromRegionId: mutation.fromRegionId,
          toOrganizationId: mutation.toOrganizationId,
          toOrganizationName: destination.name,
          toRegionId: mutation.toRegionId,
        },
        openAlerts.length,
      ).servicesToNotify;

      return manager.save(mutation);
    });

    // Information du client, hors transaction : un SMS en echec ne doit pas
    // annuler un transfert deja effectif.
    const notifiedAt = await this.notifyClient(applied, client, destination);
    if (notifiedAt) {
      applied.clientNotifiedAt = notifiedAt;
      await this.mutationRepository.update(applied.id, { clientNotifiedAt: notifiedAt });
    }

    this.publish(applied, 'mutation.applied', actorLabel(actor), {
      message: `${applied.reference} appliquee : ${client.fullName} rejoint ${destination.name}${
        applied.alertsRedirected > 0 ? `, ${applied.alertsRedirected} alerte(s) redirigee(s)` : ''
      }.`,
    });

    this.logger.warn(
      `Mutation ${applied.reference} appliquee : dossier ${client.zengoId ?? client.id} transfere vers ${destination.name}.`,
    );

    return this.toView(await this.loadOrFail(applied.id));
  }

  /** Retour du dossier vers son agence d'origine, apres un transfert applique. */
  async revert(actor: AuthenticatedUser, id: string, reason: string): Promise<MutationView> {
    const mutation = await this.loadOrFail(id);
    if (!canRevertMutation(mutation.status)) {
      throw new BadRequestException(
        'Seul un transfert deja applique peut revenir a son agence d origine.',
      );
    }
    if (!reason || reason.trim().length < 3) {
      throw new BadRequestException('Le retour doit etre motive.');
    }

    const client = await this.loadClientOrFail(mutation.clientId);
    const target = await this.loadOrganizationOrFail(mutation.toOrganizationId);
    await this.assertInScope(actor, target.id);

    const origin = await this.loadOrganizationOrFail(mutation.fromOrganizationId);

    await this.dataSource.transaction(async (manager) => {
      await manager.update(ClientProfile, client.id, { organizationId: origin.id });
      await manager.update(Device, { clientId: client.id }, { organizationId: origin.id });

      const openAlerts = await manager.find(Alert, {
        where: {
          clientId: client.id,
          status: In([AlertStatus.NEW, AlertStatus.ACKNOWLEDGED, AlertStatus.ASSIGNED, AlertStatus.IN_PROGRESS]),
        },
        select: { id: true },
      });
      if (openAlerts.length > 0) {
        await manager
          .createQueryBuilder()
          .update(Alert)
          .set({ organizationId: origin.id })
          .whereInIds(openAlerts.map((alert) => alert.id))
          .execute();
      }

      mutation.status = MutationStatus.REVERTED;
      mutation.revertedAt = new Date();
      mutation.revertedByLabel = actorLabel(actor);
      mutation.revertReason = reason;

      await manager.save(mutation);
    });

    const reverted = await this.loadOrFail(mutation.id);
    this.publish(reverted, 'mutation.reverted', actorLabel(actor), {
      message: `${reverted.reference} : retour de ${client.fullName} vers ${origin.name} (${reason}).`,
    });

    return this.toView(reverted);
  }

  /**
   * Retrait d'une demande avant son application (client qui reste finalement,
   * erreur de saisie de l'agence, doublon). Un transfert deja applique se
   * corrige par un retour, pas par une annulation.
   */
  async cancel(actor: AuthenticatedUser, id: string, reason: string): Promise<MutationView> {
    const mutation = await this.loadOrFail(id);

    if (!canTransitionMutation(mutation.status, MutationStatus.CANCELLED)) {
      throw new BadRequestException(
        mutation.status === MutationStatus.APPLIED
          ? "Ce transfert est deja applique : utilisez le retour vers l'agence d'origine."
          : `Cette demande ne peut plus etre annulee (statut ${mutation.status}).`,
      );
    }

    await this.assertInScope(actor, mutation.fromOrganizationId, mutation.toOrganizationId);

    mutation.status = MutationStatus.CANCELLED;
    mutation.reviewedById = mutation.reviewedById ?? actor.id;
    mutation.reviewComment = reason;
    mutation.cancelledAt = new Date();
    mutation.cancellationReason = reason;

    const saved = await this.mutationRepository.save(mutation);
    this.publish(saved, 'mutation.rejected', actorLabel(actor), {
      message: `${saved.reference} annulee par ${actorLabel(actor)} : ${reason}.`,
    });

    return this.toView(await this.loadOrFail(saved.id));
  }

  // ---------------------------------------------------------------------------
  // Suivi de l'integration
  // ---------------------------------------------------------------------------

  /** Rapport d'integration a 7 ou 30 jours, saisi par l'agence d'accueil. */
  async reportIntegration(actor: AuthenticatedUser, id: string, dto: ReportIntegrationDto): Promise<MutationView> {
    const mutation = await this.loadOrFail(id);
    if (mutation.status !== MutationStatus.APPLIED) {
      throw new BadRequestException('Le suivi d integration ne concerne que les transferts appliques.');
    }
    await this.assertInScope(actor, mutation.toOrganizationId);

    const isDay7 = dto.horizon === IntegrationHorizon.DAYS_7;
    if (isDay7) {
      if (mutation.integration7At) {
        throw new ConflictException('Le rapport a 7 jours a deja ete saisi.');
      }
      mutation.integration7At = new Date();
      mutation.integration7Outcome = dto.outcome;
      mutation.integration7Note = dto.note ?? null;
    } else {
      if (mutation.integration30At) {
        throw new ConflictException('Le rapport a 30 jours a deja ete saisi.');
      }
      mutation.integration30At = new Date();
      mutation.integration30Outcome = dto.outcome;
      mutation.integration30Note = dto.note ?? null;
    }

    const saved = await this.mutationRepository.save(mutation);
    this.publish(saved, 'mutation.integration_report', actorLabel(actor), {
      message: `${saved.reference} : rapport d integration a ${dto.horizon} jours saisi (${dto.outcome}).`,
    });

    return this.toView(await this.loadOrFail(saved.id));
  }

  /** Mutations dont un rapport d'integration est attendu et manquant. */
  async findPendingIntegrationReports(): Promise<ClientMutation[]> {
    const applied = await this.mutationRepository.find({
      where: { status: MutationStatus.APPLIED },
      relations: { client: true, toOrganization: true },
      order: { appliedAt: 'ASC' },
      take: 500,
    });

    const now = new Date();
    return applied.filter(
      (mutation) =>
        dueIntegrationReports(
          mutation.appliedAt,
          {
            [IntegrationHorizon.DAYS_7]: mutation.integration7At,
            [IntegrationHorizon.DAYS_30]: mutation.integration30At,
          },
          now,
        ).length > 0,
    );
  }

  /** Relance les agences d'accueil sur les rapports manquants (une par jour). */
  async remindPendingIntegrationReports(): Promise<number> {
    const pending = await this.findPendingIntegrationReports();
    const now = new Date();
    let reminded = 0;

    for (const mutation of pending) {
      const lastReminder = mutation.lastReminderAt;
      if (lastReminder && now.getTime() - lastReminder.getTime() < 86_400_000) continue;

      mutation.lastReminderAt = now;
      await this.mutationRepository.update(mutation.id, { lastReminderAt: now });

      const due = dueIntegrationReports(
        mutation.appliedAt,
        {
          [IntegrationHorizon.DAYS_7]: mutation.integration7At,
          [IntegrationHorizon.DAYS_30]: mutation.integration30At,
        },
        now,
      );
      this.publish(mutation, 'mutation.reminder', null, {
        message: `${mutation.reference} : rapport(s) d integration a ${due.join(' et ')} jours attendu(s) de ${mutation.toOrganization?.name ?? 'l agence d accueil'}.`,
      });
      reminded += 1;
    }

    return reminded;
  }

  // ---------------------------------------------------------------------------
  // Consultation
  // ---------------------------------------------------------------------------

  async findAll(actor: AuthenticatedUser, query: QueryMutationsDto): Promise<{
    items: MutationView[];
    total: number;
    page: number;
    limit: number;
  }> {
    const builder = this.mutationRepository
      .createQueryBuilder('mutation')
      .leftJoinAndSelect('mutation.client', 'client')
      .leftJoinAndSelect('mutation.fromOrganization', 'fromOrganization')
      .leftJoinAndSelect('mutation.toOrganization', 'toOrganization');

    const scope = await this.scopeService.getAccessibleOrganizationIds(actor);
    if (scope !== null) {
      if (scope.length === 0) return { items: [], total: 0, page: query.page, limit: query.limit };
      builder.andWhere(
        '(mutation.fromOrganizationId IN (:...scope) OR mutation.toOrganizationId IN (:...scope))',
        { scope },
      );
    }

    if (query.clientId) builder.andWhere('mutation.clientId = :clientId', { clientId: query.clientId });
    if (query.status) builder.andWhere('mutation.status = :status', { status: query.status });
    if (query.reason) builder.andWhere('mutation.reason = :reason', { reason: query.reason });
    if (query.openOnly) {
      builder.andWhere('mutation.status IN (:...open)', {
        open: [MutationStatus.REQUESTED, MutationStatus.IN_REVIEW, MutationStatus.APPROVED],
      });
    }
    if (query.search) {
      builder.andWhere('(mutation.reference ILIKE :search OR client.fullName ILIKE :search)', {
        search: `%${query.search}%`,
      });
    }

    builder
      .orderBy('mutation.requestedAt', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);

    const [items, total] = await builder.getManyAndCount();
    return { items: items.map((item) => this.toView(item)), total, page: query.page, limit: query.limit };
  }

  async findOne(actor: AuthenticatedUser, id: string): Promise<MutationView> {
    const mutation = await this.loadOrFail(id);
    await this.assertInScope(actor, mutation.fromOrganizationId, mutation.toOrganizationId);
    return this.toView(mutation);
  }

  /** Historique des mutations d'un dossier, du plus recent au plus ancien. */
  async forClient(actor: AuthenticatedUser, clientId: string): Promise<{
    clientId: string;
    organizationId: string;
    organizationName: string | null;
    originOrganizationId: string | null;
    mutations: MutationView[];
    pendingIntegration: IntegrationHorizon[];
  }> {
    const client = await this.loadClientOrFail(clientId);
    await this.assertInScope(actor, client.organizationId);

    const mutations = await this.mutationRepository.find({
      where: { clientId },
      relations: { fromOrganization: true, toOrganization: true, client: true },
      order: { requestedAt: 'DESC' },
    });

    const lastApplied = mutations.find((mutation) => mutation.status === MutationStatus.APPLIED);
    const organization = await this.organizationRepository.findOne({ where: { id: client.organizationId } });

    return {
      clientId: client.id,
      organizationId: client.organizationId,
      organizationName: organization?.name ?? null,
      originOrganizationId: mutations.length > 0 ? mutations[mutations.length - 1].fromOrganizationId : null,
      mutations: mutations.map((mutation) => this.toView(mutation)),
      pendingIntegration: dueIntegrationReports(
        lastApplied?.appliedAt ?? null,
        {
          [IntegrationHorizon.DAYS_7]: lastApplied?.integration7At ?? null,
          [IntegrationHorizon.DAYS_30]: lastApplied?.integration30At ?? null,
        },
      ),
    };
  }

  /** Indicateurs du controle qualite. */
  async stats(actor: AuthenticatedUser, options: { days?: number } = {}): Promise<{
    windowDays: number;
    total: number;
    byStatus: { status: MutationStatus; count: number }[];
    byReason: { reason: MutationReason; count: number }[];
    averageProcessingHours: number | null;
    applied: number;
    rejected: number;
    reverted: number;
    integrationPending: number;
    integrationLate: number;
  }> {
    const days = options.days && options.days > 0 ? Math.min(options.days, 365) : 90;
    const since = new Date(Date.now() - days * 86_400_000);
    const scope = await this.scopeService.getAccessibleOrganizationIds(actor);

    const builder = this.mutationRepository
      .createQueryBuilder('mutation')
      .where('mutation.requestedAt >= :since', { since });
    if (scope !== null) {
      if (scope.length === 0) {
        return emptyMutationStats(days);
      }
      builder.andWhere(
        '(mutation.fromOrganizationId IN (:...scope) OR mutation.toOrganizationId IN (:...scope))',
        { scope },
      );
    }

    const byStatus = await builder
      .clone()
      .select('mutation.status', 'status')
      .addSelect('COUNT(*)::int', 'count')
      .groupBy('mutation.status')
      .getRawMany<{ status: MutationStatus; count: number }>();

    const byReason = await builder
      .clone()
      .select('mutation.reason', 'reason')
      .addSelect('COUNT(*)::int', 'count')
      .groupBy('mutation.reason')
      .getRawMany<{ reason: MutationReason; count: number }>();

    const [timing] = await builder
      .clone()
      .select('AVG(EXTRACT(EPOCH FROM (mutation.appliedAt - mutation.requestedAt)) / 3600)::float', 'hours')
      .addSelect('COUNT(*) FILTER (WHERE mutation.status = :applied)::int', 'applied')
      .addSelect('COUNT(*) FILTER (WHERE mutation.status = :rejected)::int', 'rejected')
      .addSelect('COUNT(*) FILTER (WHERE mutation.status = :reverted)::int', 'reverted')
      .setParameter('applied', MutationStatus.APPLIED)
      .setParameter('rejected', MutationStatus.REJECTED)
      .setParameter('reverted', MutationStatus.REVERTED)
      .getRawMany<{ hours: number | null; applied: number; rejected: number; reverted: number }>();

    const pendingReports = await this.findPendingIntegrationReports();

    return {
      windowDays: days,
      total: byStatus.reduce((sum, row) => sum + Number(row.count), 0),
      byStatus: byStatus.map((row) => ({ status: row.status, count: Number(row.count) })),
      byReason: byReason.map((row) => ({ reason: row.reason, count: Number(row.count) })),
      averageProcessingHours:
        timing?.hours === null || timing?.hours === undefined ? null : Math.round(Number(timing.hours) * 10) / 10,
      applied: Number(timing?.applied ?? 0),
      rejected: Number(timing?.rejected ?? 0),
      reverted: Number(timing?.reverted ?? 0),
      integrationPending: pendingReports.length,
      integrationLate: pendingReports.filter((mutation) =>
        isIntegrationReportLate(
          mutation.appliedAt,
          {
            [IntegrationHorizon.DAYS_7]: mutation.integration7At,
            [IntegrationHorizon.DAYS_30]: mutation.integration30At,
          },
          new Date(),
        ),
      ).length,
    };
  }

  // ---------------------------------------------------------------------------
  // Outils internes
  // ---------------------------------------------------------------------------

  /** Charge du dossier reprise par l'agence d'accueil. */
  private async collectCaseLoad(client: ClientProfile): Promise<{
    devices: number;
    subDevices: number;
    alertsLast30Days: number;
    openAlerts: number;
    openMissions: number;
    activeSubscriptions: number;
  }> {
    const devices = await this.deviceRepository.find({ where: { clientId: client.id }, select: { id: true } });
    const since = new Date(Date.now() - 30 * 86_400_000);

    const [subDevices, alertsLast30Days, openAlerts, openMissions, activeSubscriptions] = await Promise.all([
      devices.length === 0
        ? Promise.resolve(0)
        : this.subDeviceRepository.count({ where: { deviceId: In(devices.map((device) => device.id)) } }),
      this.alertRepository
        .createQueryBuilder('alert')
        .where('alert.clientId = :clientId', { clientId: client.id })
        .andWhere('alert.openedAt >= :since', { since })
        .getCount(),
      this.alertRepository.count({
        where: {
          clientId: client.id,
          status: In([
            AlertStatus.NEW,
            AlertStatus.ACKNOWLEDGED,
            AlertStatus.ASSIGNED,
            AlertStatus.IN_PROGRESS,
          ]),
        },
      }),
      // Les missions suivent l'alerte : on compte celles qui sont encore ouvertes.
      this.interventionRepository
        .createQueryBuilder('intervention')
        .innerJoin(Alert, 'alert', 'alert.id = intervention.alertId')
        .where('alert.clientId = :clientId', { clientId: client.id })
        .andWhere('intervention.status IN (:...statuses)', { statuses: OPEN_INTERVENTION_STATUSES })
        .getCount(),
      this.subscriptionRepository.count({ where: { clientId: client.id } }),
    ]);

    return {
      devices: devices.length,
      subDevices,
      alertsLast30Days,
      openAlerts,
      openMissions,
      activeSubscriptions,
    };
  }

  /** Informe le client de son nouveau point de contact (SMS). */
  private async notifyClient(
    mutation: ClientMutation,
    client: ClientProfile,
    destination: Organization,
  ): Promise<Date | null> {
    try {
      await this.alertSms.sendToClient(client.id, SmsTemplate.MUTATION_APPLIED, {
        agencyName: destination.name,
        city: destination.city ? `, ${destination.city}` : '',
      });
      return new Date();
    } catch (error) {
      this.logger.error(
        `Client non informe de la mutation ${mutation.reference} : ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  private async persistWithReference(
    payload: Partial<ClientMutation>,
    attempt = 0,
  ): Promise<ClientMutation> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const sequence = await this.mutationRepository
      .createQueryBuilder('mutation')
      .where('mutation.requestedAt >= :startOfDay', { startOfDay })
      .getCount();
    const reference = buildMutationReference(new Date(), sequence + 1 + attempt);

    try {
      return await this.mutationRepository.save(this.mutationRepository.create({ ...payload, reference }));
    } catch (error) {
      const code = (error as { driverError?: { code?: string } }).driverError?.code;
      if (code === '23505' && attempt < 4) {
        return this.persistWithReference(payload, attempt + 1);
      }
      throw error;
    }
  }

  private async loadOrFail(id: string): Promise<ClientMutation> {
    const mutation = await this.mutationRepository.findOne({
      where: { id },
      relations: { client: true, fromOrganization: true, toOrganization: true },
    });
    if (!mutation) throw new NotFoundException('Demande de mutation introuvable.');
    return mutation;
  }

  private async loadClientOrFail(id: string): Promise<ClientProfile> {
    const client = await this.clientRepository.findOne({ where: { id } });
    if (!client) throw new NotFoundException('Client introuvable.');
    return client;
  }

  private async loadOrganizationOrFail(id: string): Promise<Organization> {
    const organization = await this.organizationRepository.findOne({ where: { id } });
    if (!organization) throw new NotFoundException('Organisation introuvable.');
    return organization;
  }

  /** Une mutation engage deux agences : les deux doivent etre dans le perimetre. */
  private async assertInScope(actor: AuthenticatedUser, ...organizationIds: string[]): Promise<void> {
    const scope = await this.scopeService.getAccessibleOrganizationIds(actor);
    if (scope === null) return;

    const allowed = organizationIds.some((id) => scope.includes(id));
    if (!allowed) {
      throw new ForbiddenException("Acces refuse : ce dossier est hors de votre perimetre.");
    }
  }

  private publish(
    mutation: ClientMutation,
    type:
      | 'mutation.requested'
      | 'mutation.approved'
      | 'mutation.rejected'
      | 'mutation.applied'
      | 'mutation.reverted'
      | 'mutation.integration_report'
      | 'mutation.reminder',
    actorLabelValue: string | null,
    payload: { message: string },
  ): void {
    this.mutationEventBus.publish({
      type,
      mutationId: mutation.id,
      reference: mutation.reference,
      clientId: mutation.clientId,
      clientName: mutation.client?.fullName ?? null,
      status: mutation.status,
      fromOrganizationId: mutation.fromOrganizationId,
      toOrganizationId: mutation.toOrganizationId,
      actorLabel: actorLabelValue,
      message: payload.message,
      occurredAt: new Date(),
    });
  }

  private toView(mutation: ClientMutation): MutationView {
    const reported = {
      [IntegrationHorizon.DAYS_7]: mutation.integration7At,
      [IntegrationHorizon.DAYS_30]: mutation.integration30At,
    };
    const now = new Date();

    return {
      id: mutation.id,
      reference: mutation.reference,
      type: mutation.type,
      status: mutation.status,
      reason: mutation.reason,
      note: mutation.note,
      client: mutation.client
        ? {
            id: mutation.client.id,
            zengoId: mutation.client.zengoId,
            fullName: mutation.client.fullName,
            primaryPhone: mutation.client.primaryPhone,
          }
        : null,
      from: {
        id: mutation.fromOrganizationId,
        name: mutation.fromOrganization?.name ?? 'agence d origine',
        city: mutation.fromOrganization?.city ?? null,
      },
      to: {
        id: mutation.toOrganizationId,
        name: mutation.toOrganization?.name ?? 'agence de destination',
        city: mutation.toOrganization?.city ?? null,
      },
      requestedByLabel: mutation.requestedByLabel,
      requestedAt: mutation.requestedAt,
      reviewedByLabel: mutation.reviewedByLabel,
      reviewedAt: mutation.reviewedAt,
      reviewComment: mutation.reviewComment,
      rejectionReason: mutation.rejectionReason,
      appliedAt: mutation.appliedAt,
      appliedByLabel: mutation.appliedByLabel,
      regionChanged: mutation.regionChanged,
      alertsRedirected: mutation.alertsRedirected,
      caseLoadSummary: mutation.caseLoadSummary,
      servicesNotified: mutation.servicesNotified ?? [],
      clientNotifiedAt: mutation.clientNotifiedAt,
      revertedAt: mutation.revertedAt,
      revertReason: mutation.revertReason,
      integration: [
        {
          horizon: IntegrationHorizon.DAYS_7,
          dueAt: mutation.appliedAt ? addDays(mutation.appliedAt, IntegrationHorizon.DAYS_7) : null,
          reportedAt: mutation.integration7At,
          outcome: mutation.integration7Outcome,
          note: mutation.integration7Note,
          late: isIntegrationReportLate(mutation.appliedAt, reported, now) && !mutation.integration7At,
        },
        {
          horizon: IntegrationHorizon.DAYS_30,
          dueAt: mutation.appliedAt ? addDays(mutation.appliedAt, IntegrationHorizon.DAYS_30) : null,
          reportedAt: mutation.integration30At,
          outcome: mutation.integration30Outcome,
          note: mutation.integration30Note,
          late: isIntegrationReportLate(mutation.appliedAt, reported, now) && !mutation.integration30At,
        },
      ],
      pendingIntegration: dueIntegrationReports(mutation.appliedAt, reported, now),
      canBeReviewed: [MutationStatus.REQUESTED, MutationStatus.IN_REVIEW].includes(mutation.status),
      canBeApplied: canApplyMutation(mutation.status),
      canBeReverted: canRevertMutation(mutation.status),
    };
  }
}

/** Client archive : jamais transfere, le dossier doit d'abord etre reactive. */
export const MUTATION_BLOCKED_CLIENT_STATUSES: ClientStatus[] = [ClientStatus.ARCHIVED];

const addDays = (date: Date, days: number): Date => new Date(date.getTime() + days * 86_400_000);

const actorLabel = (actor: AuthenticatedUser): string =>
  `${actor.firstName} ${actor.lastName}`.trim();

const emptyMutationStats = (days: number) => ({
  windowDays: days,
  total: 0,
  byStatus: [],
  byReason: [],
  averageProcessingHours: null,
  applied: 0,
  rejected: 0,
  reverted: 0,
  integrationPending: 0,
  integrationLate: 0,
});
