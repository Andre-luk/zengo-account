import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AlertRealtimeEvent, AlertEventBus, AlertRealtimeEventType } from '@common/bus/alert-event.bus';
import {
  AlertEventType,
  AlertResolution,
  AlertSeverity,
  AlertStatus,
  DispatchStatus,
  EscalationLevel,
  VoiceCallOutcome,
} from '@common/enums/alert.enum';
import { OrganizationType, StationType } from '@common/enums/organization.enum';
import { AuthenticatedUser } from '@common/interfaces/authenticated-user.interface';
import { saveColumns } from '@common/utils/persistence.util';
import { dispatchPriorityFor } from '@modules/alerts/alert-rules';
import { AlertDispatch } from '@database/entities/alert-dispatch.entity';
import { AlertEvent } from '@database/entities/alert-event.entity';
import { Alert } from '@database/entities/alert.entity';
import { Organization } from '@database/entities/organization.entity';

export const ALERT_DETAIL_RELATIONS = {
  client: true,
  device: true,
  subDevice: true,
  organization: true,
  dispatches: { station: true },
  voiceCalls: true,
};

export interface AlertActor {
  id: string | null;
  label: string | null;
}

/** Mutations et evenements du cycle de vie d'une alerte. */
@Injectable()
export class AlertLifecycleService {
  constructor(
    @InjectRepository(Alert)
    private readonly alertRepository: Repository<Alert>,
    @InjectRepository(AlertEvent)
    private readonly alertEventRepository: Repository<AlertEvent>,
    @InjectRepository(AlertDispatch)
    private readonly alertDispatchRepository: Repository<AlertDispatch>,
    @InjectRepository(Organization)
    private readonly organizationRepository: Repository<Organization>,
    private readonly alertEventBus: AlertEventBus,
  ) {}

  // ---------------------------------------------------------------------------
  // Chargement & traces
  // ---------------------------------------------------------------------------

  async loadAlert(id: string, withDetail = false): Promise<Alert | null> {
    return this.alertRepository.findOne({
      where: { id },
      relations: withDetail ? ALERT_DETAIL_RELATIONS : { organization: true, client: true },
    });
  }

  async loadAlertOrFail(id: string, withDetail = false): Promise<Alert> {
    const alert = await this.loadAlert(id, withDetail);
    if (!alert) throw new NotFoundException('Alerte introuvable.');
    return alert;
  }

  async recordEvent(
    alertId: string,
    type: AlertEventType,
    options: { message?: string | null; actor?: AlertActor | null; data?: Record<string, unknown> } = {},
  ): Promise<void> {
    await this.alertEventRepository.save(
      this.alertEventRepository.create({
        alertId,
        type,
        message: options.message ?? null,
        actorUserId: options.actor?.id ?? null,
        actorLabel: options.actor?.label ?? null,
        data: options.data ?? {},
      }),
    );
  }

  static actorFrom(user?: AuthenticatedUser | null): AlertActor | null {
    if (!user) return null;
    return { id: user.id, label: `${user.firstName} ${user.lastName}`.trim() };
  }

  /** Diffuse l'alerte aux consoles connectees. */
  publish(type: AlertRealtimeEventType, alert: Alert, payload?: Record<string, unknown>): void {
    const event: AlertRealtimeEvent = {
      type,
      alertId: alert.id,
      reference: alert.reference,
      alertType: alert.type,
      severity: alert.severity,
      status: alert.status,
      source: alert.source,
      clientId: alert.clientId,
      organizationIds: this.collectRooms(alert),
      occurredAt: new Date().toISOString(),
      payload,
    };
    this.alertEventBus.publish(event);
  }

