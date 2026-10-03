import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { AppBaseEntity } from '@common/entities/app-base.entity';
import { DispatchStatus } from '@common/enums/alert.enum';
import { Alert } from '@database/entities/alert.entity';
import { Organization } from '@database/entities/organization.entity';

/**
 * Affectation d'une alerte a une station de reception (police, pompiers,
 * hopital) — chambre de secours regionale / station d'intervention.
 *
 * L'iteration « interventions terrain » ajoutera la notion d'equipe et de
 * mission ; ici on trace l'envoi et l'accuse de reception de la station.
 */
@Entity('alert_dispatches')
@Unique('uq_alert_dispatch_station', ['alertId', 'stationId'])
@Index(['alertId'])
@Index(['stationId'])
export class AlertDispatch extends AppBaseEntity {
  @Column({ name: 'alert_id', type: 'uuid' })
  alertId!: string;

  @ManyToOne(() => Alert, (alert) => alert.dispatches, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'alert_id' })
  alert!: Alert;

  @Column({ name: 'station_id', type: 'uuid' })
  stationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'station_id' })
  station!: Organization;

  @Column({ type: 'enum', enum: DispatchStatus, default: DispatchStatus.PENDING })
  status!: DispatchStatus;

  /** Affectation issue de l'escalade automatique (temporisation depassee). */
  @Column({ name: 'is_escalation', type: 'boolean', default: false })
  isEscalation!: boolean;

  @Column({ name: 'notified_at', type: 'timestamptz', default: () => 'now()' })
  notifiedAt!: Date;

  @Column({ name: 'responded_at', type: 'timestamptz', nullable: true })
  respondedAt!: Date | null;

  @Column({ name: 'responded_by_id', type: 'uuid', nullable: true })
  respondedById!: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  note!: string | null;
}
