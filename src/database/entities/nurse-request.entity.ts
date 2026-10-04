import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AppBaseEntity } from '@common/entities/app-base.entity';
import {
  NurseRequestPriority,
  NurseRequestStatus,
} from '@common/enums/health.enum';
import { ClientProfile } from '@database/entities/client-profile.entity';
import { Organization } from '@database/entities/organization.entity';
import { User } from '@database/entities/user.entity';

/** Message echange dans le fil d'une demande de soin. */
export interface NurseRequestMessage {
  /** Identifiant de l'auteur (`null` pour un message systeme). */
  authorId: string | null;
  authorLabel: string;
  /** `CLIENT`, `HEALTH_STAFF` ou `SYSTEM`. */
  authorSide: string;
  body: string;
  at: string;
}

/**
 * Demande de soin / appel infirmier.
 *
 * Emise par le client (application, centre d'appel) ou par un agent du PDC pour
 * le compte d'un client, elle est prise en charge par le personnel de sante
 * (`HEALTH_STAFF`) qui la suit dans un fil de messages jusqu'a la cloture.
 */
@Entity('nurse_requests')
@Index(['clientId', 'createdAt'])
@Index(['status'])
@Index(['reference'], { unique: true })
@Index(['organizationId'])
export class NurseRequest extends AppBaseEntity {
  @Column({ name: 'client_id', type: 'uuid' })
  clientId!: string;

  @ManyToOne(() => ClientProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'client_id' })
  client!: ClientProfile;

  /** Reference `NS-AAAAMMJJ-NNNN`. */
  @Column({ type: 'varchar', length: 24 })
  reference!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @ManyToOne(() => Organization, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization | null;

  @Column({
    type: 'enum',
    enum: NurseRequestStatus,
    default: NurseRequestStatus.REQUESTED,
  })
  status!: NurseRequestStatus;

  @Column({
    type: 'enum',
    enum: NurseRequestPriority,
    default: NurseRequestPriority.ROUTINE,
  })
  priority!: NurseRequestPriority;

  /** Motif de l'appel, tel que formule par le demandeur. */
  @Column({ type: 'varchar', length: 255 })
  reason!: string;

  /** Symptomes declares (texte libre). */
  @Column({ type: 'text', nullable: true })
  symptoms!: string | null;

  @Column({ name: 'requested_by_id', type: 'uuid', nullable: true })
  requestedById!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'requested_by_id' })
  requestedBy!: User | null;

  @Column({
    name: 'requested_by_label',
    type: 'varchar',
    length: 160,
    nullable: true,
  })
  requestedByLabel!: string | null;

  /** Prise en charge par le personnel de sante. */
  @Column({ name: 'assigned_to_id', type: 'uuid', nullable: true })
  assignedToId!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assigned_to_id' })
  assignedTo!: User | null;

  @Column({
    name: 'assigned_to_label',
    type: 'varchar',
    length: 160,
    nullable: true,
  })
  assignedToLabel!: string | null;

  @Column({ name: 'accepted_at', type: 'timestamptz', nullable: true })
  acceptedAt!: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt!: Date | null;

  /** Conclusion de la prise en charge. */
  @Column({ type: 'text', nullable: true })
  resolution!: string | null;

  /** Conseils delivres au client a la cloture. */
  @Column({ name: 'advice', type: 'text', nullable: true })
  advice!: string | null;

  /** Alerte medicale ouverte par cette demande (priorite urgence). */
  @Column({ name: 'alert_id', type: 'uuid', nullable: true })
  alertId!: string | null;

  /** Fil de discussion (voir `NurseRequestMessage`). */
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  messages!: NurseRequestMessage[];

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;
}
