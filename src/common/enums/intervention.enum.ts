/**
 * Enumerations du module « Interventions terrain ».
 *
 * Vocabulaire : une *alerte* est un evenement detecte ; une *affectation*
 * (`AlertDispatch`) est l'envoi a une station ; une *intervention* est la
 * mission confiee a une *equipe terrain* (`FieldTeam`) designee pour agir.
 */

/** Cycle de vie d'une mission d'intervention terrain. */
export enum InterventionStatus {
  /** Mission confiee a une equipe, depart non confirme. */
  ASSIGNED = 'ASSIGNED',
  /** Equipe en route vers le site. */
  EN_ROUTE = 'EN_ROUTE',
  /** Equipe arrivee sur place. */
  ON_SITE = 'ON_SITE',
  /** Mission cloturee avec rapport. */
  COMPLETED = 'COMPLETED',
  /** Mission abandonnee (faux positif, annulation client, doublon...). */
  ABORTED = 'ABORTED',
}

/** Disponibilite d'une equipe terrain. */
export enum FieldTeamStatus {
  AVAILABLE = 'AVAILABLE',
  /** Engagee sur une mission en cours. */
  ENGAGED = 'ENGAGED',
  /** Hors service : maintenance, effectif incomplet, vehicule indisponible. */
  UNAVAILABLE = 'UNAVAILABLE',
}

/** Conclusion consignee dans le rapport de fin d'intervention. */
export enum InterventionOutcome {
  /** Situation maitrisee sur place. */
  RESOLVED_ON_SITE = 'RESOLVED_ON_SITE',
  /** Le declenchement etait bien un faux positif, confirme sur place. */
  FALSE_ALARM_ON_SITE = 'FALSE_ALARM_ON_SITE',
  /** Deplacement inutile : aucune action n'etait necessaire. */
  NO_ACTION_REQUIRED = 'NO_ACTION_REQUIRED',
  /** Degats constates (rapport detaille joint). */
  DAMAGE_REPORTED = 'DAMAGE_REPORTED',
  /** Prise en charge transmise aux autorites (police, justice...). */
  HANDOVER_TO_AUTHORITIES = 'HANDOVER_TO_AUTHORITIES',
  /** Personne sur place a l'arrivee de l'equipe. */
  CLIENT_ABSENT = 'CLIENT_ABSENT',
  /** Defaillance materielle du kit constatee. */
  EQUIPMENT_ISSUE = 'EQUIPMENT_ISSUE',
}

/** Motif d'abandon d'une mission. */
export enum InterventionAbortReason {
  FALSE_ALARM = 'FALSE_ALARM',
  CLIENT_CANCELLED = 'CLIENT_CANCELLED',
  NO_TEAM_AVAILABLE = 'NO_TEAM_AVAILABLE',
  DUPLICATE = 'DUPLICATE',
  OTHER = 'OTHER',
}

/** Origine d'un releve de position d'equipe. */
export enum TeamPositionSource {
  /** Application mobile de l'agent (GPS du telephone). */
  APP = 'APP',
  /** Boitier GPS embarque dans le vehicule. */
  GPS_TRACKER = 'GPS_TRACKER',
  /** Saisie manuelle par le ZMC (repli). */
  MANUAL = 'MANUAL',
}
