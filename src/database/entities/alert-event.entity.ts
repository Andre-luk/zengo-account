import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AppBaseEntity } from '@common/entities/app-base.entity';
import { AlertEventType } from '@common/enums/alert.enum';
import { Alert } from '@database/entities/alert.entity';

/**
 * Chronologie fonctionnelle d'une alerte (qui a fait quoi, quand).
 * Distinct du journal d'audit technique : c'est le dossier d'intervention,
 * consultable par le ZMC et les stations.
 */
@Entity('alert_events')
@Index(['alertId'])
@Index(['createdAt'])
export class AlertEvent extends AppBaseEntity {
  @Column({ name: 'alert_id', type: 'uuid' })
  alertId!: string;

  @ManyToOne(() => Alert, (alert) => alert.events, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'alert_id' })
  alert!: Alert;

  @Column({ type: 'enum', enum: AlertEventType })
  type!: AlertEventType;

  @Column({ type: 'varchar', length: 512, nullable: true })
  message!: string | null;

  /** Auteur de l'action ; `null` pour une action automatique du systeme. */
  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true })
  actorUserId!: string | null;

  @Column({ name: 'actor_label', type: 'varchar', length: 160, nullable: true })
  actorLabel!: string | null;

  @Column({ type: 'jsonb', default: () => `'{}'::jsonb` })
  data!: Record<string, unknown>;
}
