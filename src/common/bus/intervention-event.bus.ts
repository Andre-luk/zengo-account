import { Injectable } from '@nestjs/common';
import { Subject, Subscription } from 'rxjs';
import { InterventionStatus } from '@common/enums/intervention.enum';

export type InterventionRealtimeEventType =
  | 'intervention.assigned'
  | 'intervention.status_changed'
  | 'intervention.completed'
  | 'intervention.aborted'
  | 'intervention.delayed'
  | 'team.status_changed'
  | 'team.position_updated';

/**
 * Evenement de pilotage terrain diffuse aux consoles et aux applications
 * mobiles des agents.
 *
 * `organizationIds` reprend la logique de perimetre des alertes : agence
 * porteuse, zone regionale, direction nationale et station d'affectation.
 */
export interface InterventionRealtimeEvent {
  type: InterventionRealtimeEventType;
  interventionId: string | null;
  interventionReference: string | null;
  alertId: string | null;
  alertReference: string | null;
  status: InterventionStatus | null;
  teamId: string | null;
  teamName: string | null;
  stationId: string | null;
  organizationIds: string[];
  occurredAt: string;
  payload?: Record<string, unknown>;
}

/**
 * Bus interne des missions terrain.
 *
 * Le domaine (InterventionsService, FieldTeamsService) publie ; la passerelle
 * WebSocket diffuse. Meme decouplage que pour les alertes : aucun import croise
 * entre modules, et le domaine reste testable sans serveur temps reel.
 */
@Injectable()
export class InterventionEventBus {
  private readonly subject = new Subject<InterventionRealtimeEvent>();

  publish(event: InterventionRealtimeEvent): void {
    this.subject.next(event);
  }

  subscribe(handler: (event: InterventionRealtimeEvent) => void): Subscription {
    return this.subject.subscribe(handler);
  }
}
