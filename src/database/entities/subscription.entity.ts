import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { AppBaseEntity } from '@common/entities/app-base.entity';
import {
  SubscriptionCodeStatus,
  SubscriptionDuration,
} from '@common/enums/subscription.enum';
import { ClientProfile } from '@database/entities/client-profile.entity';
import { Payment } from '@database/entities/payment.entity';
import { TariffGroup } from '@database/entities/tariff-group.entity';
import { User } from '@database/entities/user.entity';

/**
 * Code d'abonnement unique, lie au client et envoye par SMS a chaque paiement.
 *
 * Un code porte la periode qu'il ouvre : c'est la preuve d'achat que le client
 * conserve, et la reference que le centre de service client peut verifier.
 * L'activation d'un code etend l'abonnement du client (elle ne le remplace
 * jamais : les jours restants ne sont pas perdus).
 */
@Entity('subscriptions')
@Index(['code'], { unique: true })
@Index(['clientId'])
@Index(['endsAt'])
@Index(['status'])
export class Subscription extends AppBaseEntity {
  @Column({ name: 'client_id', type: 'uuid' })
  clientId!: string;

  @ManyToOne(() => ClientProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'client_id' })
  client!: ClientProfile;

  /** Code dicte au client, au format `ZG-XXXX-XXXX`. */
  @Column({ type: 'varchar', length: 24 })
  code!: string;

  @Column({ name: 'duration_days', type: 'enum', enum: SubscriptionDuration })
  durationDays!: SubscriptionDuration;

  @Column({ type: 'enum', enum: SubscriptionCodeStatus, default: SubscriptionCodeStatus.ISSUED })
  status!: SubscriptionCodeStatus;

  /** Debut de la periode couverte (fin de la precedente si renouvellement anticipe). */
  @Column({ name: 'starts_at', type: 'timestamptz' })
  startsAt!: Date;

  @Column({ name: 'ends_at', type: 'timestamptz' })
  endsAt!: Date;

  @Column({ name: 'price_usd', type: 'numeric', precision: 12, scale: 2 })
  priceUsd!: string;

  @Column({ name: 'price_cdf', type: 'numeric', precision: 16, scale: 2, nullable: true })
  priceCdf!: string | null;

  /** Taux applique au moment de la vente : il explique le prix en francs. */
  @Column({ name: 'exchange_rate', type: 'numeric', precision: 12, scale: 4, nullable: true })
  exchangeRate!: string | null;

  @Column({ name: 'remise_usd', type: 'numeric', precision: 12, scale: 2, default: 0 })
  discountUsd!: string;

  @Column({ name: 'tariff_group_id', type: 'uuid', nullable: true })
  tariffGroupId!: string | null;

  @ManyToOne(() => TariffGroup, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'tariff_group_id' })
  tariffGroup!: TariffGroup | null;

  /** Premier abonnement du client : il porte les frais d'installation. */
  @Column({ name: 'is_first_subscription', type: 'boolean', default: false })
  isFirstSubscription!: boolean;

  @Column({ name: 'issued_by_id', type: 'uuid', nullable: true })
  issuedById!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'issued_by_id' })
  issuedBy!: User | null;

  @Column({ name: 'issued_by_label', type: 'varchar', length: 160, nullable: true })
  issuedByLabel!: string | null;

  @Column({ name: 'issued_at', type: 'timestamptz', default: () => 'now()' })
  issuedAt!: Date;

  @Column({ name: 'activated_at', type: 'timestamptz', nullable: true })
  activatedAt!: Date | null;

  /** Canal d'activation : `SELF_SERVICE` (application) ou `BACK_OFFICE` (console). */
  @Column({ name: 'activated_by', type: 'varchar', length: 32, nullable: true })
  activatedBy!: string | null;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt!: Date | null;

  @Column({ name: 'cancellation_reason', type: 'varchar', length: 255, nullable: true })
  cancellationReason!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @OneToMany(() => Payment, (payment) => payment.subscription)
  payments!: Payment[];

  @Column({ type: 'jsonb', default: () => `'{}'::jsonb` })
  metadata!: Record<string, unknown>;
}
