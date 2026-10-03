import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { AppBaseEntity } from '@common/entities/app-base.entity';
import {
  AlertResolution,
  AlertSeverity,
  AlertSource,
  AlertStatus,
  AlertType,
  EscalationLevel,
  VoiceCallOutcome,
} from '@common/enums/alert.enum';
import { Language } from '@common/enums/client.enum';
import { SubDeviceCode } from '@common/enums/device.enum';
import { AlertDispatch } from '@database/entities/alert-dispatch.entity';
import { AlertEvent } from '@database/entities/alert-event.entity';
import { ClientProfile } from '@database/entities/client-profile.entity';
import { Device } from '@database/entities/device.entity';
import { Organization } from '@database/entities/organization.entity';
import { SmsMessage } from '@database/entities/sms-message.entity';
import { SubDevice } from '@database/entities/sub-device.entity';
import { VoiceCall } from '@database/entities/voice-call.entity';

/**
 * Alerte issue d'un capteur SafAlert, d'un bouton SOS, de l'application mobile
 * ou d'un operateur du Zengo Monitoring Center.
 *
 * La fiche conserve une *photographie* de la localisation et du proprietaire au
 * moment du declenchement : l'alerte reste exploitable meme si le client est
 * ensuite mute ou si le dispositif est reattribue.
 */
@Entity('alerts')
@Index(['reference'], { unique: true })
@Index(['status'])
@Index(['type'])
@Index(['organizationId'])
@Index(['clientId'])
@Index(['openedAt'])
@Index(['status', 'escalationLevel'])
export class Alert extends AppBaseEntity {
  /** Reference lisible, ex. `AL-20261003-0007`. */
  @Column({ type: 'varchar', length: 32 })
  reference!: string;

  @Column({ type: 'enum', enum: AlertType })
  type!: AlertType;

  @Column({ type: 'enum', enum: AlertSeverity, default: AlertSeverity.HIGH })
  severity!: AlertSeverity;

  @Column({ type: 'enum', enum: AlertStatus, default: AlertStatus.NEW })
  status!: AlertStatus;

  @Column({ type: 'enum', enum: AlertSource })
  source!: AlertSource;

  /** Client a l'origine de l'alerte (nullable si le dispositif n'est pas rattache). */
  @Column({ name: 'client_id', type: 'uuid', nullable: true })
  clientId!: string | null;

  @ManyToOne(() => ClientProfile, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'client_id' })
  client!: ClientProfile | null;

  @Column({ name: 'device_id', type: 'uuid', nullable: true })
  deviceId!: string | null;

  @ManyToOne(() => Device, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'device_id' })
  device!: Device | null;

  @Column({ name: 'sub_device_id', type: 'uuid', nullable: true })
  subDeviceId!: string | null;

  @ManyToOne(() => SubDevice, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'sub_device_id' })
  subDevice!: SubDevice | null;

  /**
   * Agence / point de distribution portant la responsabilite de l'alerte.
   * C'est ce rattachement qui determine les chambres de secours destinataires.
   */
  @Column({ name: 'organization_id', type: 'uuid', nullable: true })
  organizationId!: string | null;

  @ManyToOne(() => Organization, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization | null;

  @Column({ name: 'trigger_message', type: 'varchar', length: 512, nullable: true })
  triggerMessage!: string | null;

  @Column({ name: 'sub_device_code', type: 'enum', enum: SubDeviceCode, nullable: true })
  subDeviceCode!: SubDeviceCode | null;

  /** Code numerique brut transmis par la centrale (mapping a confirmer fournisseur). */
  @Column({ name: 'raw_type', type: 'int', nullable: true })
  rawType!: number | null;

  // --- Localisation au moment de l'alerte -----------------------------------
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

  // --- Cycle de vie ----------------------------------------------------------
  @Column({ name: 'opened_at', type: 'timestamptz', default: () => 'now()' })
  openedAt!: Date;

  @Column({ name: 'acknowledged_at', type: 'timestamptz', nullable: true })
  acknowledgedAt!: Date | null;

  @Column({ name: 'acknowledged_by_id', type: 'uuid', nullable: true })
  acknowledgedById!: string | null;

  @Column({ name: 'dispatched_at', type: 'timestamptz', nullable: true })
  dispatchedAt!: Date | null;

  @Column({ name: 'escalated_at', type: 'timestamptz', nullable: true })
  escalatedAt!: Date | null;

  @Column({ name: 'escalation_level', type: 'int', default: EscalationLevel.NONE })
  escalationLevel!: number;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt!: Date | null;

  @Column({ name: 'resolved_by_id', type: 'uuid', nullable: true })
  resolvedById!: string | null;

  @Column({ type: 'enum', enum: AlertResolution, nullable: true })
  resolution!: AlertResolution | null;

  @Column({ name: 'resolution_note', type: 'text', nullable: true })
  resolutionNote!: string | null;

  // --- Appel vocal IA --------------------------------------------------------
  @Column({ name: 'voice_call_outcome', type: 'enum', enum: VoiceCallOutcome, nullable: true })
  voiceCallOutcome!: VoiceCallOutcome | null;

  @Column({ name: 'voice_call_language', type: 'enum', enum: Language, nullable: true })
  voiceCallLanguage!: Language | null;

  /** Le client a confirme etre a l'origine du declenchement. */
  @Column({ name: 'client_confirmed', type: 'boolean', default: false })
  clientConfirmed!: boolean;

  // --- Regroupement d'occurrences -------------------------------------------
  @Column({ name: 'occurrence_count', type: 'int', default: 1 })
  occurrenceCount!: number;

  @Column({ name: 'last_occurrence_at', type: 'timestamptz', default: () => 'now()' })
  lastOccurrenceAt!: Date;

  @OneToMany(() => AlertEvent, (event) => event.alert)
  events!: AlertEvent[];

  @OneToMany(() => AlertDispatch, (dispatch) => dispatch.alert)
  dispatches!: AlertDispatch[];

  @OneToMany(() => VoiceCall, (voiceCall) => voiceCall.alert)
  voiceCalls!: VoiceCall[];

  @OneToMany(() => SmsMessage, (sms) => sms.alert)
  smsMessages!: SmsMessage[];

  @Column({ type: 'jsonb', default: () => `'{}'::jsonb` })
  metadata!: Record<string, unknown>;
}
