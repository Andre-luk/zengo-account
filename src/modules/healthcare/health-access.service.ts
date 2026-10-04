import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { buildPaginatedResult, PaginatedResult } from '@common/dto/pagination.dto';
import {
  HEALTH_MANAGER_ROLES,
  HEALTH_STAFF_ROLES,
  HealthAccessAction,
  HealthConsentChannel,
  HealthConsentScope,
  HealthConsentStatus,
} from '@common/enums/health.enum';
import { Role } from '@common/enums/role.enum';
import { AuthenticatedUser } from '@common/interfaces/authenticated-user.interface';
import {
  ConsentLike,
  defaultConsentExpiry,
  evaluateConsent,
  hasConsent,
  isConsentExpired,
} from '@common/utils/health.util';
import { ClientProfile } from '@database/entities/client-profile.entity';
import { HealthAccessLog } from '@database/entities/health-access-log.entity';
import { HealthConsent } from '@database/entities/health-consent.entity';
import { OrganizationScopeService } from '@modules/organizations/organizations.service';
import {
  GrantConsentDto,
  QueryMeasurementsDto,
  RevokeConsentDto,
} from '@modules/healthcare/dto/health.dto';

export interface HealthConsentView {
  id: string;
  scope: HealthConsentScope;
  status: HealthConsentStatus;
  channel: HealthConsentChannel;
  grantedAt: Date;
  grantedByLabel: string | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  revokedReason: string | null;
  statement: string | null;
  /** Consentement encore valable a l'instant present. */
  active: boolean;
}

export interface HealthAccessLogView {
  id: string;
  action: HealthAccessAction;
  scope: HealthConsentScope | null;
  actorLabel: string;
  actorRole: string | null;
  reason: string;
  detail: string | null;
  occurredAt: Date;
}

/** Acteur reconnu comme personnel de sante. */
export const isHealthStaff = (actor: AuthenticatedUser): boolean =>
  actor.roles.some((role) => HEALTH_STAFF_ROLES.has(role));

/** Acteur habilité a piloter les demandes de soin. */
export const isHealthManager = (actor: AuthenticatedUser): boolean =>
  actor.roles.some((role) => HEALTH_MANAGER_ROLES.has(role));

export const actorLabel = (actor: AuthenticatedUser): string =>
  `${actor.firstName} ${actor.lastName}`.trim();

/**
 * Garde d'acces aux donnees de sante.
 *
 * Trois responsabilites, volontairement regroupees car elles font partie du
 * meme parcours : resoudre le dossier client dans le perimetre de l'utilisateur,
 * verifier le consentement du client pour la finalite demandee, et journaliser
 * chaque acces (consultation, export, partage, acces d'urgence).
 */
@Injectable()
export class HealthAccessService {
  constructor(
    @InjectRepository(ClientProfile)
    private readonly clientRepository: Repository<ClientProfile>,
    @InjectRepository(HealthConsent)
    private readonly consentRepository: Repository<HealthConsent>,
    @InjectRepository(HealthAccessLog)
    private readonly accessLogRepository: Repository<HealthAccessLog>,
    private readonly scopeService: OrganizationScopeService,
  ) {}

  /** Profil client accessible a l'utilisateur, ou exception. */
  async resolveClient(
    actor: AuthenticatedUser,
    clientId: string,
  ): Promise<ClientProfile> {
    // Un client n'a pas de perimetre organisationnel : il est proprietaire de
    // son dossier, charge par son compte utilisateur.
    if (actor.roles.includes(Role.CLIENT)) {
      const own = await this.clientRepository.findOne({
        where: { userId: actor.id },
      });
      if (!own) {
        throw new NotFoundException('Dossier client introuvable.');
      }
      if (own.id !== clientId) {
        throw new ForbiddenException(
          'Vous ne pouvez consulter que votre propre dossier de sante.',
        );
      }
      return own;
    }

    const client = await this.clientRepository.findOne({ where: { id: clientId } });
    if (!client) {
      throw new NotFoundException('Dossier client introuvable.');
    }

    await this.scopeService.assertInScope(actor, client.organizationId);
    return client;
  }

  /** Refuse l'acces si l'utilisateur n'appartient pas au personnel de sante. */
  assertHealthStaff(actor: AuthenticatedUser): void {
    if (!isHealthStaff(actor)) {
      throw new ForbiddenException(
        "Acces refuse : les donnees de sante sont reservees au personnel habilite.",
      );
    }
  }

  /** Refuse l'acces si l'utilisateur ne peut pas piloter les demandes de soin. */
  assertHealthManager(actor: AuthenticatedUser): void {
    if (!isHealthManager(actor)) {
      throw new ForbiddenException(
        "Acces refuse : seuls le personnel de sante et la direction peuvent gerer les demandes de soin.",
      );
    }
  }

