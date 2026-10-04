/**
 * Enumerations des notifications de prevention.
 *
 * L'analyse de risque identifie les zones sensibles ; la prevention en tire une
 * action concrete : informer les clients de la zone (SMS) et les equipes
 * internes, afin de reduire les declenchements evitables (capteurs mal
 * positionnes, portes mal fermees, panneaux solaires sales...).
 */

/** Cycle de vie d'une campagne de prevention. */
export enum PreventionCampaignStatus {
  /** Preparee, pas encore diffusee. */
  DRAFT = 'DRAFT',
  /** Diffusee avec succes a au moins un destinataire. */
  SENT = 'SENT',
  /** Diffusion partielle : certains destinataires n'ont pas ete joints. */
  PARTIAL = 'PARTIAL',
  /** Aucune diffusion n'a abouti. */
  FAILED = 'FAILED',
  /** Annulee avant diffusion. */
  CANCELLED = 'CANCELLED',
}

/** Canal de diffusion retenu. */
export enum PreventionChannel {
  /** SMS dans la langue enregistree sur la fiche client. */
  SMS = 'SMS',
  /** Notification dans l'application client (prepare, non livre). */
  PUSH = 'PUSH',
  /** SMS et notification applicative. */
  SMS_AND_PUSH = 'SMS_AND_PUSH',
}

/** Ce qui a declenche la campagne. */
export enum PreventionTrigger {
  /** Decision d'un superviseur depuis la console. */
  MANUAL = 'MANUAL',
  /** Zone classee a risque par l'analyse predictive. */
  RISK_ZONE = 'RISK_ZONE',
  /** Clients a declenchements repetes identifies par l'analyse. */
  REPEAT_CLIENTS = 'REPEAT_CLIENTS',
}

/** Population visee. */
export enum PreventionAudience {
  /** Clients des abonnements actifs situes dans un rayon autour de la zone. */
  CLIENTS_IN_ZONE = 'CLIENTS_IN_ZONE',
  /** Seulement les clients a declenchements repetes du perimetre. */
  REPEAT_CLIENTS = 'REPEAT_CLIENTS',
}

/** Niveau de vigilance annonce au client. */
export enum PreventionLevel {
  /** Information : situation normale, conseils d'entretien. */
  ADVISORY = 'ADVISORY',
  /** Vigilance : plusieurs incidents recents dans la zone. */
  WATCH = 'WATCH',
  /** Vigilance renforcee : zone classee a risque. */
  HIGH = 'HIGH',
}
