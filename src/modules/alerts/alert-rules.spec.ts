import { AlertSeverity, AlertStatus, AlertType } from '@common/enums/alert.enum';
import { SubDeviceCode } from '@common/enums/device.enum';
import {
  buildAlertReference,
  computeSeverity,
  dispatchPriorityFor,
  isClosedStatus,
  isEscalationDue,
  isOpenStatus,
  resolveAlertType,
  shouldGroupOccurrence,
} from './alert-rules';

describe('resolveAlertType', () => {
  it('deduit le type depuis le code du sous-appareil', () => {
    expect(resolveAlertType(SubDeviceCode.WSD)).toBe(AlertType.FIRE);
    expect(resolveAlertType(SubDeviceCode.GLS)).toBe(AlertType.GAS_LEAK);
    expect(resolveAlertType(SubDeviceCode.WLS)).toBe(AlertType.WATER_LEAK);
    expect(resolveAlertType(SubDeviceCode.DC)).toBe(AlertType.INTRUSION);
    expect(resolveAlertType(SubDeviceCode.PIR)).toBe(AlertType.INTRUSION);
    expect(resolveAlertType(SubDeviceCode.CON)).toBe(AlertType.PANIC);
  });

  it('utilise le code numerique en dernier recours', () => {
    expect(resolveAlertType(null, 1)).toBe(AlertType.SABOTAGE);
    expect(resolveAlertType(null, 2)).toBe(AlertType.SYSTEM);
    expect(resolveAlertType(null, 3)).toBe(AlertType.FIRE);
    expect(resolveAlertType(null, 4)).toBe(AlertType.MEDICAL);
  });

  it('retombe sur intrusion par defaut', () => {
    expect(resolveAlertType(null, null)).toBe(AlertType.INTRUSION);
    expect(resolveAlertType(undefined)).toBe(AlertType.INTRUSION);
    expect(resolveAlertType(null, 99)).toBe(AlertType.INTRUSION);
  });

  it('priorise le code du sous-appareil sur le code numerique', () => {
    expect(resolveAlertType(SubDeviceCode.WSD, 1)).toBe(AlertType.FIRE);
  });
});

describe('computeSeverity', () => {
  it('classe les dangers vitaux en critique', () => {
    for (const type of [AlertType.FIRE, AlertType.GAS_LEAK, AlertType.MEDICAL, AlertType.PANIC]) {
      expect(computeSeverity(type)).toBe(AlertSeverity.CRITICAL);
    }
  });

  it('classe intrusion et sabotage en eleve', () => {
    expect(computeSeverity(AlertType.INTRUSION)).toBe(AlertSeverity.HIGH);
    expect(computeSeverity(AlertType.SABOTAGE)).toBe(AlertSeverity.HIGH);
  });

  it('classe fuite d eau en moyen et incident systeme en faible', () => {
    expect(computeSeverity(AlertType.WATER_LEAK)).toBe(AlertSeverity.MEDIUM);
    expect(computeSeverity(AlertType.SYSTEM)).toBe(AlertSeverity.LOW);
  });
});

describe('shouldGroupOccurrence', () => {
  it('ne regroupe jamais une alerte critique', () => {
    expect(shouldGroupOccurrence(AlertType.FIRE)).toBe(false);
    expect(shouldGroupOccurrence(AlertType.MEDICAL)).toBe(false);
  });

  it('regroupe les declenchements repetitifs non critiques', () => {
    expect(shouldGroupOccurrence(AlertType.INTRUSION)).toBe(true);
  });
});

describe('isEscalationDue', () => {
  const openedAt = new Date('2026-10-03T10:00:00.000Z');

  it('n escalade pas avant la fin de la temporisation', () => {
    const now = new Date('2026-10-03T10:04:59.000Z');
    expect(
      isEscalationDue(
        { status: AlertStatus.NEW, dispatchedAt: null, escalationLevel: 0, openedAt },
        300,
        now,
      ),
    ).toBe(false);
  });

  it('escalade a l echeance des 5 minutes (regle du cahier des charges)', () => {
    const now = new Date('2026-10-03T10:05:00.000Z');
    expect(
      isEscalationDue(
        { status: AlertStatus.NEW, dispatchedAt: null, escalationLevel: 0, openedAt },
        300,
        now,
      ),
    ).toBe(true);
  });

  it('n escalade plus si une equipe a ete affectee', () => {
    const now = new Date('2026-10-03T10:30:00.000Z');
    expect(
      isEscalationDue(
        {
          status: AlertStatus.ACKNOWLEDGED,
          dispatchedAt: new Date('2026-10-03T10:01:00.000Z'),
          escalationLevel: 0,
          openedAt,
        },
        300,
        now,
      ),
    ).toBe(false);
  });

  it('ne re-escalade pas une alerte deja escaladee', () => {
    const now = new Date('2026-10-03T11:00:00.000Z');
    expect(
      isEscalationDue({ status: AlertStatus.ASSIGNED, dispatchedAt: null, escalationLevel: 1, openedAt }, 300, now),
    ).toBe(false);
  });

  it('ignore les alertes cloturees', () => {
    const now = new Date('2026-10-03T11:00:00.000Z');
    for (const status of [AlertStatus.RESOLVED, AlertStatus.FALSE_ALARM, AlertStatus.CANCELLED]) {
      expect(isEscalationDue({ status, dispatchedAt: null, escalationLevel: 0, openedAt }, 300, now)).toBe(false);
    }
  });
});

describe('isOpenStatus / isClosedStatus', () => {
  it('identifie les statuts ouverts', () => {
    expect(isOpenStatus(AlertStatus.NEW)).toBe(true);
    expect(isOpenStatus(AlertStatus.ASSIGNED)).toBe(true);
    expect(isOpenStatus(AlertStatus.RESOLVED)).toBe(false);
  });

  it('identifie les statuts clotures', () => {
    expect(isClosedStatus(AlertStatus.RESOLVED)).toBe(true);
    expect(isClosedStatus(AlertStatus.FALSE_ALARM)).toBe(true);
    expect(isClosedStatus(AlertStatus.CANCELLED)).toBe(true);
    expect(isClosedStatus(AlertStatus.IN_PROGRESS)).toBe(false);
  });
});

describe('dispatchPriorityFor', () => {
  it('oriente chaque nature d alerte vers la bonne famille de station', () => {
    expect(dispatchPriorityFor(AlertType.FIRE)).toBe('FIRE');
    expect(dispatchPriorityFor(AlertType.GAS_LEAK)).toBe('FIRE');
    expect(dispatchPriorityFor(AlertType.MEDICAL)).toBe('MEDICAL');
    expect(dispatchPriorityFor(AlertType.INTRUSION)).toBe('INTRUSION');
    expect(dispatchPriorityFor(AlertType.PANIC)).toBe('INTRUSION');
    expect(dispatchPriorityFor(AlertType.SYSTEM)).toBe('MIXED');
  });
});

describe('buildAlertReference', () => {
  it('construit AL-AAAAMMJJ-NNNN sur le jour local', () => {
    // Dates construites en heure locale pour rester independantes du fuseau.
    expect(buildAlertReference(7, new Date(2026, 9, 3, 9, 0, 0))).toBe('AL-20261003-0007');
    expect(buildAlertReference(1234, new Date(2026, 0, 31, 23, 0, 0))).toBe('AL-20260131-1234');
  });

  it('complete la sequence sur quatre chiffres', () => {
    expect(buildAlertReference(1, new Date(2026, 11, 25, 8, 0, 0))).toBe('AL-20261225-0001');
  });
});
