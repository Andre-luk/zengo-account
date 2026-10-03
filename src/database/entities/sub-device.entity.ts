import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { AppBaseEntity } from '@common/entities/app-base.entity';
import { SubDeviceCode } from '@common/enums/device.enum';
import { Device } from '@database/entities/device.entity';

/**
 * Sous-appareil rattache a une centrale SafAlert (contact de porte, PIR,
 * detecteur de fumee...). Voir la "Subdevice Code Map" du protocole MQTT.
 */
@Entity('sub_devices')
@Unique('uq_subdevice_host_and_id', ['deviceId', 'subId'])
@Index(['deviceId'])
export class SubDevice extends AppBaseEntity {
  @Column({ name: 'device_id', type: 'uuid' })
  deviceId!: string;

  @ManyToOne(() => Device, (device) => device.subDevices, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'device_id' })
  device!: Device;

  /** Identifiant du sous-appareil au sein de la centrale (8 caracteres hexa). */
  @Column({ name: 'sub_id', type: 'varchar', length: 8 })
  subId!: string;

  @Column({ type: 'varchar', length: 80 })
  name!: string;

  /** Emplacement (ex. `bedroom`, `kitchen`). */
  @Column({ name: 'area_name', type: 'varchar', length: 80, nullable: true })
  areaName!: string | null;

  @Column({ type: 'enum', enum: SubDeviceCode })
  code!: SubDeviceCode;

  /**
   * Etat brut sur 8 caracteres envoye par le heartbeat.
   * `00000000` = tout est normal. Voir `SubDeviceStateBit`.
   */
  @Column({ type: 'varchar', length: 8, default: '00000000' })
  state!: string;

  @Column({ name: 'last_seen_at', type: 'timestamptz', nullable: true })
  lastSeenAt!: Date | null;

  @Column({ name: 'last_state_change_at', type: 'timestamptz', nullable: true })
  lastStateChangeAt!: Date | null;
}
