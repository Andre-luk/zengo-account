import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AppBaseEntity } from '@common/entities/app-base.entity';
import {
  HealthConsentChannel,
  HealthConsentScope,
  HealthConsentStatus,
} from '@common/enums/health.enum';
import { ClientProfile } from '@database/entities/client-profile.entity';

/**
 * Consentement du client a l'usage de ses donnees de sante.
 *
 * Chaque octroi, revoque ou echeance est une ligne : le consentement n'est
 * jamais ecrase, ce qui fournit la preuve attendue par la reglementation sur les
 * donnees personnelles (le dernier enregistrement en date fait foi).
 */
@Entity('health_consents')
@Index(['clientId', 'scope'])
@Index(['status'])
export class HealthConsent extends AppBaseEntity {
  @Column({ name: 'client_id', type: 'uuid' })
  clientId!: string;

  @ManyToOne(() => ClientProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'client_id' })
  client!: ClientProfile;

  @Column({ type: 'enum', enum: HealthConsentScope })
  scope!: HealthConsentScope;

  @Column({
    type: 'enum',
    enum: HealthConsentStatus,
    default: HealthConsentStatus.GRANTED,
  })
  status!: HealthConsentStatus;

  /** Canal de recueil : application, SMS, papier signe, centre d'appel. */
  @Column({
    type: 'enum',
    enum: HealthConsentChannel,
    default: HealthConsentChannel.CLIENT_APP,
  })
  channel!: HealthConsentChannel;

  @Column({ name: 'granted_at', type: 'timestamptz', default: () => 'now()' })
  grantedAt!: Date;

  @Column({
    name: 'granted_by_label',
    type: 'varchar',
    length: 160,
    nullable: true,
  })
  grantedByLabel!: string | null;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt!: Date | null;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @Column({
    name: 'revoked_by_label',
    type: 'varchar',
    length: 160,
    nullable: true,
  })
  revokedByLabel!: string | null;

  @Column({ name: 'revoked_reason', type: 'varchar', length: 255, nullable: true })
  revokedReason!: string | null;

  /** Texte integral presente au client (preuve de l'information delivree). */
  @Column({ type: 'text', nullable: true })
  statement!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;
}
