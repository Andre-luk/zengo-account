import { Column, Entity, Index, JoinColumn, ManyToOne, OneToOne } from 'typeorm';
import { AppBaseEntity } from '@common/entities/app-base.entity';
import { InterventionOutcome } from '@common/enums/intervention.enum';
import { Intervention } from '@database/entities/intervention.entity';

/**
 * Rapport de fin d'intervention (« rapport d'intervention rapide » du cahier
 * des charges) : conclusion, actions menees, degats, photos et signature du bon
 * de reception.
 *
 * Les photos sont stockees sous forme de references (URL ou identifiant de
 * stockage objet) : le binaire ne transite jamais par la base.
 */
@Entity('intervention_reports')
@Index(['interventionId'], { unique: true })
export class InterventionReport extends AppBaseEntity {
  @Column({ name: 'intervention_id', type: 'uuid' })
  interventionId!: string;

  @OneToOne(() => Intervention, (intervention) => intervention.report, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'intervention_id' })
  intervention!: Intervention;

  @Column({ type: 'enum', enum: InterventionOutcome })
  outcome!: InterventionOutcome;

  @Column({ type: 'text' })
  summary!: string;

  @Column({ name: 'actions_taken', type: 'text', nullable: true })
  actionsTaken!: string | null;

  @Column({ type: 'text', nullable: true })
  damages!: string | null;

  @Column({ name: 'people_assisted', type: 'int', default: 0 })
  peopleAssisted!: number;

  /** References des photos prises sur place. */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  photos!: string[];

  /** Nom du signataire du bon de reception (client ou temoin). */
  @Column({ name: 'signature_name', type: 'varchar', length: 160, nullable: true })
  signatureName!: string | null;

  @Column({ name: 'signed_at', type: 'timestamptz', nullable: true })
  signedAt!: Date | null;

  /** Duree de la mission (depart -> cloture), en secondes. */
  @Column({ name: 'duration_seconds', type: 'int', nullable: true })
  durationSeconds!: number | null;

  @Column({ name: 'created_by_id', type: 'uuid', nullable: true })
  createdById!: string | null;

  @Column({ name: 'created_by_label', type: 'varchar', length: 160, nullable: true })
  createdByLabel!: string | null;

  /** Le client a ete informe digitalement de la cloture. */
  @Column({ name: 'client_notified', type: 'boolean', default: false })
  clientNotified!: boolean;
}
