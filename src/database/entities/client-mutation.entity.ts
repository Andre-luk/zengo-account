import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AppBaseEntity } from '@common/entities/app-base.entity';
import {
  IntegrationHorizon,
  IntegrationOutcome,
  MutationReason,
  MutationStatus,
  MutationType,
} from '@common/enums/mutation.enum';
import { ClientProfile } from '@database/entities/client-profile.entity';
import { Organization } from '@database/entities/organization.entity';
import { User } from '@database/entities/user.entity';

/**
 * Mutation geographique d'un dossier client.
 *
 * Une ligne par demande, jamais modifiee dans son deroulement : la double
 * validation (agent demandeur puis controle qualite) et l'application laissent
 * chacune leur trace horodatee. L'historique complet du portefeuille d'un
 * client se reconstitue donc en lisant ses mutations, dans les deux sens.
 */
@Entity('client_mutations')
@Index(['clientId'])
@Index(['reference'], { unique: true })
@Index(['status'])
@Index(['requestedAt'])
export class ClientMutation extends AppBaseEntity {
  @Column({ name: 'client_id', type: 'uuid' })
  clientId!: string;

  @ManyToOne(() => ClientProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'client_id' })
  client!: ClientProfile;

  /** Reference `MU-AAAAMMJJ-NNNN`, citee par le controle qualite. */
  @Column({ type: 'varchar', length: 24 })
  reference!: string;

  @Column({ type: 'enum', enum: MutationType, default: MutationType.TRANSFER })
  type!: MutationType;

  @Column({ type: 'enum', enum: MutationStatus, default: MutationStatus.REQUESTED })
  status!: MutationStatus;

  @Column({ type: 'enum', enum: MutationReason })
  reason!: MutationReason;

  @Column({ type: 'text', nullable: true })
  note!: string | null;

  // --- Agence d'origine -----------------------------------------------------
  @Column({ name: 'from_organization_id', type: 'uuid' })
  fromOrganizationId!: string;

  @ManyToOne(() => Organization, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'from_organization_id' })
  fromOrganization!: Organization | null;

  @Column({ name: 'from_region_id', type: 'uuid', nullable: true })
  fromRegionId!: string | null;

  // --- Agence de destination ------------------------------------------------
  @Column({ name: 'to_organization_id', type: 'uuid' })
  toOrganizationId!: string;

  @ManyToOne(() => Organization, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'to_organization_id' })
  toOrganization!: Organization | null;

  @Column({ name: 'to_region_id', type: 'uuid', nullable: true })
  toRegionId!: string | null;

  // --- Demande --------------------------------------------------------------
  @Column({ name: 'requested_by_id', type: 'uuid', nullable: true })
  requestedById!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'requested_by_id' })
  requestedBy!: User | null;

  @Column({ name: 'requested_by_label', type: 'varchar', length: 160, nullable: true })
  requestedByLabel!: string | null;

  @Column({ name: 'requested_at', type: 'timestamptz', default: () => 'now()' })
  requestedAt!: Date;

  // --- Controle qualite (seconde validation) --------------------------------
  @Column({ name: 'reviewed_by_id', type: 'uuid', nullable: true })
  reviewedById!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'reviewed_by_id' })
  reviewedBy!: User | null;

  @Column({ name: 'reviewed_by_label', type: 'varchar', length: 160, nullable: true })
  reviewedByLabel!: string | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt!: Date | null;

  @Column({ name: 'review_comment', type: 'text', nullable: true })
  reviewComment!: string | null;

  @Column({ name: 'rejection_reason', type: 'varchar', length: 255, nullable: true })
  rejectionReason!: string | null;

  // --- Application du transfert --------------------------------------------
  @Column({ name: 'applied_at', type: 'timestamptz', nullable: true })
  appliedAt!: Date | null;

  @Column({ name: 'applied_by_id', type: 'uuid', nullable: true })
  appliedById!: string | null;

  @Column({ name: 'applied_by_label', type: 'varchar', length: 160, nullable: true })
  appliedByLabel!: string | null;

  /** Changement de region : les alertes ouvertes ont ete redirigees. */
  @Column({ name: 'region_changed', type: 'boolean', default: false })
  regionChanged!: boolean;

  @Column({ name: 'alerts_redirected', type: 'int', default: 0 })
  alertsRedirected!: number;

  /** Resume chiffre du dossier repris par la nouvelle agence. */
  @Column({ name: 'case_load_summary', type: 'varchar', length: 512, nullable: true })
  caseLoadSummary!: string | null;

  /** Services informes lors de l'application (qualite, ZMC, facturation...). */
  @Column({ name: 'services_notified', type: 'jsonb', default: () => `'[]'::jsonb` })
  servicesNotified!: string[];

  @Column({ name: 'client_notified_at', type: 'timestamptz', nullable: true })
  clientNotifiedAt!: Date | null;

  // --- Retour a l'agence d'origine -----------------------------------------
  @Column({ name: 'reverted_at', type: 'timestamptz', nullable: true })
  revertedAt!: Date | null;

  @Column({ name: 'reverted_by_label', type: 'varchar', length: 160, nullable: true })
  revertedByLabel!: string | null;

  @Column({ name: 'revert_reason', type: 'varchar', length: 255, nullable: true })
  revertReason!: string | null;

  // --- Retrait de la demande avant application ------------------------------
  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt!: Date | null;

  @Column({ name: 'cancellation_reason', type: 'varchar', length: 255, nullable: true })
  cancellationReason!: string | null;

  // --- Suivi de l'integration ----------------------------------------------
  @Column({ name: 'integration_7_at', type: 'timestamptz', nullable: true })
  integration7At!: Date | null;

  @Column({ name: 'integration_7_outcome', type: 'enum', enum: IntegrationOutcome, nullable: true })
  integration7Outcome!: IntegrationOutcome | null;

  @Column({ name: 'integration_7_note', type: 'text', nullable: true })
  integration7Note!: string | null;

  @Column({ name: 'integration_30_at', type: 'timestamptz', nullable: true })
  integration30At!: Date | null;

  @Column({ name: 'integration_30_outcome', type: 'enum', enum: IntegrationOutcome, nullable: true })
  integration30Outcome!: IntegrationOutcome | null;

  @Column({ name: 'integration_30_note', type: 'text', nullable: true })
  integration30Note!: string | null;

  /** Derniere relance envoyee aux responsables pour un rapport manquant. */
  @Column({ name: 'last_reminder_at', type: 'timestamptz', nullable: true })
  lastReminderAt!: Date | null;

  @Column({ type: 'jsonb', default: () => `'{}'::jsonb` })
  metadata!: Record<string, unknown>;
}

/** Horizons de suivi, exposes pour les consommateurs du module. */
export const MUTATION_INTEGRATION_HORIZONS: IntegrationHorizon[] = [
  IntegrationHorizon.DAYS_7,
  IntegrationHorizon.DAYS_30,
];
