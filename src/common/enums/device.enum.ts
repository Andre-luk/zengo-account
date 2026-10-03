/**
 * Mode d'armement du dispositif SafAlert G1.
 * Valeurs conformes au protocole MQTT (topic `changeArmMode`).
 */
export enum ArmMode {
  DISARMED = 0,
  AWAY = 1,
  STAY = 2,
}

/** Code des sous-appareils (Subdevice Code Map du protocole SafAlert). */
export enum SubDeviceCode {
  /** Door Sensor (contact de porte). */
  DC = 'DC',
  /** Detecteur de mouvement infrarouge. */
  PIR = 'PIR',
  /** Detecteur de fumee sans fil. */
  WSD = 'WSD',
  /** Detecteur de fuite de gaz. */
  GLS = 'GLS',
  /** Alarme exterieure sans fil. */
  WOS = 'WOS',
  /** Alarme interieure sans fil. */
  WIS = 'WIS',
  /** Detecteur de fuite d'eau. */
  WLS = 'WLS',
  /** Telecommande. */
  CON = 'CON',
}

/** Etat du dispositif principal. */
export enum DeviceStatus {
  /** Enregistre en base, jamais connecte. */
  PROVISIONED = 'PROVISIONED',
  ACTIVE = 'ACTIVE',
  OFFLINE = 'OFFLINE',
  /** Desactive depuis la console technique (token vide). */
  DISABLED = 'DISABLED',
}

/**
 * Bits d'etat d'un sous-appareil (champ `state` sur 8 caracteres du heartbeat).
 * Un bit a 1 signale l'anomalie correspondante.
 */
export enum SubDeviceStateBit {
  OFFLINE = 0,
  /** bit 1 a 4 : reserves */
  TAMPER = 5,
  LOW_BATTERY = 6,
  OPEN = 7,
}
