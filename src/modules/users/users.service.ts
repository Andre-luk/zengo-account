import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Repository, SelectQueryBuilder } from 'typeorm';
import { buildPaginatedResult } from '@common/dto/pagination.dto';
import { Role } from '@common/enums/role.enum';
import { UserStatus } from '@common/enums/user.enum';
import { AuthenticatedUser, UserMembership } from '@common/interfaces/authenticated-user.interface';
import {
  assessPasswordStrength,
  generateTemporaryPassword,
  hashPassword,
  verifyPassword,
} from '@common/utils/password.util';
import { normalizeEmail, normalizePhone } from '@common/utils/identifier.util';
import { saveColumns } from '@common/utils/persistence.util';
import { Organization } from '@database/entities/organization.entity';
import { RefreshToken } from '@database/entities/refresh-token.entity';
import { UserOrganization } from '@database/entities/user-organization.entity';
import { User } from '@database/entities/user.entity';
import { OrganizationScopeService } from '@modules/organizations/organizations.service';
import {
  ChangePasswordDto,
  CreateUserDto,
  QueryUsersDto,
  ResetPasswordDto,
  UpdateUserDto,
} from '@modules/users/dto/user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(UserOrganization)
    private readonly membershipsRepository: Repository<UserOrganization>,
    @InjectRepository(Organization)
    private readonly organizationsRepository: Repository<Organization>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokensRepository: Repository<RefreshToken>,
    private readonly configService: ConfigService,
    private readonly scopeService: OrganizationScopeService,
  ) {}

  // ---------------------------------------------------------------------------
  // Creation & mise a jour
  // ---------------------------------------------------------------------------

  async create(
    dto: CreateUserDto,
  ): Promise<{ user: User; temporaryPassword?: string }> {
    if (!dto.email && !dto.phone) {
      throw new BadRequestException('Un email ou un numero de telephone est requis.');
    }

    const email = dto.email ? normalizeEmail(dto.email) : null;
    const phone = dto.phone ? normalizePhone(dto.phone) : null;
    await this.assertUniqueContact(email, phone, null);

    let temporaryPassword: string | undefined;
    let plainPassword = dto.password;
    if (!plainPassword) {
      temporaryPassword = generateTemporaryPassword();
      plainPassword = temporaryPassword;
    } else {
      const strength = assessPasswordStrength(plainPassword);
      if (!strength.valid) {
        throw new BadRequestException(
          `Mot de passe trop faible : il doit contenir ${strength.reasons.join(', ')}.`,
        );
      }
    }

    const user = this.usersRepository.create({
      email,
      phone,
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
      preferredLanguage: dto.preferredLanguage,
      status: dto.status ?? UserStatus.ACTIVE,
      passwordHash: await hashPassword(
        plainPassword,
        this.configService.get<number>('app.security.bcryptSaltRounds', 10),
      ),
      mustChangePassword: Boolean(temporaryPassword),
    });

    const saved = await this.usersRepository.save(user);

    if (dto.memberships?.length) {
      await this.replaceMemberships(saved.id, dto.memberships);
    }

    const withMemberships = await this.findByIdOrFail(saved.id);
    return { user: withMemberships, temporaryPassword };
  }

  async update(actor: AuthenticatedUser, id: string, dto: UpdateUserDto): Promise<User> {
    const user = await this.findOneInScope(actor, id);

    const email = dto.email !== undefined ? (dto.email ? normalizeEmail(dto.email) : null) : user.email;
    const phone = dto.phone !== undefined ? (dto.phone ? normalizePhone(dto.phone) : null) : user.phone;
    if (!email && !phone) {
      throw new BadRequestException('Un email ou un numero de telephone est requis.');
    }
    await this.assertUniqueContact(email, phone, user.id);

    Object.assign(user, {
      email,
      phone,
      firstName: dto.firstName?.trim() ?? user.firstName,
      lastName: dto.lastName?.trim() ?? user.lastName,
      preferredLanguage: dto.preferredLanguage ?? user.preferredLanguage,
    });

    await saveColumns(this.usersRepository, user);
    return this.findByIdOrFail(user.id);
  }

  async updateStatus(actor: AuthenticatedUser, id: string, status: UserStatus): Promise<User> {
    const user = await this.findOneInScope(actor, id);
    user.status = status;

    if (status === UserStatus.SUSPENDED || status === UserStatus.DISABLED) {
      await this.revokeAllRefreshTokens(user.id);
    }

    await saveColumns(this.usersRepository, user);
    return this.findByIdOrFail(user.id);
  }

  /** Reinitialise le mot de passe (support technique) et revoque toutes les sessions. */
  async resetPassword(
    actor: AuthenticatedUser,
    id: string,
    dto: ResetPasswordDto,
  ): Promise<{ user: User; temporaryPassword?: string }> {
    const user = await this.findOneInScope(actor, id);

    let temporaryPassword: string | undefined;
    let plainPassword = dto.password;
    if (!plainPassword) {
      temporaryPassword = generateTemporaryPassword();
      plainPassword = temporaryPassword;
    } else {
      const strength = assessPasswordStrength(plainPassword);
      if (!strength.valid) {
        throw new BadRequestException(
          `Mot de passe trop faible : il doit contenir ${strength.reasons.join(', ')}.`,
        );
      }
    }

    user.passwordHash = await hashPassword(
      plainPassword,
      this.configService.get<number>('app.security.bcryptSaltRounds', 10),
    );
    user.mustChangePassword = true;
    user.failedLoginAttempts = 0;
    user.lockedUntil = null;

    await saveColumns(this.usersRepository, user);
    await this.revokeAllRefreshTokens(user.id);

    return { user, temporaryPassword };
  }

  /** Changement de mot de passe par l'utilisateur lui-meme. */
  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.findByIdWithSecrets(userId);
    if (!user) throw new NotFoundException('Utilisateur introuvable.');

    const matches = await verifyPassword(dto.currentPassword, user.passwordHash);
    if (!matches) throw new UnauthorizedException('Mot de passe actuel incorrect.');

    const strength = assessPasswordStrength(dto.newPassword);
    if (!strength.valid) {
      throw new BadRequestException(
        `Mot de passe trop faible : il doit contenir ${strength.reasons.join(', ')}.`,
      );
    }

    user.passwordHash = await hashPassword(
      dto.newPassword,
      this.configService.get<number>('app.security.bcryptSaltRounds', 10),
    );
    user.mustChangePassword = false;
    await saveColumns(this.usersRepository, user);
    await this.revokeAllRefreshTokens(user.id);
  }

  // ---------------------------------------------------------------------------
  // Lecture
  // ---------------------------------------------------------------------------

  async findAll(user: AuthenticatedUser, query: QueryUsersDto) {
    const scope = await this.scopeService.getAccessibleOrganizationIds(user);
    if (scope !== null && scope.length === 0) {
      return buildPaginatedResult<User>([], 0, query.page, query.limit);
    }

    const builder = this.usersRepository.createQueryBuilder('user');

    if (scope !== null) {
      builder.andWhere(
        'EXISTS (SELECT 1 FROM user_organizations uo WHERE uo.user_id = user.id AND uo.organization_id IN (:...scope))',
        { scope },
      );
    }
    if (query.role) {
      builder.andWhere(
        'EXISTS (SELECT 1 FROM user_organizations uo WHERE uo.user_id = user.id AND uo.role = :role)',
        { role: query.role },
      );
    }
    if (query.organizationId) {
      builder.andWhere(
        'EXISTS (SELECT 1 FROM user_organizations uo WHERE uo.user_id = user.id AND uo.organization_id = :organizationId)',
        { organizationId: query.organizationId },
      );
    }
    if (query.status) {
      builder.andWhere('user.status = :status', { status: query.status });
    }
    if (query.search) {
      builder.andWhere(
        new Brackets((qb) => {
          qb.where('user.firstName ILIKE :search', { search: `%${query.search}%` })
            .orWhere('user.lastName ILIKE :search', { search: `%${query.search}%` })
            .orWhere('user.email ILIKE :search', { search: `%${query.search}%` })
            .orWhere('user.phone ILIKE :search', { search: `%${query.search}%` });
        }),
      );
    }

    builder
      .orderBy('user.createdAt', query.order.toUpperCase() as 'ASC' | 'DESC')
      .skip(query.skip)
      .take(query.limit);

    const [items, total] = await builder.getManyAndCount();
    await this.attachMemberships(items);

    return buildPaginatedResult(items, total, query.page, query.limit);
  }

  async findOneInScope(actor: AuthenticatedUser, id: string): Promise<User> {
    const user = await this.findByIdOrFail(id);

    if (!actor.isSuperAdmin && !actor.roles.some((role) => role === Role.SUPER_ADMIN)) {
      const scope = await this.scopeService.getAccessibleOrganizationIds(actor);
      if (scope !== null && !user.memberships.some((m) => scope.includes(m.organizationId))) {
        // Un utilisateur peut toujours consulter son propre profil.
        if (user.id !== actor.id) {
          throw new ForbiddenException("Acces refuse : utilisateur hors de votre perimetre.");
        }
      }
    }

    return user;
  }

  async findByIdOrFail(id: string): Promise<User> {
    const user = await this.usersRepository.findOne({
      where: { id },
      relations: { memberships: { organization: true } },
    });
    if (!user) throw new NotFoundException('Utilisateur introuvable.');
    return user;
  }

  async findById(id: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { id },
      relations: { memberships: { organization: true } },
    });
  }

  /** Utilisateur avec ses secrets (mot de passe, 2FA) — usage authentification uniquement. */
  async findForAuthentication(identifier: string): Promise<User | null> {
    const normalizedEmail = identifier.includes('@') ? normalizeEmail(identifier) : null;
    const normalizedPhone = identifier.includes('@') ? null : normalizePhone(identifier);

    const builder = this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .addSelect('user.twoFactorSecret')
      .leftJoinAndSelect('user.memberships', 'membership')
      .leftJoinAndSelect('membership.organization', 'organization');

    if (normalizedEmail) {
      builder.where('user.email = :email', { email: normalizedEmail });
    } else {
      builder.where('user.phone = :phone', { phone: normalizedPhone });
    }

    return builder.getOne();
  }

  async findByIdWithSecrets(id: string): Promise<User | null> {
    return this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .addSelect('user.twoFactorSecret')
      .where('user.id = :id', { id })
      .getOne();
  }

  async getMemberships(userId: string): Promise<UserMembership[]> {
    const memberships = await this.membershipsRepository.find({
      where: { userId },
      relations: { organization: true },
      order: { isPrimary: 'DESC' },
    });
    return memberships.map((membership) => this.toMembership(membership));
  }

  async toAuthenticatedUser(user: User): Promise<AuthenticatedUser> {
    const memberships = user.memberships ?? [];
    const resolved = memberships.map((membership) => this.toMembership(membership));
    const roles = Array.from(new Set(resolved.map((membership) => membership.role)));
    const primary = resolved.find((membership) => membership.isPrimary) ?? resolved[0] ?? null;

    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      firstName: user.firstName,
      lastName: user.lastName,
      preferredLanguage: user.preferredLanguage,
      isSuperAdmin: user.isSuperAdmin,
      roles: user.isSuperAdmin ? Array.from(new Set([...roles, Role.SUPER_ADMIN])) : roles,
      primaryOrganizationId: primary?.organizationId ?? null,
      memberships: resolved,
    };
  }

  // ---------------------------------------------------------------------------
  // Appartenances (memberships)
  // ---------------------------------------------------------------------------

  async replaceMemberships(userId: string, memberships: CreateUserDto['memberships']): Promise<void> {
    await this.membershipsRepository.delete({ userId });

    const deduped = new Map<string, { organizationId: string; role: Role; isPrimary: boolean }>();
    for (const membership of memberships ?? []) {
      const key = `${membership.organizationId}:${membership.role}`;
      deduped.set(key, {
        organizationId: membership.organizationId,
        role: membership.role,
        isPrimary: membership.isPrimary ?? false,
      });
    }

    const entries = [...deduped.values()];
    const organizationIds = Array.from(new Set(entries.map((entry) => entry.organizationId)));
    const organizations = await this.organizationsRepository.find({ where: { id: In(organizationIds) } });
    const foundIds = new Set(organizations.map((organization) => organization.id));
    for (const organizationId of organizationIds) {
      if (!foundIds.has(organizationId)) {
        throw new BadRequestException(`Organisation introuvable : ${organizationId}.`);
      }
    }

    if (entries.length > 0 && !entries.some((entry) => entry.isPrimary)) {
      entries[0].isPrimary = true;
    }
    if (entries.filter((entry) => entry.isPrimary).length > 1) {
      let seen = false;
      for (const entry of entries) {
        if (entry.isPrimary) {
          if (seen) entry.isPrimary = false;
          seen = true;
        }
      }
    }

    const created = entries.map((entry) =>
      this.membershipsRepository.create({ userId, ...entry }),
    );
    if (created.length > 0) {
      await this.membershipsRepository.save(created);
    }
  }

  async addMembership(
    actor: AuthenticatedUser,
    userId: string,
    organizationId: string,
    role: Role,
    isPrimary = false,
  ): Promise<User> {
    await this.findOneInScope(actor, userId);

    const organizationCount = await this.organizationsRepository.count({ where: { id: organizationId } });
    if (organizationCount === 0) throw new NotFoundException('Organisation introuvable.');

    const existing = await this.membershipsRepository.findOne({ where: { userId, organizationId, role } });
    if (existing) throw new ConflictException('Cet utilisateur possede deja ce role dans cette organisation.');

    const totalPrimary = await this.membershipsRepository.count({ where: { userId, isPrimary: true } });
    await this.membershipsRepository.save(
      this.membershipsRepository.create({
        userId,
        organizationId,
        role,
        isPrimary: isPrimary || totalPrimary === 0,
      }),
    );

    return this.findByIdOrFail(userId);
  }

  async removeMembership(actor: AuthenticatedUser, userId: string, membershipId: string): Promise<User> {
    await this.findOneInScope(actor, userId);

    const membership = await this.membershipsRepository.findOne({ where: { id: membershipId, userId } });
    if (!membership) throw new NotFoundException('Appartenance introuvable.');

    const total = await this.membershipsRepository.count({ where: { userId } });
    if (total <= 1) {
      throw new ConflictException('Un utilisateur doit conserver au moins une appartenance.');
    }

    await this.membershipsRepository.remove(membership);
    return this.findByIdOrFail(userId);
  }

  // ---------------------------------------------------------------------------
  // Authentification : suivi des echecs / succes
  // ---------------------------------------------------------------------------

  async recordSuccessfulLogin(userId: string, ipAddress: string | null): Promise<void> {
    await this.usersRepository.update(userId, {
      lastLoginAt: new Date(),
      lastLoginIp: ipAddress,
      failedLoginAttempts: 0,
      lockedUntil: null,
      status: UserStatus.ACTIVE,
    });
  }

  /** Incremente les echecs et verrouille temporairement le compte au-dela de 5 essais. */
  async recordFailedLogin(userId: string): Promise<void> {
    await this.usersRepository.increment({ id: userId }, 'failedLoginAttempts', 1);
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (user && user.failedLoginAttempts >= 5) {
      const lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
      await this.usersRepository.update(userId, { lockedUntil });
    }
  }

  /**
   * Enregistre le secret TOTP et l'etat d'activation.
   * `secret = null` desactive la 2FA et efface le secret.
   */
  async setTwoFactorSecret(userId: string, secret: string | null, enabled: boolean): Promise<void> {
    await this.usersRepository
      .createQueryBuilder()
      .update(User)
      .set({ twoFactorSecret: secret, twoFactorEnabled: enabled && Boolean(secret) })
      .where('id = :id', { id: userId })
      .execute();
  }

  async markPasswordChanged(userId: string): Promise<void> {
    await this.usersRepository.update(userId, { mustChangePassword: false });
  }

  async revokeAllRefreshTokens(userId: string): Promise<void> {
    await this.refreshTokensRepository
      .createQueryBuilder()
      .update(RefreshToken)
      .set({ revokedAt: new Date() })
      .where('user_id = :userId AND revoked_at IS NULL', { userId })
      .execute();
  }

  async countAll(): Promise<number> {
    return this.usersRepository.count();
  }

  // ---------------------------------------------------------------------------
  // Helpers prives
  // ---------------------------------------------------------------------------

  private async assertUniqueContact(
    email: string | null,
    phone: string | null,
    excludeUserId: string | null,
  ): Promise<void> {
    if (email) {
      const existing = await this.usersRepository.findOne({ where: { email } });
      if (existing && existing.id !== excludeUserId) {
        throw new ConflictException('Cet email est deja utilise.');
      }
    }
    if (phone) {
      const existing = await this.usersRepository.findOne({ where: { phone } });
      if (existing && existing.id !== excludeUserId) {
        throw new ConflictException('Ce numero de telephone est deja utilise.');
      }
    }
  }

  private async attachMemberships(users: User[]): Promise<void> {
    if (users.length === 0) return;
    const memberships = await this.membershipsRepository.find({
      where: { userId: In(users.map((user) => user.id)) },
      relations: { organization: true },
      order: { isPrimary: 'DESC' },
    });
    const byUser = new Map<string, UserOrganization[]>();
    for (const membership of memberships) {
      const list = byUser.get(membership.userId) ?? [];
      list.push(membership);
      byUser.set(membership.userId, list);
    }
    for (const user of users) {
      user.memberships = byUser.get(user.id) ?? [];
    }
  }

  private toMembership(membership: UserOrganization): UserMembership {
    return {
      organizationId: membership.organizationId,
      organizationName: membership.organization?.name ?? '',
      organizationType: membership.organization?.type,
      organizationPath: membership.organization?.path ?? '',
      role: membership.role,
      isPrimary: membership.isPrimary,
    };
  }
}

/** Type utilitaire expose pour les tests. */
export type UsersQueryBuilder = SelectQueryBuilder<User>;
