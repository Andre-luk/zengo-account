import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '@common/decorators/roles.decorator';
import { Role } from '@common/enums/role.enum';
import { AuthenticatedUser } from '@common/interfaces/authenticated-user.interface';

/** Verifie que l'utilisateur possede au moins un des roles requis par la route. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;
    if (!user) throw new ForbiddenException('Authentification requise.');

    if (user.isSuperAdmin || user.roles.includes(Role.SUPER_ADMIN)) return true;

    const allowed = requiredRoles.some((role) => user.roles.includes(role));
    if (!allowed) {
      throw new ForbiddenException(
        `Acces refuse : role requis parmi [${requiredRoles.join(', ')}].`,
      );
    }
    return true;
  }
}
