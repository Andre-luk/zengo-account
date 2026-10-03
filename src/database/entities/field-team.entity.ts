import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, Unique } from 'typeorm';
import { AppBaseEntity } from '@common/entities/app-base.entity';
import { FieldTeamStatus } from '@common/enums/intervention.enum';
import { StationType } from '@common/enums/organization.enum';
import { Intervention } from '@database/entities/intervention.entity';
import { Organization } from '@database/entities/organization.entity';
import { TeamPosition } from '@database/entities/team-position.entity';

/**
 * Equipe d'intervention terrain rattachee a une station (chambre de secours).
 *
 * L'equipe porte la *derniere position connue*, mise a jour par l'application
 * mobile de l'agent ou un boitier GPS embarque ; l'historique complet reste
 * dans `team_positions`. Cette denormalisation evite une jointure couteuse lors
 * du calcul de l'equipe la plus proche.
 */
@Entity('field_teams')
@Unique('uq_field_team_station_name', ['stationId', 'name'])
@Index(['stationId'])
@Index(['status'])
@Index(['speciality'])
export class FieldTeam extends AppBaseEntity {
  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'varchar', length: 32, nullable: true })
  code!: string | null;

  @Column({ name: 'station_id', type: 'uuid' })
  stationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'station_id' })
  station!: Organization;

  /** Famille d'intervention : incendie, medicale, intrusion ou mixte. */
  @Column({ type: 'enum', enum: StationType, default: StationType.MIXED })
  speciality!: StationType;

  @Column({ type: 'enum', enum: FieldTeamStatus, default: FieldTeamStatus.AVAILABLE })
  status!: FieldTeamStatus;

  @Column({ name: 'leader_name', type: 'varchar', length: 120, nullable: true })
  leaderName!: string | null;

  @Column({ name: 'leader_phone', type: 'varchar', length: 32, nullable: true })
  leaderPhone!: string | null;

  @Column({ name: 'members_count', type: 'int', default: 2 })
  membersCount!: number;

  @Column({ name: 'vehicle_plate', type: 'varchar', length: 32, nullable: true })
  vehiclePlate!: string | null;

  // --- Derniere position connue --------------------------------------------
  @Column({ name: 'current_latitude', type: 'double precision', nullable: true })
  currentLatitude!: number | null;

  @Column({ name: 'current_longitude', type: 'double precision', nullable: true })
  currentLongitude!: number | null;

  @Column({ name: 'last_position_at', type: 'timestamptz', nullable: true })
  lastPositionAt!: Date | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'varchar', length: 512, nullable: true })
  notes!: string | null;

  @OneToMany(() => Intervention, (intervention) => intervention.team)
  interventions!: Intervention[];

  @OneToMany(() => TeamPosition, (position) => position.team)
  positions!: TeamPosition[];
}
