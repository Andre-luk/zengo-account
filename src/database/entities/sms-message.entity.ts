import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AppBaseEntity } from '@common/entities/app-base.entity';
import { Language } from '@common/enums/client.enum';
import {
  SmsDirection,
  SmsEncoding,
  SmsMessageStatus,
  SmsTemplate,
} from '@common/enums/sms.enum';
import { Alert } from '@database/entities/alert.entity';
import { ClientProfile } from '@database/entities/client-profile.entity';
import { Intervention } from '@database/entities/intervention.entity';

/**
 * Message SMS transactionnel envoye au client (ou recu de lui).
 *
 * Ecriture append-only du point de vue metier : on ne modifie que l'etat de
 * remise (`status`, `deliveredAt`, `errorCode`) au fil des accuses du
 * fournisseur. Le corps du message est conserve tel qu'il a ete envoye, ce qui
 * permet de le relire depuis la console des annees plus tard.
 */
@Entity('sms_messages')
@Index(['alertId'])
@Index(['clientId'])
@Index(['status'])
@Index(['createdAt'])
export class SmsMessage extends AppBaseEntity {
  @Column({ name: 'alert_id', type: 'uuid', nullable: true })
  alertId!: string | null;

  @ManyToOne(() => Alert, (alert) => alert.smsMessages, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'alert_id' })
  alert!: Alert | null;

  @Column({ name: 'client_id', type: 'uuid', nullable: true })
  clientId!: string | null;

  @ManyToOne(() => ClientProfile, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'client_id' })
  client!: ClientProfile | null;

  @Column({ name: 'intervention_id', type: 'uuid', nullable: true })
  interventionId!: string | null;

  @ManyToOne(() => Intervention, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'intervention_id' })
  intervention!: Intervention | null;

  @Column({ type: 'enum', enum: SmsDirection, default: SmsDirection.OUTBOUND })
  direction!: SmsDirection;

  @Column({ type: 'enum', enum: SmsTemplate })
  template!: SmsTemplate;

  /** Langue du destinataire au moment de l'envoi. */
  @Column({ type: 'enum', enum: Language })
  language!: Language;

  @Column({ type: 'varchar', length: 24 })
  provider!: string;

  /** Identifiant du message chez le fournisseur (Twilio `MessageSid`, ...). */
  @Column({ name: 'provider_message_id', type: 'varchar', length: 120, nullable: true })
  providerMessageId!: string | null;

  @Column({ name: 'to_number', type: 'varchar', length: 32 })
  toNumber!: string;

  @Column({ name: 'from_number', type: 'varchar', length: 32, nullable: true })
  fromNumber!: string | null;

  /** Corps envoye, pret pour l'audit et la relecture. */
  @Column({ type: 'text' })
  body!: string;

  @Column({ type: 'enum', enum: SmsEncoding, default: SmsEncoding.GSM7 })
  encoding!: SmsEncoding;

  /** Nombre de segments factures par l'operateur. */
  @Column({ type: 'int', default: 1 })
  segments!: number;

  @Column({ type: 'enum', enum: SmsMessageStatus, default: SmsMessageStatus.QUEUED })
  status!: SmsMessageStatus;

  @Column({ name: 'attempt_number', type: 'int', default: 1 })
  attemptNumber!: number;

  /** Code d'erreur du fournisseur (`30007`, `21610`, ...). */
  @Column({ name: 'error_code', type: 'varchar', length: 40, nullable: true })
  errorCode!: string | null;

  @Column({ name: 'error_message', type: 'varchar', length: 512, nullable: true })
  errorMessage!: string | null;

  @Column({ name: 'queued_at', type: 'timestamptz', nullable: true })
  queuedAt!: Date | null;

  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt!: Date | null;

  @Column({ name: 'delivered_at', type: 'timestamptz', nullable: true })
  deliveredAt!: Date | null;

  /** Cout annonce par l'operateur, en dollars americains. */
  @Column({ name: 'cost_usd', type: 'numeric', precision: 10, scale: 4, nullable: true })
  costUsd!: string | null;

  @Column({ type: 'jsonb', default: () => `'{}'::jsonb` })
  metadata!: Record<string, unknown>;
}
