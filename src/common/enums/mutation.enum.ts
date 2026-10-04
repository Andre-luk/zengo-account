/**
 * Enums de la mutation geographique d'un dossier client.
 *
 * Le cahier des charges prevoit : double validation (agent + Directeur controle
 * qualite), transfert du dossier complet vers l'agence de destination,
 * redirection des alertes vers les centres de secours de la nouvelle region,
 * historique des mutations et retour possible a l'agence d'origine, notification
 * du client, puis rapport d'integration a 7 et 30 jours.
 */

/** Nature du mouvement. */
export enum MutationType {
  /** Transfert vers une autre agence (demande initiale). */
  TRANSFER = 'TRANSFER',
  /** Retour a l'agence d'origine, apres un transfert deja applique. */
  RETURN = 'RETURN',
}

/** Cycle de vie d'une demande de mutation. */
export enum MutationStatus {
  /** Demande deposee par l'agence, en attente du controle qualite. */
  REQUESTED = 'REQUESTED',
  /** Prise en charge par le controle qualite (instruction en cours). */
  IN_REVIEW = 'IN_REVIEW',
  /** Validee : le transfert peut etre applique. */
  APPROVED = 'APPROVED',
  /** Refusee par le controle qualite (motif obligatoire). */
  REJECTED = 'REJECTED',
  /** Transfert effectif : le dossier appartient a la nouvelle agence. */
  APPLIED = 'APPLIED',
  /** Retour effectue vers l'agence d'origine. */
  REVERTED = 'REVERTED',
  /** Annulee avant application, a la demande du client ou de l'agence. */
  CANCELLED = 'CANCELLED',
}

/** Motif declare de la mutation. */
export enum MutationReason {
  /** Le client a demenage. */
  CLIENT_MOVED = 'CLIENT_MOVED',
  /** Erreur d'affectation a la creation du dossier. */
  ASSIGNMENT_ERROR = 'ASSIGNMENT_ERROR',
  /** Demande explicite du client. */
  CLIENT_REQUEST = 'CLIENT_REQUEST',
  /** Optimisation de la couverture (client plus proche d'une autre agence). */
  COVERAGE_OPTIMISATION = 'COVERAGE_OPTIMISATION',
  /** Litige ou reorganisation commerciale. */
  COMMERCIAL_DISPUTE = 'COMMERCIAL_DISPUTE',
  /** Autre motif, precise dans la note. */
  OTHER = 'OTHER',
}

/** Horizons de suivi de l'integration du dossier. */
export enum IntegrationHorizon {
  DAYS_7 = 7,
  DAYS_30 = 30,
}

export const INTEGRATION_HORIZONS: IntegrationHorizon[] = [
  IntegrationHorizon.DAYS_7,
  IntegrationHorizon.DAYS_30,
];

/** Conclusion du rapport d'integration. */
export enum IntegrationOutcome {
  /** Dossier integre, aucun probleme signale. */
  SATISFACTORY = 'SATISFACTORY',
  /** Difficultes signalees (contacts, intervention, reglage...). */
  ISSUES_REPORTED = 'ISSUES_REPORTED',
  /** Le client a demande a revenir ou a resilie. */
  CLIENT_LOST = 'CLIENT_LOST',
  /** Rapport non encore saisi. */
  PENDING = 'PENDING',
}
