import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  Unique,
} from 'typeorm';
import { AppBaseEntity } from '@common/entities/app-base.entity';
import {
  ClientStatus,
  Currency,
  Language,
  OfferPack,
  SubscriptionStatus,
} from '@common/enums/client.enum';
import { Device } from '@database/entities/device.entity';
import { Organization } from '@database/entities/organization.entity';
import { TariffGroup } from '@database/entities/tariff-group.entity';
import { User } from '@database/entities/user.entity';

export { Currency };

/**
 * Fiche client Zengo (compte client de la plateforme).
 *
 * Cycle de vie decrit dans le cahier des charges :
 * comptabilite -> creation par le Responsable plateforme (ID Zengo + login) ->
 * installation (liaison ID <-> numero de serie) -> activation.
 */
@Entity('client_profiles')
@Index(['zengoId'], { unique: true })
@Index(['organizationId'])
@Index(['status'])
export class ClientProfile extends AppBaseEntity {
  /** Identifiant unique Zengo, ex. `ZGO-LUB-000123`. */
  @Column({ name: 'zengo_id', type: 'varchar', length: 32 })
  zengoId!: string;

  /** Compte de connexion du client (app mobile / portail). */
  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  @Unique('uq_client_profile_user', ['userId'])
  userId!: string | null;

  @OneToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user!: User | null;

  /** Agence / point de distribution de rattachement (portefeuille). */
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ name: 'full_name', type: 'varchar', length: 160 })
  fullName!: string;

  /** Renseigne pour les clients institutionnels (pack Premium Institutions). */
  @Column({ name: 'company_name', type: 'varchar', length: 160, nullable: true })
  companyName!: string | null;

  @Column({ name: 'primary_phone', type: 'varchar', length: 32 })
  primaryPhone!: string;

  @Column({ name: 'secondary_phone', type: 'varchar', length: 32, nullable: true })
  secondaryPhone!: string | null;

  @Column({ name: 'emergency_contact_name', type: 'varchar', length: 120, nullable: true })
  emergencyContactName!: string | null;

  @Column({ name: 'emergency_contact_phone', type: 'varchar', length: 32, nullable: true })
  emergencyContactPhone!: string | null;

  @Column({ name: 'preferred_language', type: 'enum', enum: Language, default: Language.FRENCH })
  preferredLanguage!: Language;

  @Column({ type: 'varchar', length: 255, nullable: true })
  address!: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  city!: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  country!: string | null;

  @Column({ type: 'double precision', nullable: true })
  latitude!: number | null;

  @Column({ type: 'double precision', nullable: true })
  longitude!: number | null;

  @Column({ name: 'offer_pack', type: 'enum', enum: OfferPack, default: OfferPack.STANDARD })
  offerPack!: OfferPack;

  @Column({ name: 'tariff_group_id', type: 'uuid', nullable: true })
  tariffGroupId!: string | null;

  @ManyToOne(() => TariffGroup, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'tariff_group_id' })
  tariffGroup!: TariffGroup | null;

  @Column({ type: 'enum', enum: Currency, default: Currency.USD })
  currency!: Currency;

  @Column({ type: 'enum', enum: ClientStatus, default: ClientStatus.PENDING })
  status!: ClientStatus;

  @Column({ name: 'subscription_status', type: 'enum', enum: SubscriptionStatus, default: SubscriptionStatus.PENDING })
  subscriptionStatus!: SubscriptionStatus;

  @Column({ name: 'subscription_expires_at', type: 'timestamptz', nullable: true })
  subscriptionExpiresAt!: Date | null;

  @Column({ name: 'last_payment_at', type: 'timestamptz', nullable: true })
  lastPaymentAt!: Date | null;

  /** Nombre de boutons SOS factures (1 inclus dans le kit standard). */
  @Column({ name: 'sos_button_count', type: 'int', default: 1 })
  sosButtonCount!: number;

  @Column({ name: 'installation_date', type: 'timestamptz', nullable: true })
  installationDate!: Date | null;

  @Column({ name: 'installed_by_id', type: 'uuid', nullable: true })
  installedById!: string | null;

  @Column({ name: 'created_by_id', type: 'uuid', nullable: true })
  createdById!: string | null;

  /** Dispositif SafAlert lie (relation inverse du device). */
  @OneToOne(() => Device, (device) => device.client)
  device!: Device | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ type: 'jsonb', default: () => `'{}'::jsonb` })
  metadata!: Record<string, unknown>;
}
