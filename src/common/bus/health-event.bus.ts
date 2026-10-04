import { Injectable } from '@nestjs/common';
import { Subject, Subscription } from 'rxjs';

/** Nature de l'evenement de sante diffuse en temps reel. */
export enum HealthRealtimeEventType {
  MEASUREMENT_RECORDED = 'health.measurement_recorded',
  CRITICAL_READING = 'health.critical_reading',
  CONSENT_CHANGED = 'health.consent_changed',
  NURSE_REQUEST_CREATED = 'health.nurse_request_created',
  NURSE_REQUEST_UPDATED = 'health.nurse_request_updated',
  NURSE_REQUEST_MESSAGE = 'health.nurse_request_message',
}

/** Evenement de sante diffuse aux postes interesses. */
export interface HealthRealtimeEvent {
  type: HealthRealtimeEventType;
  clientId: string;
  clientName: string;
  organizationId: string | null;
  /** Identifiant de la mesure, du consentement ou de la demande concernee. */
  entityId: string | null;
  reference: string | null;
  message: string;
  payload?: Record<string, unknown>;
  occurredAt: string;
}

/**
 * Bus des evenements de sante.
 *
 * Sans dependance a Nest ni a TypeORM : le module sante publie, la passerelle
 * temps reel diffuse. Cela evite un cycle HealthModule <-> RealtimeModule et
 * laisse la porte ouverte a d'autres consommateurs (notifications, mobile).
 */
@Injectable()
export class HealthEventBus {
  private readonly subject = new Subject<HealthRealtimeEvent>();

  publish(event: HealthRealtimeEvent): void {
    this.subject.next(event);
  }

  subscribe(observer: (event: HealthRealtimeEvent) => void): Subscription {
    return this.subject.subscribe(observer);
  }
}
