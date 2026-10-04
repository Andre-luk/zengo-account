import { Subject, Subscription } from 'rxjs';
import { Injectable } from '@nestjs/common';

/**
 * Bus d'evenements des mutations geographiques.
 *
 * Meme role que les autres bus du projet : diffuser un fait metier sans que le
 * module emetteur connaisse ses consommateurs (la passerelle temps reel, ici).
 * Cela evite que le module Mutations importe le module Realtime.
 */

export type MutationRealtimeEventType =
  | 'mutation.requested'
  | 'mutation.approved'
  | 'mutation.rejected'
  | 'mutation.applied'
  | 'mutation.reverted'
  | 'mutation.integration_report'
  | 'mutation.reminder';

export interface MutationRealtimeEvent {
  type: MutationRealtimeEventType;
  mutationId: string;
  reference: string;
  clientId: string | null;
  clientName: string | null;
  status: string;
  /** Agences concernee(s), pour la diffusion en salle. */
  fromOrganizationId: string | null;
  toOrganizationId: string | null;
  actorLabel: string | null;
  message: string;
  occurredAt: Date;
}

@Injectable()
export class MutationEventBus {
  private readonly subject = new Subject<MutationRealtimeEvent>();

  publish(event: MutationRealtimeEvent): void {
    this.subject.next(event);
  }

  subscribe(observer: (event: MutationRealtimeEvent) => void): Subscription {
    return this.subject.subscribe(observer);
  }
}
