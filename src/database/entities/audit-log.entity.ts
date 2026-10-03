import { Column, Entity, Index } from 'typeorm';
import { AppBaseEntity } from '@common/entities/app-base.entity';
import { AuditAction } from '@common/enums/user.enum';

/**
 * Journal d'audit : toute action sensible est tracee (conformite au cahier des
 * charges : "Journalisation de toutes les actions", "Historique d'acces, audit").
 */
@Entity('audit_logs')
@Index(['actorUserId'])
@Index(['entityType', 'entityId'])
@Index(['organizationId'])
@Index(['createdAt'])
export class AuditLog extends AppBaseEntity {
  /** Utilisateur a l'origine de l'action (null pour les actions systeme/IoT). */
  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true })
  actorUserId!: string | null;

  @Column({ name: 'actor_label', type: 'varchar', length: 160, nullable: true })
  actorLabel!: string | null;

  @Column({ name: 'organization_id', type: 'uuid', nullable: true })
  organizationId!: string | null;

  @Column({ type: 'enum', enum: AuditAction })
  action!: AuditAction;

  @Column({ name: 'entity_type', type: 'varchar', length: 80, nullable: true })
  entityType!: string | null;

  @Column({ name: 'entity_id', type: 'varchar', length: 64, nullable: true })
  entityId!: string | null;

  @Column({ name: 'http_method', type: 'varchar', length: 10, nullable: true })
  httpMethod!: string | null;

  @Column({ name: 'http_path', type: 'varchar', length: 255, nullable: true })
  httpPath!: string | null;

  @Column({ type: 'int', name: 'http_status', nullable: true })
  httpStatus!: number | null;

  @Column({ name: 'ip_address', type: 'varchar', length: 64, nullable: true })
  ipAddress!: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 255, nullable: true })
  userAgent!: string | null;

  @Column({ name: 'before_state', type: 'jsonb', nullable: true })
  beforeState!: Record<string, unknown> | null;

  @Column({ name: 'after_state', type: 'jsonb', nullable: true })
  afterState!: Record<string, unknown> | null;

  @Column({ type: 'jsonb', default: () => `'{}'::jsonb` })
  metadata!: Record<string, unknown>;
}
