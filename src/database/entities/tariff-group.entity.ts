import { Column, Entity, Index } from 'typeorm';
import { AppBaseEntity } from '@common/entities/app-base.entity';
import { OfferPack } from '@common/enums/client.enum';

/**
 * Groupe tarifaire pilotable par la DAF (Direction Administrative & Financiere).
 *
 * Les composants tarifaires du cahier des charges sont couverts : frais initiaux
 * du kit, abonnement mensuel, prix unitaire des boutons SOS supplementaires et
 * taux de change USD -> CDF configurable.
 */
@Entity('tariff_groups')
@Index(['code'], { unique: true })
export class TariffGroup extends AppBaseEntity {
  @Column({ type: 'varchar', length: 40 })
  code!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ name: 'offer_pack', type: 'enum', enum: OfferPack })
  offerPack!: OfferPack;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  /** Frais de souscription produit (achat du kit), en USD. */
  @Column({ name: 'registration_fee_usd', type: 'numeric', precision: 12, scale: 2, default: 0 })
  registrationFeeUsd!: string;

  /** Abonnement mensuel, en USD. */
  @Column({ name: 'monthly_fee_usd', type: 'numeric', precision: 12, scale: 2, default: 0 })
  monthlyFeeUsd!: string;

  /** Nombre de boutons SOS inclus dans le kit. */
  @Column({ name: 'included_sos_buttons', type: 'int', default: 1 })
  includedSosButtons!: number;

  /** Prix unitaire d'un bouton SOS supplementaire, en USD. */
  @Column({ name: 'sos_button_unit_price_usd', type: 'numeric', precision: 12, scale: 2, default: 5 })
  sosButtonUnitPriceUsd!: string;

  /** Nombre maximum de boutons SOS configurables. */
  @Column({ name: 'max_sos_buttons', type: 'int', default: 10 })
  maxSosButtons!: number;

  /** Taux de change USD -> CDF applique par defaut a ce groupe. */
  @Column({ name: 'exchange_rate_usd_to_cdf', type: 'numeric', precision: 14, scale: 4, nullable: true })
  exchangeRateUsdToCdf!: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'effective_from', type: 'timestamptz', default: () => 'now()' })
  effectiveFrom!: Date;

  @Column({ name: 'archived_at', type: 'timestamptz', nullable: true })
  archivedAt!: Date | null;

  @Column({ type: 'jsonb', default: () => `'{}'::jsonb` })
  features!: Record<string, unknown>;
}
