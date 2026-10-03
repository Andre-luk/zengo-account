import { SmsMessageStatus, SmsTemplate } from '@common/enums/sms.enum';

export const SMS_PROVIDER = Symbol('SMS_PROVIDER');

export interface SendSmsRequest {
  /** Numero du destinataire au format international (`+243...`). */
  toNumber: string;
  /** Corps deja rendu dans la langue du client. */
  body: string;
  /** Identifiant de notre entite `SmsMessage`, utilise pour la correlation. */
  reference: string;
  /** Situation a l'origine de l'envoi (journalisation et statistiques). */
  template: SmsTemplate;
  /** URL publique pour les accuses de remise (si le fournisseur en emet). */
  statusCallbackUrl?: string;
}

export interface SentSms {
  providerMessageId: string;
  /** Statut initial renvoye par le fournisseur. */
  status: SmsMessageStatus;
  /** Numero expediteur effectivement utilise. */
  fromNumber?: string | null;
  /** Nombre de segments factures, si le fournisseur le communique. */
  segments?: number | null;
  /** Cout annonce, en dollars. */
  costUsd?: string | null;
}

/** Accuse de remise normalise, emis par le fournisseur. */
export interface SmsDeliveryReport {
  providerMessageId: string;
  status: SmsMessageStatus;
  errorCode?: string | null;
  errorMessage?: string | null;
  costUsd?: string | null;
}

/** Contrat minimal d'une passerelle SMS. */
export interface SmsProvider {
  readonly name: string;
  /** Verifie la configuration au demarrage (fabricant du module). */
  assertConfigured?(): void;
  send(request: SendSmsRequest): Promise<SentSms>;
  /**
   * Normalise un accuse de remise fournisseur. Retourne `null` si la requete
   * n'est pas exploitable (statut inconnu, identifiant absent).
   */
  parseDeliveryReport(body: Record<string, unknown>): SmsDeliveryReport | null;
}

/**
 * Table de correspondance des statuts fournisseur (Twilio et compatibles).
 * Un statut inconnu reste `QUEUED` : mieux vaut un message a verifier qu'un
 * message declare delivre a tort.
 */
export const mapProviderStatus = (status: string): SmsMessageStatus => {
  switch (status.toLowerCase()) {
    case 'delivered':
      return SmsMessageStatus.DELIVERED;
    case 'sent':
    case 'accepted':
    case 'sending':
    case 'queued':
      return SmsMessageStatus.SENT;
    case 'failed':
      return SmsMessageStatus.FAILED;
    case 'undelivered':
      return SmsMessageStatus.UNDELIVERED;
    default:
      return SmsMessageStatus.QUEUED;
  }
};
