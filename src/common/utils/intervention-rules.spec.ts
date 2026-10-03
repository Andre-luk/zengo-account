import { AlertType } from '@common/enums/alert.enum';
import { FieldTeamStatus, InterventionStatus } from '@common/enums/intervention.enum';
import { StationType } from '@common/enums/organization.enum';
import {
  TeamCandidate,
  buildInterventionReference,
  canTransitionIntervention,
  computeInterventionDurationSeconds,
  isOpenInterventionStatus,
  isTeamPositionStale,
  isTerminalInterventionStatus,
  nextStatusesFor,
  pickNearestTeam,
  requiredSpecialityFor,
  shouldWarnArrivalLate,
  shouldWarnDepartureLate,
} from '@common/utils/intervention-rules';

const team = (overrides: Partial<TeamCandidate> = {}): TeamCandidate => ({
  id: 'team-1',
  name: 'Equipe Alpha',
  stationId: 'station-1',
  speciality: StationType.INTRUSION,
  status: FieldTeamStatus.AVAILABLE,
  latitude: -4.325,
  longitude: 15.322,
  lastPositionAt: new Date(),
  ...overrides,
});

describe('intervention-rules', () => {
  describe('cycle de vie des missions', () => {
    it('autorise les avancees normales', () => {
      expect(canTransitionIntervention(InterventionStatus.ASSIGNED, InterventionStatus.EN_ROUTE)).toBe(true);
      expect(canTransitionIntervention(InterventionStatus.EN_ROUTE, InterventionStatus.ON_SITE)).toBe(true);
      expect(canTransitionIntervention(InterventionStatus.ON_SITE, InterventionStatus.COMPLETED)).toBe(true);
      // Une equipe peut signaler son arrivee sans avoir confirme son depart.
      expect(canTransitionIntervention(InterventionStatus.ASSIGNED, InterventionStatus.ON_SITE)).toBe(true);
    });

    it('interdit les retours en arriere et la sortie d une mission cloturee', () => {
      expect(canTransitionIntervention(InterventionStatus.ON_SITE, InterventionStatus.EN_ROUTE)).toBe(false);
      expect(canTransitionIntervention(InterventionStatus.COMPLETED, InterventionStatus.ON_SITE)).toBe(false);
      expect(canTransitionIntervention(InterventionStatus.ABORTED, InterventionStatus.ASSIGNED)).toBe(false);
      expect(nextStatusesFor(InterventionStatus.COMPLETED)).toEqual([]);
    });

    it('distingue les missions ouvertes des missions cloturees', () => {
      expect(isOpenInterventionStatus(InterventionStatus.ASSIGNED)).toBe(true);
      expect(isOpenInterventionStatus(InterventionStatus.ON_SITE)).toBe(true);
      expect(isTerminalInterventionStatus(InterventionStatus.COMPLETED)).toBe(true);
      expect(isTerminalInterventionStatus(InterventionStatus.EN_ROUTE)).toBe(false);
    });
  });

  describe('buildInterventionReference', () => {
    it('formate la reference a partir de la date locale', () => {
      expect(buildInterventionReference(new Date(2026, 9, 3), 4)).toBe('IN-20261003-0004');
      expect(buildInterventionReference(new Date(2026, 0, 31), 1234)).toBe('IN-20260131-1234');
    });
  });

  describe('requiredSpecialityFor', () => {
    it('oriente les alertes vers la bonne famille d equipe', () => {
      expect(requiredSpecialityFor(AlertType.FIRE)).toEqual([StationType.FIRE, StationType.MIXED]);
      expect(requiredSpecialityFor(AlertType.MEDICAL)).toEqual([StationType.MEDICAL, StationType.MIXED]);
      expect(requiredSpecialityFor(AlertType.INTRUSION)).toEqual([StationType.INTRUSION, StationType.MIXED]);
      expect(requiredSpecialityFor(AlertType.SYSTEM)).toHaveLength(4);
    });
  });

  describe('pickNearestTeam', () => {
    const destination = { latitude: -4.33, longitude: 15.33 };

    it('choisit l equipe disponible la plus proche', () => {
      const result = pickNearestTeam(
        [
          team({ id: 'loin', latitude: -4.5, longitude: 15.5 }),
          team({ id: 'proche', latitude: -4.331, longitude: 15.331 }),
          team({ id: 'moyen', latitude: -4.36, longitude: 15.36 }),
        ],
        destination,
        { alertType: AlertType.INTRUSION },
      );

      expect(result?.team.id).toBe('proche');
      expect(result?.distanceMeters).toBeGreaterThan(0);
      expect(result?.etaMinutes).toBe(1);
    });

    it('ecarte les equipes engagees, indisponibles ou de mauvaise specialite', () => {
      const result = pickNearestTeam(
        [
          team({ id: 'engagee', status: FieldTeamStatus.ENGAGED }),
          team({ id: 'medicale', speciality: StationType.MEDICAL }),
          team({ id: 'hors-service', status: FieldTeamStatus.UNAVAILABLE }),
          team({ id: 'disponible', speciality: StationType.MIXED }),
        ],
        destination,
        { alertType: AlertType.INTRUSION },
      );

      expect(result?.team.id).toBe('disponible');
    });

    it('ecarte les positions trop anciennes ou absentes', () => {
      const now = new Date('2026-10-03T12:00:00Z');
      const result = pickNearestTeam(
        [
          team({ id: 'perimee', lastPositionAt: new Date('2026-10-03T09:00:00Z') }),
          team({ id: 'sans-position', latitude: null as unknown as number, lastPositionAt: null }),
          team({ id: 'fraiche', lastPositionAt: new Date('2026-10-03T11:45:00Z') }),
        ],
        destination,
        { maxAgeMinutes: 60, now },
      );

      expect(result?.team.id).toBe('fraiche');
    });

    it('renvoie null sans destination ou sans candidat eligible', () => {
      expect(pickNearestTeam([team()], null)).toBeNull();
      expect(pickNearestTeam([], destination)).toBeNull();
      expect(pickNearestTeam([team({ status: FieldTeamStatus.ENGAGED })], destination)).toBeNull();
    });
  });

  describe('watchdog', () => {
    const now = new Date('2026-10-03T12:00:00Z');

    it('detecte un depart non confirme au-dela du delai', () => {
      expect(shouldWarnDepartureLate(new Date('2026-10-03T11:50:00Z'), now, 5)).toBe(true);
      expect(shouldWarnDepartureLate(new Date('2026-10-03T11:58:00Z'), now, 5)).toBe(false);
      expect(shouldWarnDepartureLate(null, now, 5)).toBe(false);
    });

    it('detecte une arrivee anormalement longue', () => {
      expect(shouldWarnArrivalLate(new Date('2026-10-03T11:00:00Z'), null, now, 45)).toBe(true);
      expect(shouldWarnArrivalLate(new Date('2026-10-03T11:00:00Z'), new Date('2026-10-03T11:30:00Z'), now, 45)).toBe(
        false,
      );
      expect(shouldWarnArrivalLate(null, null, now, 45)).toBe(false);
    });

    it('identifie une position d equipe inexploitable', () => {
      expect(isTeamPositionStale(new Date('2026-10-03T09:00:00Z'), now, 60)).toBe(true);
      expect(isTeamPositionStale(new Date('2026-10-03T11:30:00Z'), now, 60)).toBe(false);
      expect(isTeamPositionStale(null, now)).toBe(true);
      expect(isTeamPositionStale('date-invalide', now)).toBe(true);
    });
  });

  describe('computeInterventionDurationSeconds', () => {
    it('calcule la duree entre le depart et la cloture', () => {
      expect(
        computeInterventionDurationSeconds(new Date('2026-10-03T10:00:00Z'), new Date('2026-10-03T10:25:30Z')),
      ).toBe(1530);
    });

    it('renvoie null si une borne manque ou si l ordre est inverse', () => {
      expect(computeInterventionDurationSeconds(null, new Date())).toBeNull();
      expect(computeInterventionDurationSeconds(new Date(), null)).toBeNull();
      expect(
        computeInterventionDurationSeconds(new Date('2026-10-03T10:10:00Z'), new Date('2026-10-03T10:00:00Z')),
      ).toBeNull();
    });
  });
});
