import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  Unique,
} from 'typeorm';
import { AppBaseEntity } from '@common/entities/app-base.entity';
import { ArmMode, DeviceStatus } from '@common/enums/device.enum';
import { Language } from '@common/enums/client.enum';
import { ClientProfile } from '@database/entities/client-profile.entity';
import { Organization } from '@database/entities/organization.entity';
import { SubDevice } from '@database/entities/sub-device.entity';

/**
 * Dispositif SafAlert Solar G1 (host / centrale d'alarme).
 *
 * Le numero de serie (SN) est l'identifiant utilise dans les topics MQTT
 * (`{prefix}/{SN}/device/{action}`).
 */
@Entity('devices')
@Index(['serialNumber'], { unique: true })
@Index(['organizationId'])
export class Device extends AppBaseEntity {
  /** Numero de serie, ex. `3003004fba2394`. */
  @Column({ name: 'serial_number', type: 'varchar', length: 64 })
  serialNumber!: string;

  @Column({ type: 'varchar', length: 80, default: 'SafAlert Solar G1' })
  model!: string;

  @Column({ type: 'varchar', length: 32, nullable: true })
  imei!: string | null;

  /** Numero de la carte SIM Data M2M. */
  @Column({ name: 'sim_number', type: 'varchar', length: 32, nullable: true })
  simNumber!: string | null;

  /** Numero appele par la centrale pour les alertes automatiques. */
  @Column({ name: 'alarm_phone_number', type: 'varchar', length: 32, nullable: true })
  alarmPhoneNumber!: string | null;

  @Column({ name: 'client_id', type: 'uuid', nullable: true })
  @Unique('uq_device_client', ['clientId'])
  clientId!: string | null;

  @OneToOne(() => ClientProfile, (client) => client.device, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'client_id' })
  client!: ClientProfile | null;

  /** Agence proprietaire du parc (tracabilite logistique). */
  @Column({ name: 'organization_id', type: 'uuid', nullable: true })
  organizationId!: string | null;

  @ManyToOne(() => Organization, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization | null;

  @Column({ type: 'enum', enum: DeviceStatus, default: DeviceStatus.PROVISIONED })
  status!: DeviceStatus;

  @Column({ name: 'arm_mode', type: 'enum', enum: ArmMode, default: ArmMode.DISARMED })
  armMode!: ArmMode;

  /** Langue utilisee par le moteur d'alerte vocal pour ce dispositif. */
  @Column({ type: 'enum', enum: Language, default: Language.FRENCH })
  language!: Language;

  @Column({ name: 'firmware_version', type: 'int', nullable: true })
  firmwareVersion!: number | null;

  @Column({ name: 'last_seen_at', type: 'timestamptz', nullable: true })
  lastSeenAt!: Date | null;

  @Column({ name: 'last_heartbeat_at', type: 'timestamptz', nullable: true })
  lastHeartbeatAt!: Date | null;

  /** Empreinte du token courant emis par le serveur (auth MQTT). */
  @Column({ name: 'token_hash', type: 'varchar', length: 128, nullable: true, select: false })
  tokenHash!: string | null;

  @Column({ name: 'firmware_target_version', type: 'int', nullable: true })
  firmwareTargetVersion!: number | null;

  @OneToMany(() => SubDevice, (subDevice) => subDevice.device)
  subDevices!: SubDevice[];

  @Column({ type: 'jsonb', default: () => `'{}'::jsonb` })
  metadata!: Record<string, unknown>;
}
