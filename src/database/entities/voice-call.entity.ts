import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AppBaseEntity } from '@common/entities/app-base.entity';
import { VoiceCallOutcome, VoiceCallStatus } from '@common/enums/alert.enum';
import { Language } from '@common/enums/client.enum';
import { Alert } from '@database/entities/alert.entity';
import { ClientProfile } from '@database/entities/client-profile.entity';

/**
 * Appel vocal automatique du moteur IA multilingue.
 *
 * Sequence du cahier des charges : « Nous avons constate une ouverture de porte
 * chez vous pendant que votre systeme est arme. Etes-vous a l'origine de cette
 * action ? » -> reponse vocale (ASR) ou touches DTMF (1 / 2).
 */
@Entity('voice_calls')
@Index(['alertId'])
@Index(['providerCallId'], { unique: true, where: 'provider_call_id IS NOT NULL' })
@Index(['status'])
export class VoiceCall extends AppBaseEntity {
  @Column({ name: 'alert_id', type: 'uuid', nullable: true })
  alertId!: string | null;

  @ManyToOne(() => Alert, (alert) => alert.voiceCalls, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'alert_id' })
  alert!: Alert | null;

  @Column({ name: 'client_id', type: 'uuid', nullable: true })
  clientId!: string | null;

  @ManyToOne(() => ClientProfile, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'client_id' })
  client!: ClientProfile | null;

  /** Langue utilisee par le moteur vocal (langue preferee du client). */
  @Column({ type: 'enum', enum: Language })
  language!: Language;

  @Column({ type: 'varchar', length: 24 })
  provider!: string;

  /** Identifiant de l'appel chez le fournisseur (Twilio `CallSid`, ...). */
  @Column({ name: 'provider_call_id', type: 'varchar', length: 120, nullable: true })
  providerCallId!: string | null;

  @Column({ name: 'to_number', type: 'varchar', length: 32 })
  toNumber!: string;

  @Column({ type: 'enum', enum: VoiceCallStatus, default: VoiceCallStatus.QUEUED })
  status!: VoiceCallStatus;

  @Column({ type: 'enum', enum: VoiceCallOutcome, nullable: true })
  outcome!: VoiceCallOutcome | null;

  /** Touche DTMF composee par le client (`1` = pas moi, `2` = c'est moi). */
  @Column({ name: 'dtmf_digit', type: 'varchar', length: 4, nullable: true })
  dtmfDigit!: string | null;

  /** Intention detectee par reconnaissance vocale. */
  @Column({ name: 'detected_intent', type: 'varchar', length: 40, nullable: true })
  detectedIntent!: string | null;

  @Column({ type: 'text', nullable: true })
  transcript!: string | null;

  @Column({ name: 'recording_url', type: 'varchar', length: 512, nullable: true })
  recordingUrl!: string | null;

  /** Cle du script vocal joue (permet l'audit et l'internationalisation). */
  @Column({ name: 'script_key', type: 'varchar', length: 64, nullable: true })
  scriptKey!: string | null;

  @Column({ name: 'attempt_number', type: 'int', default: 1 })
  attemptNumber!: number;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt!: Date | null;

  @Column({ name: 'ended_at', type: 'timestamptz', nullable: true })
  endedAt!: Date | null;

  @Column({ name: 'duration_seconds', type: 'int', nullable: true })
  durationSeconds!: number | null;

  @Column({ name: 'error_message', type: 'varchar', length: 512, nullable: true })
  errorMessage!: string | null;

  @Column({ type: 'jsonb', default: () => `'{}'::jsonb` })
  metadata!: Record<string, unknown>;
}
