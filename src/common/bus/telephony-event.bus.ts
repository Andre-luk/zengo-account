import { Injectable } from '@nestjs/common';
import { Subject, Subscription } from 'rxjs';
import { VoiceCallStatus } from '@common/enums/alert.enum';

export type TelephonyEventKind = 'call_status' | 'call_input';

/**
 * Evenement normalise provenant d'un fournisseur de telephonie, quel qu'il soit
 * (Twilio, Vonage, implementation locale de test).
 */
export interface TelephonyEvent {
  kind: TelephonyEventKind;
  provider: string;
  /** Identifiant de l'appel cote fournisseur (`CallSid` chez Twilio). */
  providerCallId: string | null;
  /**
   * Reference de correlation Zelgo : identifiant de notre entite `VoiceCall`,
   * transmis au fournisseur et renvoye dans chaque webhook.
   */
  reference: string | null;
  status?: VoiceCallStatus;
  durationSeconds?: number | null;
  /** Touche DTMF composee par le client (`1` / `2`). */
  dtmfDigit?: string | null;
  /** Texte reconnu par la reconnaissance vocale, si disponible. */
  speechResult?: string | null;
  recordingUrl?: string | null;
  raw?: Record<string, unknown>;
  receivedAt: Date;
}

/**
 * Bus interne des evenements de telephonie.
 *
 * Le module de telephonie (stateless, sans dependance au domaine) publie les
 * evenements normalises ; le module alertes les consomme pour mettre a jour
 * l'appel et l'alerte. Aucune dependance circulaire n'est possible.
 */
@Injectable()
export class TelephonyEventBus {
  private readonly subject = new Subject<TelephonyEvent>();

  publish(event: TelephonyEvent): void {
    this.subject.next(event);
  }

  subscribe(handler: (event: TelephonyEvent) => void): Subscription {
    return this.subject.subscribe(handler);
  }
}
