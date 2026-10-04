import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AppBaseEntity } from '@common/entities/app-base.entity';
import {
  HealthAccessAction,
  HealthConsentScope,
} from '@common/enums/health.enum';
import { ClientProfile } from '@database/entities/client-profile.entity';
import { User } from '@database/entities/user.entity';

/** Entree du journal d'acces aux donnees de sante (tracabilite). */
export interface HealthAccessEntry {
  action: HealthAccessAction;
  actorId: string | null;
  actorLabel: string;
  actorRole: string | null;
  reason: string;
  detail?: string | null;
  occurredAt: string;
}

/**
 * Journal d'acces aux donnees de sante d'un client.
 *
 * Une ligne par consultation, export, partage ou acces d'urgence : c'est la
 * contrepartie du consentement (qui a vu quoi, quand, et pourquoi).
 */
@Entity('health_access_logs')
@Index(['clientId', 'occurredAt'])
@Index(['actorId'])
@Index(['action'])
export class HealthAccessLog extends AppBaseEntity {
  @Column({ name: 'client_id', type: 'uuid' })
  clientId!: string;

  @ManyToOne(() => ClientProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'client_id' })
  client!: ClientProfile;

  @Column({ type: 'enum', enum: HealthAccessAction })
  action!: HealthAccessAction;

  @Column({ name: 'scope', type: 'enum', enum: HealthConsentScope, nullable: true })
  scope!: HealthConsentScope | null;

  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'actor_id' })
  actor!: User | null;

  @Column({ name: 'actor_label', type: 'varchar', length: 160 })
  actorLabel!: string;

  @Column({ name: 'actor_role', type: 'varchar', length: 40, nullable: true })
  actorRole!: string | null;

  @Column({ type: 'varchar', length: 255 })
  reason!: string;

  @Column({ type: 'text', nullable: true })
  detail!: string | null;

  @Column({ name: 'ip_address', type: 'varchar', length: 64, nullable: true })
  ipAddress!: string | null;

  @Column({ name: 'occurred_at', type: 'timestamptz', default: () => 'now()' })
  occurredAt!: Date;
}
