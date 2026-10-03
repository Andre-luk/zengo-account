import { SetMetadata } from '@nestjs/common';
import { AuditAction } from '@common/enums/user.enum';

export interface AuditMetadata {
  action: AuditAction;
  entityType?: string;
}

export const AUDIT_KEY = 'auditMetadata';

/** Declare l'action d'audit associee a une route (consomme par l'intercepteur d'audit). */
export const Audit = (action: AuditAction, entityType?: string) =>
  SetMetadata(AUDIT_KEY, { action, entityType } satisfies AuditMetadata);
