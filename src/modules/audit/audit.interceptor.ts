import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AUDIT_KEY, AuditMetadata } from '@common/decorators/audit.decorator';
import { IS_PUBLIC_KEY } from '@common/decorators/public.decorator';
import { AuditAction } from '@common/enums/user.enum';
import { AuthenticatedUser } from '@common/interfaces/authenticated-user.interface';
import { extractIpAddress, extractUserAgent } from '@common/utils/request.util';
import { AuditService } from '@modules/audit/audit.service';

const SENSITIVE_KEY_PATTERN = /password|secret|token|totp|authorization/i;

const sanitize = (value: unknown, depth = 0): unknown => {
  if (depth > 4 || value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitize(item, depth + 1));
  if (typeof value !== 'object') return value;

  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    result[key] = SENSITIVE_KEY_PATTERN.test(key) ? '[redacted]' : sanitize(item, depth + 1);
  }
  return result;
};

const MUTATION_ACTION_BY_METHOD: Record<string, AuditAction> = {
  POST: AuditAction.CREATE,
  PATCH: AuditAction.UPDATE,
  PUT: AuditAction.UPDATE,
  DELETE: AuditAction.DELETE,
};

/**
 * Journalise les actions sensibles :
 *  - routes annotees `@Audit(...)` : action explicite ;
 *  - autres requetes mutantes authentifiees : action deduite de la methode HTTP.
 *
 * Les donnees sensibles (mots de passe, secrets, tokens) sont masquees.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly auditService: AuditService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return next.handle();

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;
    const method: string = request.method;
    const metadata = this.reflector.getAllAndOverride<AuditMetadata | undefined>(AUDIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const action = metadata?.action ?? MUTATION_ACTION_BY_METHOD[method];
    if (!action) return next.handle();

    return next.handle().pipe(
      tap({
        next: () => {
          const status = context.switchToHttp().getResponse()?.statusCode;
          void this.auditService.write({
            action,
            actorUserId: user?.id ?? null,
            actorLabel: user ? `${user.firstName} ${user.lastName}` : null,
            organizationId: user?.primaryOrganizationId ?? null,
            entityType: metadata?.entityType ?? null,
            entityId: request.params?.id ?? null,
            httpMethod: method,
            httpPath: request.route?.path ?? request.originalUrl,
            httpStatus: typeof status === 'number' ? status : null,
            ipAddress: extractIpAddress(request),
            userAgent: extractUserAgent(request),
            afterState: method === 'DELETE' ? null : (sanitize(request.body) as Record<string, unknown>),
            metadata: { params: sanitize(request.params), query: sanitize(request.query) },
          });
        },
      }),
    );
  }
}
