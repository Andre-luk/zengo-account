import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AppBaseEntity } from '@common/entities/app-base.entity';
import {
  HealthMeasurementSource,
  HealthMetric,
  HealthReadingStatus,
} from '@common/enums/health.enum';
import { ClientProfile } from '@database/entities/client-profile.entity';
import { Device } from '@database/entities/device.entity';
import { Organization } from '@database/entities/organization.entity';
import { User } from '@database/entities/user.entity';

/**
 * Mesure de sante d'un client (e-sante connectee).
 *
 * Une ligne par mesure, jamais modifiee : le statut (`NORMAL`, `WATCH`,
 * `CRITICAL`) est fige a l'ingestion afin que l'historique reste lisible meme si
 * les seuils cliniques evoluent. Les valeurs brutes sont conservees dans
 * `values` pour permettre le recalcul et l'export.
 */
@Entity('client_health_measurements')
@Index(['clientId', 'measuredAt'])
@Index(['clientId', 'metric', 'measuredAt'])
@Index(['status'])
@Index(['organizationId'])
export class ClientHealthMeasurement extends AppBaseEntity {
  @Column({ name: 'client_id', type: 'uuid' })
  clientId!: string;

  @ManyToOne(() => ClientProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'client_id' })
  client!: ClientProfile;

  /** Organisation de rattachement au moment de la mesure (perimetre). */
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @ManyToOne(() => Organization, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization | null;

  @Column({ type: 'enum', enum: HealthMetric })
  metric!: HealthMetric;

  /** Valeur principale : systolique, bpm, %, mg/dL, degres ou kg. */
  @Column({ type: 'numeric', precision: 8, scale: 2 })
  value!: number;

  /** Valeur secondaire : diastolique pour la tension, taille (cm) pour le poids. */
  @Column({
    name: 'secondary_value',
    type: 'numeric',
    precision: 8,
    scale: 2,
    nullable: true,
  })
  secondaryValue!: number | null;

  @Column({ type: 'varchar', length: 12, default: 'mmHg' })
  unit!: string;

  /** Appreciation automatique (`health.util.ts`). */
  @Column({ type: 'enum', enum: HealthReadingStatus })
  status!: HealthReadingStatus;

  /** Libelle clinique court, ex. « Hypertension stade 2 (165/102 mmHg) ». */
  @Column({ type: 'varchar', length: 160 })
  label!: string;

  @Column({ type: 'enum', enum: HealthMeasurementSource })
  source!: HealthMeasurementSource;

  /** Mesure a jeun (glycemie). */
  @Column({ name: 'fasting', type: 'boolean', default: false })
  fasting!: boolean;

  @Column({ name: 'measured_at', type: 'timestamptz' })
  measuredAt!: Date;

  /** Dispositif connecte a l'origine de la mesure, le cas echeant. */
  @Column({ name: 'device_id', type: 'uuid', nullable: true })
  deviceId!: string | null;

  @ManyToOne(() => Device, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'device_id' })
  device!: Device | null;

  @Column({
    name: 'device_serial',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  deviceSerial!: string | null;

  /** Auteur de la saisie (agent, infirmier) lorsque la source n'est pas un capteur. */
  @Column({ name: 'recorded_by_id', type: 'uuid', nullable: true })
  recordedById!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'recorded_by_id' })
  recordedBy!: User | null;

  @Column({
    name: 'recorded_by_label',
    type: 'varchar',
    length: 160,
    nullable: true,
  })
  recordedByLabel!: string | null;

  @Column({ type: 'text', nullable: true })
  note!: string | null;

  /** Alerte medicale generee par cette mesure (valeur critique). */
  @Column({ name: 'alert_id', type: 'uuid', nullable: true })
  alertId!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;
}
