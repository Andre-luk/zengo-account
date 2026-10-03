import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { authenticator } from 'otplib';
import { toDataURL } from 'qrcode';
import { Repository } from 'typeorm';
import { AuditAction, UserStatus } from '@common/enums/user.enum';
import { AccessTokenPayload } from '@common/interfaces/authenticated-user.interface';
import { generateOpaqueToken, sha256 } from '@common/utils/identifier.util';
import { verifyPassword } from '@common/utils/password.util';
import { RefreshToken } from '@database/entities/refresh-token.entity';
import { User } from '@database/entities/user.entity';
import { AuditService } from '@modules/audit/audit.service';
import {
  DisableTwoFactorDto,
  EnableTwoFactorDto,
  LoginDto,
  RefreshTokenDto,
} from '@modules/auth/dto/auth.dto';
import { UsersService } from '@modules/users/users.service';

/** Contexte d'appel (IP, user-agent) collecte par le controleur. */
export interface AuthRequestContext {
  ipAddress: string | null;
  userAgent: string | null;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(RefreshToken)
    private readonly refreshTokensRepository: Repository<RefreshToken>,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
  ) {
    // Tolerance d'une fenetre (30 s) sur la validation TOTP.
    authenticator.options = { window: 1 };
  }

  // ---------------------------------------------------------------------------
  // Connexion / deconnexion
  // ---------------------------------------------------------------------------

  async login(dto: LoginDto, context: AuthRequestContext) {
    const user = await this.usersService.findForAuthentication(dto.identifier);

    if (!user) {
      await this.auditService.write({
        action: AuditAction.LOGIN_FAILED,
        actorLabel: dto.identifier,
        httpMethod: 'POST',
        httpPath: '/auth/login',
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: { reason: 'USER_NOT_FOUND' },
      });
      throw new UnauthorizedException('Identifiants invalides.');
    }

    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      const remainingMs = user.lockedUntil.getTime() - Date.now();
      throw new ForbiddenException({
        message: `Compte temporairement verrouille. Reessayez dans ${Math.ceil(remainingMs / 60000)} minute(s).`,
        code: 'ACCOUNT_LOCKED',
      });
    }

    if (user.status === UserStatus.SUSPENDED || user.status === UserStatus.DISABLED) {
      throw new ForbiddenException({
        message: 'Compte suspendu ou desactive. Contactez le support.',
        code: 'ACCOUNT_DISABLED',
      });
    }

    const passwordMatches = await verifyPassword(dto.password, user.passwordHash);
    if (!passwordMatches) {
      await this.usersService.recordFailedLogin(user.id);
      await this.auditService.write({
        action: AuditAction.LOGIN_FAILED,
        actorUserId: user.id,
        actorLabel: this.userLabel(user),
        httpMethod: 'POST',
        httpPath: '/auth/login',
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: { reason: 'INVALID_PASSWORD', attempts: user.failedLoginAttempts + 1 },
      });
      throw new UnauthorizedException('Identifiants invalides.');
    }

    if (user.twoFactorEnabled && user.twoFactorSecret) {
      if (!dto.totpCode) {
        throw new UnauthorizedException({
          message: 'Code de verification a deux facteurs requis.',
          code: 'TWO_FACTOR_REQUIRED',
        });
      }
      const totpValid = authenticator.verify({ token: dto.totpCode, secret: user.twoFactorSecret });
      if (!totpValid) {
        await this.usersService.recordFailedLogin(user.id);
        await this.auditService.write({
          action: AuditAction.LOGIN_FAILED,
          actorUserId: user.id,
          actorLabel: this.userLabel(user),
          httpMethod: 'POST',
          httpPath: '/auth/login',
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          metadata: { reason: 'INVALID_TOTP' },
        });
        throw new UnauthorizedException({
          message: 'Code a deux facteurs invalide.',
          code: 'TWO_FACTOR_INVALID',
        });
      }
    }

    const tokens = await this.issueTokens(user, context);
    await this.usersService.recordSuccessfulLogin(user.id, context.ipAddress);

    await this.auditService.write({
      action: AuditAction.LOGIN,
      actorUserId: user.id,
      actorLabel: this.userLabel(user),
      organizationId: user.memberships?.[0]?.organizationId ?? null,
      httpMethod: 'POST',
      httpPath: '/auth/login',
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return {
      ...tokens,
      user: await this.buildUserSummary(user),
    };
  }

  async refresh(dto: RefreshTokenDto, context: AuthRequestContext): Promise<IssuedTokens> {
    const tokenHash = sha256(dto.refreshToken);
    const stored = await this.refreshTokensRepository.findOne({ where: { tokenHash } });

    if (!stored) throw new UnauthorizedException('Refresh token invalide.');

    if (stored.revokedAt) {
      // Reutilisation d'un token deja revoque : on revoque toutes les sessions.
      this.logger.warn(`Reutilisation d'un refresh token revoque pour l'utilisateur ${stored.userId}.`);
      await this.usersService.revokeAllRefreshTokens(stored.userId);
      throw new UnauthorizedException({
        message: 'Refresh token deja utilise. Toutes les sessions ont ete revoquees.',
        code: 'REFRESH_TOKEN_REUSED',
      });
    }

    if (stored.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException({ message: 'Refresh token expire.', code: 'REFRESH_TOKEN_EXPIRED' });
    }

    const user = await this.usersService.findByIdOrFail(stored.userId);
    if (user.status === UserStatus.SUSPENDED || user.status === UserStatus.DISABLED) {
      await this.usersService.revokeAllRefreshTokens(user.id);
      throw new ForbiddenException({ message: 'Compte suspendu ou desactive.', code: 'ACCOUNT_DISABLED' });
    }

    const tokens = await this.issueTokens(user, context);

    stored.revokedAt = new Date();
    stored.replacedByTokenHash = sha256(tokens.refreshToken);
    await this.refreshTokensRepository.save(stored);

    await this.auditService.write({
      action: AuditAction.TOKEN_REFRESH,
      actorUserId: user.id,
      actorLabel: this.userLabel(user),
      httpMethod: 'POST',
      httpPath: '/auth/refresh',
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return tokens;
  }

  async logout(userId: string, dto: RefreshTokenDto, context: AuthRequestContext): Promise<void> {
    const tokenHash = sha256(dto.refreshToken);
    await this.refreshTokensRepository
      .createQueryBuilder()
      .update(RefreshToken)
      .set({ revokedAt: new Date() })
      .where('token_hash = :tokenHash AND revoked_at IS NULL', { tokenHash })
      .execute();

    await this.auditService.write({
      action: AuditAction.LOGOUT,
      actorUserId: userId,
      httpMethod: 'POST',
      httpPath: '/auth/logout',
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
  }

  async logoutAll(userId: string, context: AuthRequestContext): Promise<void> {
    await this.usersService.revokeAllRefreshTokens(userId);
    await this.auditService.write({
      action: AuditAction.LOGOUT,
      actorUserId: userId,
      httpMethod: 'POST',
      httpPath: '/auth/logout-all',
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      metadata: { allSessions: true },
    });
  }

  // ---------------------------------------------------------------------------
  // Double authentification (TOTP)
  // ---------------------------------------------------------------------------

  async beginTwoFactorSetup(userId: string) {
    const user = await this.usersService.findByIdOrFail(userId);
    if (user.twoFactorEnabled) {
      throw new BadRequestException('La double authentification est deja active.');
    }

    const secret = authenticator.generateSecret();
    const account = user.email ?? user.phone ?? user.id;
    const issuer = this.configService.get<string>('app.appName', 'Zengo Account');
    const otpauthUrl = authenticator.keyuri(account, issuer, secret);
    const qrCodeDataUrl = await toDataURL(otpauthUrl);

    await this.usersService.setTwoFactorSecret(userId, secret, false);

    return { secret, otpauthUrl, qrCodeDataUrl };
  }

  async confirmTwoFactor(userId: string, dto: EnableTwoFactorDto, context: AuthRequestContext) {
    const user = await this.usersService.findByIdWithSecrets(userId);
    const pendingSecret = user?.twoFactorSecret;
    if (!user || !pendingSecret) {
      throw new BadRequestException("Aucune configuration 2FA en attente. Relancez l'etape d'activation.");
    }

    const valid = authenticator.verify({ token: dto.code, secret: pendingSecret });
    if (!valid) throw new BadRequestException('Code invalide. Verifiez l horloge de votre appareil.');

    await this.usersService.setTwoFactorSecret(userId, pendingSecret, true);
    await this.auditService.write({
      action: AuditAction.TWO_FACTOR_ENABLED,
      actorUserId: userId,
      httpMethod: 'POST',
      httpPath: '/auth/2fa/confirm',
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return { enabled: true };
  }

  async disableTwoFactor(userId: string, dto: DisableTwoFactorDto, context: AuthRequestContext) {
    const user = await this.usersService.findByIdWithSecrets(userId);
    if (!user) throw new UnauthorizedException('Utilisateur introuvable.');

    const matches = await verifyPassword(dto.password, user.passwordHash);
    if (!matches) throw new UnauthorizedException('Mot de passe incorrect.');

    await this.usersService.setTwoFactorSecret(userId, null, false);
    await this.auditService.write({
      action: AuditAction.TWO_FACTOR_DISABLED,
      actorUserId: userId,
      httpMethod: 'POST',
      httpPath: '/auth/2fa/disable',
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return { enabled: false };
  }

  // ---------------------------------------------------------------------------
  // Helpers prives
  // ---------------------------------------------------------------------------

  private async issueTokens(user: User, context: AuthRequestContext): Promise<IssuedTokens> {
    const accessTtl = this.configService.get<number>('app.jwt.accessTtl', 900);
    const refreshTtl = this.configService.get<number>('app.jwt.refreshTtl', 2_592_000);

    const payload: AccessTokenPayload = { sub: user.id, typ: 'access' };
    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.get<string>('app.jwt.accessSecret'),
      expiresIn: accessTtl,
    });

    const refreshToken = generateOpaqueToken();
    await this.refreshTokensRepository.save(
      this.refreshTokensRepository.create({
        userId: user.id,
        tokenHash: sha256(refreshToken),
        expiresAt: new Date(Date.now() + refreshTtl * 1000),
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      }),
    );

    // Nettoyage opportuniste des tokens expires (evite la croissance illimitee).
    await this.refreshTokensRepository
      .createQueryBuilder()
      .delete()
      .from(RefreshToken)
      .where('user_id = :userId AND expires_at < now()', { userId: user.id })
      .execute();

    return { accessToken, refreshToken, expiresIn: accessTtl, tokenType: 'Bearer' };
  }

  private async buildUserSummary(user: User) {
    const authenticated = await this.usersService.toAuthenticatedUser(user);
    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      firstName: user.firstName,
      lastName: user.lastName,
      preferredLanguage: user.preferredLanguage,
      isSuperAdmin: user.isSuperAdmin,
      mustChangePassword: user.mustChangePassword,
      twoFactorEnabled: user.twoFactorEnabled,
      roles: authenticated.roles,
      primaryOrganizationId: authenticated.primaryOrganizationId,
      memberships: authenticated.memberships,
    };
  }

  private userLabel(user: Pick<User, 'firstName' | 'lastName' | 'email' | 'phone'>): string {
    return `${user.firstName} ${user.lastName} <${user.email ?? user.phone ?? ''}>`.trim();
  }
}