  /**
   * Determine les salles a notifier : l'agence porteuse, tous ses ancetres
   * (zone regionale, direction nationale) et les stations deja affectees.
   * Le chemin materialise de l'organisation fournit les ancetres sans requete.
   */
  collectRooms(alert: Alert, extraIds: string[] = []): string[] {
    const rooms = new Set<string>();
    const path = typeof alert.metadata?.organizationPath === 'string' ? alert.metadata.organizationPath : '';

    for (const segment of path.split('/')) {
      if (segment) rooms.add(segment);
    }
    if (alert.organizationId) rooms.add(alert.organizationId);
    for (const dispatch of alert.dispatches ?? []) rooms.add(dispatch.stationId);
    for (const id of extraIds) rooms.add(id);

    if (rooms.size === 0) rooms.add('national');
    return [...rooms];
  }

  // ---------------------------------------------------------------------------
  // Selection des stations et affectations
  // ---------------------------------------------------------------------------

  /**
   * Stations destinataires d'une alerte.
   *
   * 1. les stations du point de distribution dont le type correspond a l'alerte
   *    (une alerte incendie part vers les pompiers) ;
   * 2. a defaut, toutes les stations du point de distribution ;
   * 3. a defaut, les stations de la zone regionale de rattachement.
   *
   * `allTeams = true` (escalade) court-circuite l'etape 1.
   */
  async findDispatchableStations(alert: Alert, options: { allTeams: boolean }): Promise<Organization[]> {
    if (!alert.organizationId) return [];

    const agency = await this.organizationRepository.findOne({ where: { id: alert.organizationId } });
    if (!agency) return [];

    const descendants = await this.findStationsUnder(agency);
    if (descendants.length === 0) {
      const region = agency.parentId
        ? await this.organizationRepository.findOne({ where: { id: agency.parentId } })
        : null;
      if (region) return this.findStationsUnder(region);
      return [];
    }

    if (options.allTeams) return descendants;

    const priority = dispatchPriorityFor(alert.type);
    const targeted = descendants.filter(
      (station) => station.stationType === priority || station.stationType === StationType.MIXED,
    );
    return targeted.length > 0 ? targeted : descendants;
  }

  private async findStationsUnder(organization: Organization): Promise<Organization[]> {
    return this.organizationRepository
      .createQueryBuilder('organization')
      .where('organization.type = :type', { type: OrganizationType.STATION })
      .andWhere('(organization.path = :path OR organization.path LIKE :prefix)', {
        path: organization.path,
        prefix: `${organization.path}/%`,
      })
      .orderBy('organization.name', 'ASC')
      .getMany();
  }

  /** Cree les affectations manquantes et notifie les stations. */
  async createDispatches(
    alert: Alert,
    stations: Organization[],
    options: { isEscalation: boolean; actor?: AlertActor | null; note?: string | null },
  ): Promise<AlertDispatch[]> {
    if (stations.length === 0) return [];

    const stationIds = stations.map((station) => station.id);
    const existing = await this.alertDispatchRepository.find({
      where: { alertId: alert.id, stationId: In(stationIds) },
    });
    const existingIds = new Set(existing.map((dispatch) => dispatch.stationId));
    const toCreate = stations.filter((station) => !existingIds.has(station.id));

    if (toCreate.length === 0) return [];

    const dispatches = toCreate.map((station) =>
      this.alertDispatchRepository.create({
        alertId: alert.id,
        stationId: station.id,
        status: DispatchStatus.NOTIFIED,
        isEscalation: options.isEscalation,
        notifiedAt: new Date(),
        respondedById: options.actor?.id ?? null,
        note: options.note ?? null,
      }),
    );

    const saved = await this.alertDispatchRepository.save(dispatches);

    // Rechargement avec la station pour que l'API (et la console) expose
    // directement le nom de l'organisation notifiee.
    return this.alertDispatchRepository.find({
      where: { id: In(saved.map((dispatch) => dispatch.id)) },
      relations: { station: true },
    });
  }

  async updateDispatchStatus(
    dispatch: AlertDispatch,
    status: DispatchStatus,
    actor: AlertActor | null,
    note?: string | null,
  ): Promise<AlertDispatch> {
    dispatch.status = status;
    dispatch.respondedAt = new Date();
    dispatch.respondedById = actor?.id ?? null;
    if (note !== undefined) dispatch.note = note;
    return this.alertDispatchRepository.save(dispatch);
  }

