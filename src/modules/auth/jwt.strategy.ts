import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UserStatus } from '@common/enums/user.enum';
import { AccessTokenPayload, AuthenticatedUser } from '@common/interfaces/authenticated-user.interface';
import { UsersService } from '@modules/users/users.service';

/**
 * Verifie le token d'acces et recharge l'utilisateur (statut, roles et
 * appartenances a jour, afin qu'une revocation soit immediate).
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('app.jwt.accessSecret') ?? 'dev-access-secret-change-me',
    });
  }

  async validate(payload: AccessTokenPayload): Promise<AuthenticatedUser> {
    const user = await this.usersService.findById(payload.sub);
    if (!user) throw new UnauthorizedException('Session invalide.');

    if (user.status === UserStatus.SUSPENDED || user.status === UserStatus.DISABLED) {
      throw new UnauthorizedException('Compte suspendu ou desactive.');
    }

    return this.usersService.toAuthenticatedUser(user);
  }
}