  /** Consentements enregistres pour un client, du plus recent au plus ancien. */
  async listConsents(clientId: string): Promise<HealthConsentView[]> {
    const consents = await this.consentRepository.find({
      where: { clientId },
      order: { grantedAt: 'DESC' },
    });
    return consents.map((consent) => this.toConsentView(consent));
  }

  /** Consentement valide pour une finalite donnee. */
  async hasConsent(
    clientId: string,
    scope: HealthConsentScope,
    at: Date = new Date(),
  ): Promise<boolean> {
    return hasConsent(await this.consentsOf(clientId), scope, at);
  }

  /**
   * Controle d'acces aux donnees de sante.
   *
   * Le personnel de sante doit disposer d'un consentement valide, sauf acces
   * d'urgence (tracabilite renforcee). Le client accede toujours a son propre
   * dossier.
   */
  async assertReadAccess(
    actor: AuthenticatedUser,
    client: ClientProfile,
    options: { scope?: HealthConsentScope; emergency?: boolean } = {},
  ): Promise<void> {
    if (this.isOwnDossier(actor, client)) return;

    const scope = options.scope ?? HealthConsentScope.DATA_SHARING;
    const decision = evaluateConsent(await this.consentsOf(client.id), scope, {
      emergency: options.emergency,
    });

    if (!decision.allowed) {
      await this.log({
        clientId: client.id,
        action: HealthAccessAction.VIEW,
        scope,
        actor,
        reason: this.describeRefusal(decision.reason),
        detail: 'Acces refuse faute de consentement valide.',
      });
      throw new ForbiddenException(
        "Acces refuse : le client n'a pas donne son consentement pour cette utilisation de ses donnees de sante.",
      );
    }

    if (decision.reason === 'EMERGENCY_BYPASS') {
      await this.log({
        clientId: client.id,
        action: HealthAccessAction.EMERGENCY,
        scope,
        actor,
        reason: "Acces d'urgence : divulgation sans consentement prealable.",
      });
    }
  }

  /**
   * Octroi d'un consentement.
   *
   * Un consentement deja actif pour la meme finalite ne peut pas etre duplique :
   * il faut d'abord le revoquer, afin que l'historique reste lisible.
   */
  async grant(
    actor: AuthenticatedUser,
    client: ClientProfile,
    dto: GrantConsentDto,
  ): Promise<HealthConsentView> {
    const consents = await this.consentsOf(client.id);
    if (hasConsent(consents, dto.scope)) {
      throw new ConflictException(
        'Un consentement actif existe deja pour cette finalite : revoquez-le avant d en enregistrer un nouveau.',
      );
    }

    const grantedAt = new Date();
    const months = dto.months ?? 0;
    const consent = this.consentRepository.create({
      clientId: client.id,
      scope: dto.scope,
      status: HealthConsentStatus.GRANTED,
      channel: dto.channel ?? HealthConsentChannel.CLIENT_APP,
      grantedAt,
      grantedByLabel: actorLabel(actor),
      expiresAt:
        months > 0 ? defaultConsentExpiry(grantedAt, months) : null,
      statement: dto.statement ?? null,
      metadata: { recordedBy: actor.id },
    });
    const saved = await this.consentRepository.save(consent);

    await this.log({
      clientId: client.id,
      action: HealthAccessAction.CONSENT_GRANTED,
      scope: dto.scope,
      actor,
      reason: `Consentement ${dto.scope} enregistre.`,
      detail: saved.expiresAt
        ? `Valable jusqu au ${saved.expiresAt.toISOString()}.`
        : 'Sans limite de duree.',
    });

    return this.toConsentView(saved);
  }

  /** Retrait d'un consentement : le client peut toujours revenir sur son choix. */
  async revoke(
    actor: AuthenticatedUser,
    client: ClientProfile,
    dto: RevokeConsentDto,
  ): Promise<HealthConsentView> {
    const consents = await this.consentsOf(client.id);
    if (!hasConsent(consents, dto.scope)) {
      throw new BadRequestException(
        "Aucun consentement actif pour cette finalite : rien a revoquer.",
      );
    }

    const latest = consents
      .filter((consent) => consent.scope === dto.scope)
      .sort((a, b) => b.grantedAt.getTime() - a.grantedAt.getTime())[0];

    latest.status = HealthConsentStatus.REVOKED;
    latest.revokedAt = new Date();
    latest.revokedByLabel = actorLabel(actor);
    latest.revokedReason = dto.reason;
    const saved = await this.consentRepository.save(latest);

    await this.log({
      clientId: client.id,
      action: HealthAccessAction.CONSENT_REVOKED,
      scope: dto.scope,
      actor,
      reason: dto.reason,
    });

    return this.toConsentView(saved);
  }

