import { AlertType } from '@common/enums/alert.enum';
import {
  FieldTeamStatus,
  InterventionStatus,
} from '@common/enums/intervention.enum';
import { StationType } from '@common/enums/organization.enum';
import { Coordinates, estimateEtaMinutes, haversineMeters, isValidCoordinate } from '@common/utils/geo.util';

/**
 * Regles metier pures du pilotage des missions.
 *
 * Aucune dependance a TypeORM ou Nest : ces fonctions sont testables
 * directement et decrivent *qui peut faire quoi, quand*.
 */

/** Transitions autorisees entre statuts de mission. */
export const INTERVENTION_TRANSITIONS: Record<InterventionStatus, InterventionStatus[]> = {
  [InterventionStatus.ASSIGNED]: [InterventionStatus.EN_ROUTE, InterventionStatus.ON_SITE, InterventionStatus.ABORTED],
  [InterventionStatus.EN_ROUTE]: [InterventionStatus.ON_SITE, InterventionStatus.ABORTED],
  [InterventionStatus.ON_SITE]: [InterventionStatus.COMPLETED, InterventionStatus.ABORTED],
  [InterventionStatus.COMPLETED]: [],
  [InterventionStatus.ABORTED]: [],
};

export const TERMINAL_INTERVENTION_STATUSES: InterventionStatus[] = [
  InterventionStatus.COMPLETED,
  InterventionStatus.ABORTED,
];

export const OPEN_INTERVENTION_STATUSES: InterventionStatus[] = [
  InterventionStatus.ASSIGNED,
  InterventionStatus.EN_ROUTE,
  InterventionStatus.ON_SITE,
];

export const isOpenInterventionStatus = (status: InterventionStatus): boolean =>
  OPEN_INTERVENTION_STATUSES.includes(status);

export const isTerminalInterventionStatus = (status: InterventionStatus): boolean =>
  TERMINAL_INTERVENTION_STATUSES.includes(status);

export const canTransitionIntervention = (from: InterventionStatus, to: InterventionStatus): boolean =>
  INTERVENTION_TRANSITIONS[from].includes(to);

/**
 * Les statuts peuvent etre sautes (une equipe peut signaler son arrivee sans
 * avoir confirme son depart) : on tolere uniquement les avancees listees cidessus,
 * jamais un retour en arriere.
 */
export const nextStatusesFor = (status: InterventionStatus): InterventionStatus[] =>
  INTERVENTION_TRANSITIONS[status];

/** Reference lisible d'une mission, ex. `IN-20261003-0004`. */
export const buildInterventionReference = (date: Date, sequence: number): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `IN-${year}${month}${day}-${String(sequence).padStart(4, '0')}`;
};

/** Famille d'equipe attendue pour chaque nature d'alerte. */
export const requiredSpecialityFor = (alertType: AlertType): StationType[] => {
  switch (alertType) {
    case AlertType.FIRE:
    case AlertType.GAS_LEAK:
    case AlertType.WATER_LEAK:
      return [StationType.FIRE, StationType.MIXED];
    case AlertType.MEDICAL:
      return [StationType.MEDICAL, StationType.MIXED];
    case AlertType.INTRUSION:
    case AlertType.SABOTAGE:
    case AlertType.PANIC:
      return [StationType.INTRUSION, StationType.MIXED];
    default:
      return [StationType.MIXED, StationType.INTRUSION, StationType.FIRE, StationType.MEDICAL];
  }
};

export interface TeamCandidate extends Coordinates {
  id: string;
  name: string;
  stationId: string;
  speciality: StationType;
  status: FieldTeamStatus;
  lastPositionAt?: Date | string | null;
}

export interface NearestTeamResult {
  team: TeamCandidate;
  distanceMeters: number;
  etaMinutes: number;
}

/**
 * Choisit l'equipe la plus proche du lieu d'intervention.
 *
 * Criteres, dans l'ordre : equipe disponible, specialite adaptee a l'alerte,
 * position connue, distance croissante. Une position trop ancienne (ou absente)
 * est ecartee : mieux vaut un choix manuel qu'un calcul sur donnees perimees.
 */
export const pickNearestTeam = (
  candidates: TeamCandidate[],
  destination: Coordinates | null,
  options: {
    alertType?: AlertType;
    maxAgeMinutes?: number;
    now?: Date;
  } = {},
): NearestTeamResult | null => {
  if (!destination || !isValidCoordinate(destination.latitude, destination.longitude)) return null;

  const now = options.now ?? new Date();
  const maxAgeMinutes = options.maxAgeMinutes ?? 60;
  const allowed = options.alertType ? requiredSpecialityFor(options.alertType) : null;

  const eligible = candidates
    .filter((team) => team.status === FieldTeamStatus.AVAILABLE)
    .filter((team) => (allowed ? allowed.includes(team.speciality) : true))
    .filter((team) => isValidCoordinate(team.latitude, team.longitude))
    .filter((team) => {
      if (!team.lastPositionAt) return false;
      const seenAt = team.lastPositionAt instanceof Date ? team.lastPositionAt : new Date(team.lastPositionAt);
      if (Number.isNaN(seenAt.getTime())) return false;
      return (now.getTime() - seenAt.getTime()) / 60_000 <= maxAgeMinutes;
    });

  if (eligible.length === 0) return null;

  const ranked = eligible
    .map((team) => ({
      team,
      distanceMeters: haversineMeters({ latitude: team.latitude, longitude: team.longitude }, destination),
    }))
    .sort((left, right) => left.distanceMeters - right.distanceMeters);

  const best = ranked[0];
  return {
    team: best.team,
    distanceMeters: best.distanceMeters,
    etaMinutes: estimateEtaMinutes(best.distanceMeters),
  };
};

/** Mission confiee mais non demarree au-dela du delai : relance du superviseur. */
export const shouldWarnDepartureLate = (
  assignedAt: Date | null | undefined,
  now: Date,
  thresholdMinutes: number,
): boolean => {
  if (!assignedAt) return false;
  return (now.getTime() - assignedAt.getTime()) / 60_000 >= thresholdMinutes;
};

/** Equipe en route mais jamais arrivee : recherche de position / relance. */
export const shouldWarnArrivalLate = (
  enRouteAt: Date | null | undefined,
  onSiteAt: Date | null | undefined,
  now: Date,
  thresholdMinutes: number,
): boolean => {
  if (!enRouteAt || onSiteAt) return false;
  return (now.getTime() - enRouteAt.getTime()) / 60_000 >= thresholdMinutes;
};

/** Position d'equipe trop ancienne pour etre exploitable. */
export const isTeamPositionStale = (
  lastPositionAt: Date | string | null | undefined,
  now: Date,
  thresholdMinutes = 30,
): boolean => {
  if (!lastPositionAt) return true;
  const seenAt = lastPositionAt instanceof Date ? lastPositionAt : new Date(lastPositionAt);
  if (Number.isNaN(seenAt.getTime())) return true;
  return (now.getTime() - seenAt.getTime()) / 60_000 > thresholdMinutes;
};

/** Duree d'une mission, en secondes, du depart a la cloture. */
export const computeInterventionDurationSeconds = (
  startedAt: Date | null | undefined,
  endedAt: Date | null | undefined,
): number | null => {
  if (!startedAt || !endedAt) return null;
  const seconds = Math.round((endedAt.getTime() - startedAt.getTime()) / 1000);
  return seconds >= 0 ? seconds : null;
};
