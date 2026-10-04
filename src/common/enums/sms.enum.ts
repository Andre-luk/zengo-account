/**
 * Enums du canal SMS transactionnel.
 *
 * Le cahier des charges prevoit une notification SMS du client « en parallele
 * de l'appel vocal » : le SMS sert de trace ecrite lorsque le telephone ne
 * repond pas, et d'historique consultable par le superviseur.
 */

/** Cycle de vie d'un message. */
export enum SmsMessageStatus {
  /** Cree, en attente de remise au fournisseur. */
  QUEUED = 'QUEUED',
  /** Accepte par le fournisseur (accuse d'envoi recu). */
  SENT = 'SENT',
  /** Remis au telephone du destinataire. */
  DELIVERED = 'DELIVERED',
  /** Rejet definitif : le message ne partira pas. */
  FAILED = 'FAILED',
  /** Remis au reseau mais non delivre (numero injoignable, hors reseau). */
  UNDELIVERED = 'UNDELIVERED',
}

export const TERMINAL_SMS_STATUSES: SmsMessageStatus[] = [
  SmsMessageStatus.DELIVERED,
  SmsMessageStatus.FAILED,
  SmsMessageStatus.UNDELIVERED,
];

export const isTerminalSmsStatus = (status: SmsMessageStatus): boolean =>
  TERMINAL_SMS_STATUSES.includes(status);

export enum SmsDirection {
  OUTBOUND = 'OUTBOUND',
  INBOUND = 'INBOUND',
}

/**
 * Situations pour lesquelles la plateforme ecrit au client.
 *
 * Chaque situation possede un texte par langue : le client recoit toujours son
 * SMS dans la langue enregistree sur sa fiche Zengo.
 */
export enum SmsTemplate {
  /** Declenchement : le centre a detecte une alerte et appelle le client. */
  ALERT_RAISED = 'ALERT_RAISED',
  /** Le client a confirme que l'evenement n'est pas de son fait. */
  ALERT_CONFIRMED = 'ALERT_CONFIRMED',
  /** Une equipe part vers le lieu d'intervention, avec un delai estime. */
  MISSION_ASSIGNED = 'MISSION_ASSIGNED',
  /** L'equipe est arrivee sur place. */
  MISSION_ON_SITE = 'MISSION_ON_SITE',
  /** Dossier clos : le client est informe du resultat. */
  ALERT_CLOSED = 'ALERT_CLOSED',
  /** Paiement encaisse : le code d'abonnement est transmis au client. */
  SUBSCRIPTION_ACTIVATED = 'SUBSCRIPTION_ACTIVATED',
  /** L'abonnement arrive a echeance : relance du client. */
  SUBSCRIPTION_EXPIRING = 'SUBSCRIPTION_EXPIRING',
  /** Le dossier client change d'agence : information et nouveaux contacts. */
  MUTATION_APPLIED = 'MUTATION_APPLIED',
  /** Message libre redige depuis la console. */
  CUSTOM = 'CUSTOM',
}

/** Technique d'encodage retenue pour un message. */
export enum SmsEncoding {
  /** 160 caracteres par segment, 7 bits. */
  GSM7 = 'GSM7',
  /** 70 caracteres par segment (accents, emojis, caracteres hors GSM). */
  UCS2 = 'UCS2',
}
