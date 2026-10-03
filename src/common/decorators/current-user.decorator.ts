import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedUser } from '@common/interfaces/authenticated-user.interface';

/**
 * Injecte l'utilisateur authentifie (ou l'une de ses proprietes) dans un handler.
 *
 * @example
 *   findAll(@CurrentUser() user: AuthenticatedUser) {}
 *   findAll(@CurrentUser('id') userId: string) {}
 */
export const CurrentUser = createParamDecorator(
  (property: keyof AuthenticatedUser | undefined, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;
    if (!user) return undefined;
    return property ? user[property] : user;
  },
);
