import { TelephonyEvent } from '@common/bus/telephony-event.bus';
import { RenderedVoiceScript } from '@modules/telephony/voice-scripts';

export const TELEPHONY_PROVIDER = Symbol('TELEPHONY_PROVIDER');

export interface PlaceCallRequest {
  /** Numero du client au format international (`+243...`). */
  toNumber: string;
  /** Script multilingue a jouer. */
  script: RenderedVoiceScript;
  /** Identifiant de notre entite `VoiceCall`, utilise pour la correlation. */
  reference: string;
  /** URL de base publique pour les webhooks (statut, saisie, TwiML). */
  webhookBaseUrl: string;
}

export interface PlacedCall {
  providerCallId: string;
  /** Statut initial renvoye par le fournisseur. */
  status: TelephonyEvent['status'];
}

/** Contrat minimal d'un fournisseur de telephonie sortante. */
export interface TelephonyProvider {
  readonly name: string;
  /** Declenche l'appel et retourne l'identifiant cote fournisseur. */
  placeCall(request: PlaceCallRequest): Promise<PlacedCall>;
  /**
   * Normalise un webhook fournisseur en evenement interne.
   * Retourne `null` si la requete n'est pas exploitable.
   */
  parseWebhook(
    kind: 'status' | 'input',
    body: Record<string, unknown>,
    query: Record<string, unknown>,
  ): TelephonyEvent | null;
  /** Reponse TwiML/TTS a renvoyer au fournisseur pour la phase de saisie. */
  buildTwiMl(script: RenderedVoiceScript, fileName: 'question' | 'notMe' | 'itIsMe' | 'noInput'): string;
  /**
   * Valide l'authenticite d'un webhook lorsqu'un mecanisme de signature existe
   * (Twilio : `X-Twilio-Signature`). Absent pour les fournisseurs de test.
   */
  verifyWebhook?(url: string, params: Record<string, unknown>, signature: string | undefined): boolean;
}
