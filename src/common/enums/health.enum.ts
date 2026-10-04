/**
 * Enumerations du module e-Sante connectee.
 *
 * La plateforme collecte des mesures de sante preventives (tensiometre,
 * oxymetre, glucometre, bracelet cardio...) afin d'alerter le personnel de
 * sante et les secours avant la complication.
 */

/** Grandeur physiologique suivie. */
export enum HealthMetric {
  /** Tension arterielle (systolique / diastolique, mmHg). */
  BLOOD_PRESSURE = 'BLOOD_PRESSURE',
  /** Frequence cardiaque (bpm). */
  HEART_RATE = 'HEART_RATE',
  /** Saturation en oxygene (%). */
  SPO2 = 'SPO2',
  /** Glycemie capillaire (mg/dL). */
  BLOOD_GLUCOSE = 'BLOOD_GLUCOSE',
  /** Temperature corporelle (degres Celsius). */
  TEMPERATURE = 'TEMPERATURE',
  /** Poids (kg) — exploite avec la taille pour l'IMC. */
  WEIGHT = 'WEIGHT',
}

/** Appreciation automatique d'une mesure (voir `health.util.ts`). */
export enum HealthReadingStatus {
  NORMAL = 'NORMAL',
  /** Valeur a surveiller : conseil et suivi rapproche. */
  WATCH = 'WATCH',
  /** Valeur critique : alerte medicale et contact du personnel de sante. */
  CRITICAL = 'CRITICAL',
}

/** Origine de la mesure. */
export enum HealthMeasurementSource {
  /** Dispositif connecte (passerelle MQTT). */
  DEVICE = 'DEVICE',
  /** Saisie par un agent / infirmier du PDC. */
  MANUAL = 'MANUAL',
  /** Saisie par le client depuis l'application mobile. */
  CLIENT_APP = 'CLIENT_APP',
  /** Import de masse (campagne de depistage). */
  IMPORT = 'IMPORT',
}

/** Finalite du consentement donne par le client. */
export enum HealthConsentScope {
  /** Partager les mesures avec le personnel de sante. */
  DATA_SHARING = 'DATA_SHARING',
  /** Autoriser le contact / la teleconsultation infirmiere. */
  NURSE_CONTACT = 'NURSE_CONTACT',
  /** Divulgation aux secours en cas d'urgence vitale. */
  EMERGENCY_DISCLOSURE = 'EMERGENCY_DISCLOSURE',
}

export enum HealthConsentStatus {
  GRANTED = 'GRANTED',
  REVOKED = 'REVOKED',
  /** Consentement a duree limitee, arrive a echeance. */
  EXPIRED = 'EXPIRED',
}

/** Canal de recueil du consentement (preuve). */
export enum HealthConsentChannel {
  CLIENT_APP = 'CLIENT_APP',
  SMS = 'SMS',
  PAPER = 'PAPER',
  CALL_CENTER = 'CALL_CENTER',
}

/** Action tracee dans le journal d'acces aux donnees de sante. */
export enum HealthAccessAction {
  VIEW = 'VIEW',
  EXPORT = 'EXPORT',
  SHARE = 'SHARE',
  CONSENT_GRANTED = 'CONSENT_GRANTED',
  CONSENT_REVOKED = 'CONSENT_REVOKED',
  /** Acces d'urgence, sans consentement prealable (tracabilite renforcee). */
  EMERGENCY = 'EMERGENCY',
  ERASED = 'ERASED',
}

/** Cycle de vie d'une demande de soin / d'appel infirmier. */
export enum NurseRequestStatus {
  REQUESTED = 'REQUESTED',
  ACCEPTED = 'ACCEPTED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum NurseRequestPriority {
  ROUTINE = 'ROUTINE',
  URGENT = 'URGENT',
  /** Urgence vitale : mobilise les secours. */
  EMERGENCY = 'EMERGENCY',
}

/** Roles autorises a consulter / agir sur les donnees de sante. */
export const HEALTH_STAFF_ROLES: ReadonlySet<string> = new Set<string>([
  'HEALTH_STAFF',
  'SUPER_ADMIN',
  'NATIONAL_DIRECTOR',
  'TECHNICAL_DIRECTOR',
]);

/** Roles autorises a piloter les demandes de soin du centre de sante. */
export const HEALTH_MANAGER_ROLES: ReadonlySet<string> = new Set<string>([
  'HEALTH_STAFF',
  'SUPER_ADMIN',
  'NATIONAL_DIRECTOR',
]);
