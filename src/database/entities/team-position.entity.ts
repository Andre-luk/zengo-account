import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AppBaseEntity } from '@common/entities/app-base.entity';
import { TeamPositionSource } from '@common/enums/intervention.enum';
import { FieldTeam } from '@database/entities/field-team.entity';
import { Intervention } from '@database/entities/intervention.entity';

/**
 * Releve GPS d'une equipe : trace du trajet et preuve de presence.
 *
 * Ecriture append-only (jamais de mise a jour) ; la purge est pilotee par les
 * politiques de retention, pas par l'application.
 */
@Entity('team_positions')
@Index(['teamId', 'recordedAt'])
@Index(['interventionId'])
export class TeamPosition extends AppBaseEntity {
  @Column({ name: 'team_id', type: 'uuid' })
  teamId!: string;

  @ManyToOne(() => FieldTeam, (team) => team.positions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'team_id' })
  team!: FieldTeam;

  /** Mission en cours au moment du releve (nullable hors mission). */
  @Column({ name: 'intervention_id', type: 'uuid', nullable: true })
  interventionId!: string | null;

  @ManyToOne(() => Intervention, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'intervention_id' })
  intervention!: Intervention | null;

  @Column({ type: 'double precision' })
  latitude!: number;

  @Column({ type: 'double precision' })
  longitude!: number;

  /** Precision annoncee par le GPS, en metres. */
  @Column({ name: 'accuracy_meters', type: 'int', nullable: true })
  accuracyMeters!: number | null;

  @Column({ name: 'speed_kmh', type: 'double precision', nullable: true })
  speedKmh!: number | null;

  /** Cap en degres (0 = nord). */
  @Column({ name: 'heading_degrees', type: 'int', nullable: true })
  headingDegrees!: number | null;

  @Column({ type: 'enum', enum: TeamPositionSource, default: TeamPositionSource.APP })
  source!: TeamPositionSource;

  @Column({ name: 'recorded_at', type: 'timestamptz', default: () => 'now()' })
  recordedAt!: Date;
}
