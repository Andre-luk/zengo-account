import { Injectable } from '@nestjs/common';
import { Subject, Subscription } from 'rxjs';
import { AlertSeverity, AlertSource, AlertStatus, AlertType } from '@common/enums/alert.enum';

export type AlertRealtimeEventType =
  | 'alert.created'
  | 'alert.updated'
  | 'alert.acknowledged'
  | 'alert.dispatched'
  | 'alert.escalated'
  | 'alert.resolved'
  | 'alert.cancelled'
  | 'voice_call.updated';

/**
 * Evenement diffuse aux consoles connectees (ZMC, stations, applications).
 *
 * `organizationIds` liste les salles (rooms) a notifier : l'agence porteuse de
 * l'alerte, la zone regionale parente et les stations affectees. Le filtrage
 * final reste applique cote serveur lors de l'abonnement du client.
 */
export interface AlertRealtimeEvent {
  type: AlertRealtimeEventType;
  alertId: string;
  reference: string;
  alertType: AlertType;
  severity: AlertSeverity;
  status: AlertStatus;
  source: AlertSource;
  clientId: string | null;
  organizationIds: string[];
  occurredAt: string;
  payload?: Record<string, unknown>;
}

/**
 * Bus interne de diffusion des alertes.
 *
 * Le domaine (AlertsService) publie ; l'infrastructure (passerelle WebSocket)
 * consomme. Ce decouplage evite une dependance circulaire entre les modules et
 * permet de tester le domaine sans serveur temps reel.
 */
@Injectable()
export class AlertEventBus {
  private readonly subject = new Subject<AlertRealtimeEvent>();

  publish(event: AlertRealtimeEvent): void {
    this.subject.next(event);
  }

  subscribe(handler: (event: AlertRealtimeEvent) => void): Subscription {
    return this.subject.subscribe(handler);
  }
}
