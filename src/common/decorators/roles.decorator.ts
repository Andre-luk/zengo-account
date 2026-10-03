import { SetMetadata } from '@nestjs/common';
import { Role } from '@common/enums/role.enum';

export const ROLES_KEY = 'requiredRoles';

/**
 * Restreint l'acces a une route aux roles indiques (au moins un suffit).
 * Un `SUPER_ADMIN` passe toujours.
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