  async loadDispatch(alertId: string, dispatchId: string): Promise<AlertDispatch | null> {
    return this.alertDispatchRepository.findOne({ where: { id: dispatchId, alertId }, relations: { station: true } });
  }

  // ---------------------------------------------------------------------------
  // Transitions d'etat
  // ---------------------------------------------------------------------------

  async save(alert: Alert): Promise<Alert> {
    await saveColumns(this.alertRepository, alert);
    return alert;
  }

  /** Affectation enregistree : l'alerte entre dans le circuit d'intervention. */
  async markDispatched(alert: Alert, dispatchedAt: Date): Promise<Alert> {
    if (!alert.dispatchedAt) alert.dispatchedAt = dispatchedAt;
    if (alert.status === AlertStatus.NEW || alert.status === AlertStatus.ACKNOWLEDGED) {
      alert.status = AlertStatus.ASSIGNED;
    }
    return this.save(alert);
  }

  /**
   * Applique la reponse du client a l'appel vocal IA.
   *
   * - « ce n'est pas moi »  -> alerte confirmee : escalade immediate.
   * - « c'est moi »         -> faux positif : cloture en CLIENT_CONFIRMED.
   * - sans reponse          -> rien : la temporisation du watchdog s'applique.
   */
  async applyClientConfirmation(alert: Alert, outcome: VoiceCallOutcome): Promise<Alert> {
    alert.voiceCallOutcome = outcome;

    if (outcome === VoiceCallOutcome.INTRUSION_CONFIRMED) {
      alert.severity = AlertSeverity.CRITICAL;
      await this.recordEvent(alert.id, AlertEventType.VOICE_CALL_COMPLETED, {
        message: "Le client a confirme ne pas etre a l'origine du declenchement : intervention declenchee.",
        data: { outcome },
      });
      return this.save(alert);
    }

    if (outcome === VoiceCallOutcome.CONFIRMED_BY_CLIENT) {
      alert.clientConfirmed = true;
      alert.status = AlertStatus.FALSE_ALARM;
      alert.resolution = AlertResolution.CLIENT_CONFIRMED;
      alert.resolutionNote = 'Le client a confirme etre a l origine du declenchement (appel vocal IA).';
      alert.resolvedAt = new Date();
      await this.recordEvent(alert.id, AlertEventType.RESOLVED, {
        message: 'Alerte classee sans suite : le client a confirme etre a l origine du declenchement.',
        data: { outcome },
      });
      return this.save(alert);
    }

    return this.save(alert);
  }

  /** Escalade : toutes les equipes du PDC (ou niveau regional si demande). */
  async escalate(
    alert: Alert,
    options: { reason: string; level?: EscalationLevel; actor?: AlertActor | null; automatic?: boolean },
  ): Promise<{ alert: Alert; dispatches: AlertDispatch[] }> {
    const level = options.level ?? EscalationLevel.ALL_TEAMS;
    const stations = await this.findDispatchableStations(alert, { allTeams: true });

    const dispatches = await this.createDispatches(alert, stations, {
      isEscalation: true,
      actor: options.actor ?? null,
      note: options.reason,
    });

    alert.escalationLevel = Math.max(alert.escalationLevel, level);
    alert.escalatedAt = new Date();
    if (alert.status === AlertStatus.NEW || alert.status === AlertStatus.ACKNOWLEDGED) {
      alert.status = AlertStatus.ASSIGNED;
    }
    alert.dispatchedAt = alert.dispatchedAt ?? new Date();

    const saved = await this.save(alert);

    await this.recordEvent(saved.id, AlertEventType.ESCALATED, {
      message: options.automatic
        ? `Escalade automatique : aucune action dans le delai imparti. Diffusion a ${stations.length} station(s).`
        : `Escalade manuelle : ${options.reason}`,
      actor: options.actor ?? null,
      data: { level, stationCount: stations.length, automatic: Boolean(options.automatic) },
    });

    this.publish('alert.escalated', saved, {
      level,
      stationCount: stations.length,
      automatic: Boolean(options.automatic),
    });

    return { alert: saved, dispatches };
  }
}
