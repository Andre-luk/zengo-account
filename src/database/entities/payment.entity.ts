import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AppBaseEntity } from '@common/entities/app-base.entity';
import {
  PaymentChannel,
  PaymentMethod,
  PaymentStatus,
} from '@common/enums/subscription.enum';
import { ClientProfile } from '@database/entities/client-profile.entity';
import { Organization } from '@database/entities/organization.entity';
import { Subscription } from '@database/entities/subscription.entity';
import { User } from '@database/entities/user.entity';

/**
 * Encaissement d'un abonnement.
 *
 * Une ligne par mouvement d'argent : c'est la base de la caisse virtuelle et de
 * la reconciliation avec les operateurs Mobile Money. Une demande de paiement
 * reste `PENDING` jusqu'a l'accuse de l'operateur (webhook) ou la validation du
 * caissier, ce qui permet de detecter les encaissements annonces mais jamais
 * confirmes.
 */
@Entity('payments')
@Index(['clientId'])
@Index(['status'])
@Index(['paidAt'])
@Index(['organizationId'])
@Index(['operatorReference'], { unique: true, where: 'operator_reference IS NOT NULL' })
export class Payment extends AppBaseEntity {
  @Column({ name: 'client_id', type: 'uuid' })
  clientId!: string;

  @ManyToOne(() => ClientProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'client_id' })
  client!: ClientProfile;

  @Column({ name: 'subscription_id', type: 'uuid', nullable: true })
  subscriptionId!: string | null;

  @ManyToOne(() => Subscription, (subscription) => subscription.payments, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'subscription_id' })
  subscription!: Subscription | null;

  @Column({ type: 'enum', enum: PaymentMethod })
  method!: PaymentMethod;

  @Column({ type: 'enum', enum: PaymentChannel })
  channel!: PaymentChannel;

  @Column({ name: 'amount_usd', type: 'numeric', precision: 12, scale: 2 })
  amountUsd!: string;

  @Column({ name: 'amount_cdf', type: 'numeric', precision: 16, scale: 2, nullable: true })
  amountCdf!: string | null;

  @Column({ name: 'exchange_rate', type: 'numeric', precision: 12, scale: 4, nullable: true })
  exchangeRate!: string | null;

  /** Numero du payeur (Mobile Money) : trace du mouvement chez l'operateur. */
  @Column({ name: 'payer_msisdn', type: 'varchar', length: 32, nullable: true })
  payerMsisdn!: string | null;

  /** Reference de transaction de l'operateur (`MP240..., Airtel...`). */
  @Column({ name: 'operator_reference', type: 'varchar', length: 120, nullable: true })
  operatorReference!: string | null;

  @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.PENDING })
  status!: PaymentStatus;

  /** Agence encaisseuse : rattache le mouvement a la caisse du perimetre. */
  @Column({ name: 'organization_id', type: 'uuid', nullable: true })
  organizationId!: string | null;

  @ManyToOne(() => Organization, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization | null;

  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt!: Date | null;

  @Column({ name: 'confirmed_at', type: 'timestamptz', nullable: true })
  confirmedAt!: Date | null;

  @Column({ name: 'recorded_by_id', type: 'uuid', nullable: true })
  recordedById!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'recorded_by_id' })
  recordedBy!: User | null;

  @Column({ name: 'recorded_by_label', type: 'varchar', length: 160, nullable: true })
  recordedByLabel!: string | null;

  @Column({ name: 'failure_reason', type: 'varchar', length: 255, nullable: true })
  failureReason!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ type: 'jsonb', default: () => `'{}'::jsonb` })
  metadata!: Record<string, unknown>;
}