  /** Bascule les consentements echus en `EXPIRED` (tache planifiee). */
  async expireDueConsents(now: Date = new Date()): Promise<number> {
    const candidates = await this.consentRepository.find({
      where: { status: HealthConsentStatus.GRANTED },
    });
    const expired = candidates.filter((consent) =>
      isConsentExpired(consent as unknown as ConsentLike, now),
    );
    if (expired.length === 0) return 0;

    for (const consent of expired) {
      consent.status = HealthConsentStatus.EXPIRED;
    }
    await this.consentRepository.save(expired);
    return expired.length;
  }

  /** Enregistre une entree du journal d'acces (best effort, jamais bloquant). */
  async log(entry: {
    clientId: string;
    action: HealthAccessAction;
    scope?: HealthConsentScope | null;
    actor: AuthenticatedUser;
    reason: string;
    detail?: string | null;
    ipAddress?: string | null;
  }): Promise<void> {
    const log = this.accessLogRepository.create({
      clientId: entry.clientId,
      action: entry.action,
      scope: entry.scope ?? null,
      actorId: entry.actor.id,
      actorLabel: actorLabel(entry.actor),
      actorRole: entry.actor.roles[0] ?? null,
      reason: entry.reason,
      detail: entry.detail ?? null,
      ipAddress: entry.ipAddress ?? null,
      occurredAt: new Date(),
    });
    await this.accessLogRepository.save(log);
  }

  /** Journal d'acces d'un dossier (contrepartie du consentement). */
  async listAccessLogs(
    clientId: string,
    query: QueryMeasurementsDto,
  ): Promise<PaginatedResult<HealthAccessLogView>> {
    const [logs, total] = await this.accessLogRepository.findAndCount({
      where: { clientId },
      order: { occurredAt: 'DESC' },
      skip: query.skip,
      take: query.limit,
    });
    return buildPaginatedResult(
      logs.map((log) => ({
        id: log.id,
        action: log.action,
        scope: log.scope,
        actorLabel: log.actorLabel,
        actorRole: log.actorRole,
        reason: log.reason,
        detail: log.detail,
        occurredAt: log.occurredAt,
      })),
      total,
      query.page,
      query.limit,
    );
  }

  /** Nombre d'acces enregistres pour une liste de clients. */
  async countAccessesByClient(clientIds: string[]): Promise<Record<string, number>> {
    if (clientIds.length === 0) return {};
    const rows = await this.accessLogRepository
      .createQueryBuilder('log')
      .select('log.client_id', 'client_id')
      .addSelect('COUNT(*)', 'total')
      .where('log.client_id IN (:...clientIds)', { clientIds })
      .groupBy('log.client_id')
      .getRawMany<{ client_id: string; total: string }>();

    return rows.reduce<Record<string, number>>((accumulator, row) => {
      accumulator[row.client_id] = Number(row.total);
      return accumulator;
    }, {});
  }

  /** Clients disposant d'au moins un consentement pour une finalite. */
  async clientsWithConsent(scope: HealthConsentScope): Promise<string[]> {
    const consents = await this.consentRepository.find({
      where: { scope, status: HealthConsentStatus.GRANTED },
    });
    const now = new Date();
    return consents
      .filter(
        (consent) =>
          !consent.revokedAt &&
          (!consent.expiresAt || consent.expiresAt.getTime() > now.getTime()),
      )
      .map((consent) => consent.clientId);
  }

  private async consentsOf(clientId: string): Promise<HealthConsent[]> {
    return this.consentRepository.find({ where: { clientId } });
  }

  private isOwnDossier(
    actor: AuthenticatedUser,
    client: ClientProfile,
  ): boolean {
    return actor.roles.includes(Role.CLIENT) && client.userId === actor.id;
  }

  private describeRefusal(reason: string): string {
    switch (reason) {
      case 'CONSENT_REVOKED':
        return 'Acces refuse : le client a retire son consentement.';
      case 'CONSENT_EXPIRED':
        return 'Acces refuse : le consentement du client est arrive a echeance.';
      default:
        return "Acces refuse : aucun consentement du client pour cette utilisation.";
    }
  }

  private toConsentView(consent: HealthConsent): HealthConsentView {
    const active =
      consent.status === HealthConsentStatus.GRANTED &&
      !consent.revokedAt &&
      (!consent.expiresAt || consent.expiresAt.getTime() > Date.now());

    return {
      id: consent.id,
      scope: consent.scope,
      status: consent.status,
      channel: consent.channel,
      grantedAt: consent.grantedAt,
      grantedByLabel: consent.grantedByLabel,
      expiresAt: consent.expiresAt,
      revokedAt: consent.revokedAt,
      revokedReason: consent.revokedReason,
      statement: consent.statement,
      active,
    };
  }
}
