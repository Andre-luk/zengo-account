import { Column, Entity, Index, JoinColumn, ManyToOne, OneToOne } from 'typeorm';
import { AppBaseEntity } from '@common/entities/app-base.entity';
import { InterventionAbortReason, InterventionStatus } from '@common/enums/intervention.enum';
import { AlertDispatch } from '@database/entities/alert-dispatch.entity';
import { Alert } from '@database/entities/alert.entity';
import { FieldTeam } from '@database/entities/field-team.entity';
import { InterventionReport } from '@database/entities/intervention-report.entity';
import { Organization } from '@database/entities/organization.entity';

/**
 * Mission d'intervention confiee a une equipe terrain.
 *
 * Une alerte peut donner lieu a plusieurs missions (une par equipe engagee) :
 * c'est la traduction operationnelle de l'affectation aux stations. La
 * localisation est *photographiee* a la creation, comme pour les alertes, afin
 * que le dossier reste exploitable apres une mutation du client.
 */
@Entity('interventions')
@Index(['reference'], { unique: true })
@Index(['alertId'])
@Index(['teamId'])
@Index(['stationId'])
@Index(['status'])
@Index(['assignedAt'])
export class Intervention extends AppBaseEntity {
  /** Reference lisible, ex. `IN-20261003-0004`. */
  @Column({ type: 'varchar', length: 32 })
  reference!: string;

  @Column({ name: 'alert_id', type: 'uuid' })
  alertId!: string;

  @ManyToOne(() => Alert, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'alert_id' })
  alert!: Alert;

  /** Affectation station a l'origine de la mission (si connue). */
  @Column({ name: 'dispatch_id', type: 'uuid', nullable: true })
  dispatchId!: string | null;

  @ManyToOne(() => AlertDispatch, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'dispatch_id' })
  dispatch!: AlertDispatch | null;

  @Column({ name: 'team_id', type: 'uuid' })
  teamId!: string;

  @ManyToOne(() => FieldTeam, (team) => team.interventions, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'team_id' })
  team!: FieldTeam;

  @Column({ name: 'station_id', type: 'uuid' })
  stationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'station_id' })
  station!: Organization;

  @Column({ type: 'enum', enum: InterventionStatus, default: InterventionStatus.ASSIGNED })
  status!: InterventionStatus;

  // --- Destination (photographie) ------------------------------------------
  @Column({ name: 'destination_label', type: 'varchar', length: 255, nullable: true })
  destinationLabel!: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  city!: string | null;

  @Column({ type: 'double precision', nullable: true })
  latitude!: number | null;

  @Column({ type: 'double precision', nullable: true })
  longitude!: number | null;

  /** Distance equipe -> lieu au moment de l'affectation, en metres. */
  @Column({ name: 'distance_meters', type: 'int', nullable: true })
  distanceMeters!: number | null;

  /** Estimation d'arrivee annoncee a l'affectation, en minutes. */
  @Column({ name: 'eta_minutes', type: 'int', nullable: true })
  etaMinutes!: number | null;

  // --- Cycle de vie ---------------------------------------------------------
  @Column({ name: 'assigned_at', type: 'timestamptz', default: () => 'now()' })
  assignedAt!: Date;

  @Column({ name: 'assigned_by_id', type: 'uuid', nullable: true })
  assignedById!: string | null;

  @Column({ name: 'assigned_by_label', type: 'varchar', length: 160, nullable: true })
  assignedByLabel!: string | null;

  /** Affectation automatique (equipe la plus proche) plutot que manuelle. */
  @Column({ name: 'auto_assigned', type: 'boolean', default: false })
  autoAssigned!: boolean;

  @Column({ name: 'en_route_at', type: 'timestamptz', nullable: true })
  enRouteAt!: Date | null;

  @Column({ name: 'on_site_at', type: 'timestamptz', nullable: true })
  onSiteAt!: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @Column({ name: 'aborted_at', type: 'timestamptz', nullable: true })
  abortedAt!: Date | null;

  @Column({ name: 'abort_reason', type: 'enum', enum: InterventionAbortReason, nullable: true })
  abortReason!: InterventionAbortReason | null;

  @Column({ type: 'varchar', length: 1024, nullable: true })
  notes!: string | null;

  @OneToOne(() => InterventionReport, (report) => report.intervention)
  report!: InterventionReport | null;
}
