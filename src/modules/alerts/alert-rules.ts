import { AlertSeverity, AlertSource, AlertStatus, AlertType } from '@common/enums/alert.enum';
import { SubDeviceCode } from '@common/enums/device.enum';

/**
 * Regles metier pures du module alertes.
 * Isolees du service pour etre testables sans base de donnees.
 */

/**
 * Determines le type d'alerte a partir du sous-appareil declencheur.
 *
 * Le code du sous-appareil (Subdevice Code Map du protocole) est la source de
 * verite ; le code numerique brut transmis par la centrale n'est utilise qu'en
 * dernier recours. Ce mapping numerique doit etre confirme avec le fournisseur
 * du kit (la documentation MQTT ne le precise pas).
 */
export const resolveAlertType = (
  subDeviceCode: SubDeviceCode | null | undefined,
  rawType?: number | null,
): AlertType => {
  switch (subDeviceCode) {
    case SubDeviceCode.WSD:
      return AlertType.FIRE;
    case SubDeviceCode.GLS:
      return AlertType.GAS_LEAK;
    case SubDeviceCode.WLS:
      return AlertType.WATER_LEAK;
    case SubDeviceCode.CON:
      return AlertType.PANIC;
    case SubDeviceCode.DC:
    case SubDeviceCode.PIR:
    case SubDeviceCode.WOS:
    case SubDeviceCode.WIS:
      return AlertType.INTRUSION;
    default:
      break;
  }

  switch (rawType) {
    case 1:
      return AlertType.SABOTAGE;
    case 2:
      return AlertType.SYSTEM;
    case 3:
      return AlertType.FIRE;
    case 4:
      return AlertType.MEDICAL;
    default:
      return AlertType.INTRUSION;
  }
};

/** Gravite par defaut selon la nature de l'alerte. */
export const computeSeverity = (type: AlertType): AlertSeverity => {
  switch (type) {
    case AlertType.FIRE:
    case AlertType.GAS_LEAK:
    case AlertType.MEDICAL:
    case AlertType.PANIC:
      return AlertSeverity.CRITICAL;
    case AlertType.INTRUSION:
    case AlertType.SABOTAGE:
      return AlertSeverity.HIGH;
    case AlertType.WATER_LEAK:
      return AlertSeverity.MEDIUM;
    case AlertType.SYSTEM:
    default:
      return AlertSeverity.LOW;
  }
};

/** Les alertes critiques ne sont jamais regroupees : chaque declenchement compte. */
export const shouldGroupOccurrence = (type: AlertType): boolean =>
  computeSeverity(type) !== AlertSeverity.CRITICAL;

export interface EscalationCandidate {
  status: AlertStatus;
  dispatchedAt: Date | null;
  escalationLevel: number;
  openedAt: Date;
}

/**
 * Temporisation du cahier des charges : « Si aucune action dans les 5 minutes,
 * le systeme declenche automatiquement l'envoi a toutes les equipes actives du
 * point de distribution. »
 *
 * Une action = une affectation envoyee a une station. Une simple prise en
 * charge (accuse de reception operateur) ne suffit donc pas a annuler
 * l'escalade.
 */
export const isEscalationDue = (
  candidate: EscalationCandidate,
  delaySeconds: number,
  now: Date = new Date(),
): boolean => {
  if (candidate.escalationLevel >= 1) return false;
  if (candidate.dispatchedAt !== null) return false;
  if (candidate.status !== AlertStatus.NEW && candidate.status !== AlertStatus.ACKNOWLEDGED) {
    return false;
  }
  return now.getTime() - new Date(candidate.openedAt).getTime() >= delaySeconds * 1_000;
};

/** Une alerte est-elle encore ouverte (donc presente dans la file du ZMC) ? */
export const isOpenStatus = (status: AlertStatus): boolean =>
  [AlertStatus.NEW, AlertStatus.ACKNOWLEDGED, AlertStatus.ASSIGNED, AlertStatus.IN_PROGRESS].includes(
    status,
  );

/** Une alerte est-elle terminee ? */
export const isClosedStatus = (status: AlertStatus): boolean =>
  [AlertStatus.RESOLVED, AlertStatus.FALSE_ALARM, AlertStatus.CANCELLED].includes(status);

/**
 * Stations pertinentes pour un type d'alerte : une alerte incendie est
 * prioritairement envoyee aux stations incendie, etc.
 */
export const dispatchPriorityFor = (type: AlertType): 'FIRE' | 'MEDICAL' | 'INTRUSION' | 'MIXED' => {
  switch (type) {
    case AlertType.FIRE:
    case AlertType.GAS_LEAK:
      return 'FIRE';
    case AlertType.MEDICAL:
      return 'MEDICAL';
    case AlertType.INTRUSION:
    case AlertType.PANIC:
      return 'INTRUSION';
    default:
      return 'MIXED';
  }
};

/** Construit la reference lisible d'une alerte : `AL-AAAAMMJJ-NNNN`. */
export const buildAlertReference = (sequence: number, date: Date = new Date()): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `AL-${year}${month}${day}-${String(sequence).padStart(4, '0')}`;
};
