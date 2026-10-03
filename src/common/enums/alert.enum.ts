/** Categories d'alerte du systeme SafAlert. */
export enum AlertType {
  INTRUSION = 'INTRUSION',
  FIRE = 'FIRE',
  MEDICAL = 'MEDICAL',
  SABOTAGE = 'SABOTAGE',
  PANIC = 'PANIC',
  GAS_LEAK = 'GAS_LEAK',
  WATER_LEAK = 'WATER_LEAK',
  SYSTEM = 'SYSTEM',
}

export enum AlertSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

/** Cycle de vie d'une alerte. */
export enum AlertStatus {
  NEW = 'NEW',
  /** Prise en charge par un operateur ZMC. */
  ACKNOWLEDGED = 'ACKNOWLEDGED',
  /** Equipe designee. */
  ASSIGNED = 'ASSIGNED',
  IN_PROGRESS = 'IN_PROGRESS',
  RESOLVED = 'RESOLVED',
  FALSE_ALARM = 'FALSE_ALARM',
  CANCELLED = 'CANCELLED',
}

/** Cycle de vie d'une mission d'intervention terrain. */
export { InterventionStatus } from '@common/enums/intervention.enum';

/** Issu de l'appel vocal IA aupres du client. */
export enum VoiceCallOutcome {
  NO_ANSWER = 'NO_ANSWER',
  /** Le client a confirme etre a l'origine de l'action. */
  CONFIRMED_BY_CLIENT = 'CONFIRMED_BY_CLIENT',
  /** Le client a confirme que l'action n'est pas de lui : intervention. */
  INTRUSION_CONFIRMED = 'INTRUSION_CONFIRMED',
  /** Reponse partielle / non exploitable. */
  PARTIAL = 'PARTIAL',
  FAILED = 'FAILED',
}

/** Origine du declenchement. */
export enum AlertSource {
  /** Capteur ou centrale SafAlert (MQTT). */
  SENSOR = 'SENSOR',
  /** Bouton SOS physique. */
  SOS_BUTTON = 'SOS_BUTTON',
  /** Bouton d'urgence de l'application mobile. */
  CLIENT_APP = 'CLIENT_APP',
  /** Declenchement manuel par un operateur du ZMC. */
  OPERATOR = 'OPERATOR',
  /** Regle automatique (escalade, watchdog). */
  AUTOMATION = 'AUTOMATION',
}

/** Motif de cloture d'une alerte. */
export enum AlertResolution {
  /** Le client a confirme etre a l'origine du declenchement (appel vocal IA). */
  CLIENT_CONFIRMED = 'CLIENT_CONFIRMED',
  /** Traitee sur place par une equipe. */
  HANDLED_BY_TEAM = 'HANDLED_BY_TEAM',
  /** Aucune intervention necessaire. */
  NO_ACTION_REQUIRED = 'NO_ACTION_REQUIRED',
  /** Incident technique (faux positif materiel). */
  TECHNICAL_ISSUE = 'TECHNICAL_ISSUE',
  /** Test de maintenance. */
  MAINTENANCE_TEST = 'MAINTENANCE_TEST',
}

/** Niveau d'escalade atteint. */
export enum EscalationLevel {
  /** Alerte diffusee a la chambre de secours de rattachement. */
  NONE = 0,
  /** Escalade automatique apres temporisation : toutes les equipes actives du PDC. */
  ALL_TEAMS = 1,
  /** Escalade manuelle au niveau regional. */
  REGIONAL = 2,
}

/** Etapes fonctionnelles tracees dans la chronologie de l'alerte. */
export enum AlertEventType {
  CREATED = 'CREATED',
  ACKNOWLEDGED = 'ACKNOWLEDGED',
  DISPATCHED = 'DISPATCHED',
  ESCALATED = 'ESCALATED',
  VOICE_CALL_STARTED = 'VOICE_CALL_STARTED',
  VOICE_CALL_UPDATED = 'VOICE_CALL_UPDATED',
  VOICE_CALL_COMPLETED = 'VOICE_CALL_COMPLETED',
  SMS_SENT = 'SMS_SENT',
  STATUS_CHANGED = 'STATUS_CHANGED',
  NOTE_ADDED = 'NOTE_ADDED',
  RESOLVED = 'RESOLVED',
  CANCELLED = 'CANCELLED',
}

/** Etat d'une affectation a une station / equipe. */
export enum DispatchStatus {
  /** Mission envoyee, sans accuse de reception. */
  PENDING = 'PENDING',
  NOTIFIED = 'NOTIFIED',
  ACKNOWLEDGED = 'ACKNOWLEDGED',
  DECLINED = 'DECLINED',
  /** Equipe sur place. */
  ARRIVED = 'ARRIVED',
  COMPLETED = 'COMPLETED',
}

/** Cycle de vie de l'appel vocal IA. */
export enum VoiceCallStatus {
  QUEUED = 'QUEUED',
  RINGING = 'RINGING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  NO_ANSWER = 'NO_ANSWER',
  BUSY = 'BUSY',
  FAILED = 'FAILED',
}

/** Fournisseur de telephonie utilise. */
export enum TelephonyProviderName {
  /** Implementation locale : aucun appel reel, pilotable via les webhooks. */
  STUB = 'STUB',
  TWILIO = 'TWILIO',
}

/** Touche composee sur le clavier du telephone pendant l'appel. */
export enum VoiceCallDtmf {
  /** « Ce n'est pas moi » -> intervention. */
  NOT_ME = '1',
  /** « C'est moi » -> fin d'alerte et conseil de desarmement. */
  IT_IS_ME = '2',
}
