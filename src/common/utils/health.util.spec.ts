import {
  HealthConsentScope,
  HealthConsentStatus,
  HealthMetric,
  HealthReadingStatus,
} from '@common/enums/health.enum';
import {
  buildNurseRequestReference,
  classifyBloodPressure,
  classifyGlucose,
  classifyHeartRate,
  classifyReading,
  classifySpo2,
  classifyTemperature,
  classifyWeight,
  computeBmi,
  countByStatus,
  defaultConsentExpiry,
  detectTrend,
  evaluateConsent,
  hasConsent,
  isConsentExpired,
  isCriticalReading,
  isNurseRequestLate,
  nurseResponseDueAt,
  suggestPriority,
  summarizeVitals,
} from '@common/utils/health.util';

const at = (iso: string): Date => new Date(iso);

describe('health.util — tension arterielle', () => {
  it('classe une tension optimale', () => {
    expect(classifyBloodPressure(115, 75)).toBe('OPTIMAL');
    expect(classifyReading(HealthMetric.BLOOD_PRESSURE, 115, 75).status).toBe(
      HealthReadingStatus.NORMAL,
    );
  });

  it('classe la tension normale haute en surveillance', () => {
    expect(classifyBloodPressure(132, 86)).toBe('HIGH_NORMAL');
    expect(classifyReading(HealthMetric.BLOOD_PRESSURE, 132, 86).status).toBe(
      HealthReadingStatus.WATCH,
    );
  });

  it('retient le stade le plus eleve entre systolique et diastolique', () => {
    // 150/95 : hypertension stade 1 (grade 2 au-dela de 160/100).
    expect(classifyBloodPressure(150, 95)).toBe('HYPERTENSION_1');
    expect(classifyReading(HealthMetric.BLOOD_PRESSURE, 150, 95).status).toBe(
      HealthReadingStatus.WATCH,
    );
    // 165/102 : systolique et diastolique en stade 2 -> critique.
    expect(classifyBloodPressure(165, 102)).toBe('HYPERTENSION_2');
    expect(classifyReading(HealthMetric.BLOOD_PRESSURE, 165, 102).status).toBe(
      HealthReadingStatus.CRITICAL,
    );
    // 132/102 : la diastolique suffit a classer en stade 2.
    expect(classifyBloodPressure(132, 102)).toBe('HYPERTENSION_2');
  });

  it('detecte une poussee hypertensive', () => {
    expect(classifyBloodPressure(182, 112)).toBe('HYPERTENSIVE_CRISIS');
  });

  it('detecte une hypotension', () => {
    expect(classifyBloodPressure(85, 55)).toBe('HYPOTENSION');
    expect(classifyReading(HealthMetric.BLOOD_PRESSURE, 85, 55).status).toBe(
      HealthReadingStatus.WATCH,
    );
  });

  it('inclut les valeurs dans le libelle', () => {
    expect(
      classifyReading(HealthMetric.BLOOD_PRESSURE, 145, 92).label,
    ).toContain('145/92 mmHg');
  });
});

describe('health.util — glycémie', () => {
  it('apprecie une glycemie a jeun normale', () => {
    expect(classifyGlucose(92, { fasting: true }).status).toBe(
      HealthReadingStatus.NORMAL,
    );
  });

  it('detecte un prediabete a jeun', () => {
    expect(classifyGlucose(110, { fasting: true }).label).toBe('Prédiabète');
  });

  it('detecte une hyperglycemie a jeun', () => {
    expect(classifyGlucose(180, { fasting: true }).status).toBe(
      HealthReadingStatus.CRITICAL,
    );
  });

  it('detecte une hypoglycemie severe', () => {
    expect(classifyGlucose(48, { fasting: true }).status).toBe(
      HealthReadingStatus.CRITICAL,
    );
  });

  it('utilise le referentiel post-prandial quand ce n est pas a jeun', () => {
    // 150 mg/dL est eleve sans etre critique hors jeun.
    expect(classifyGlucose(150, { fasting: false }).status).toBe(
      HealthReadingStatus.WATCH,
    );
    expect(classifyGlucose(150, { fasting: true }).status).toBe(
      HealthReadingStatus.CRITICAL,
    );
  });
});

describe('health.util — autres grandeurs', () => {
  it('apprecie la frequence cardiaque', () => {
    expect(classifyHeartRate(72).status).toBe(HealthReadingStatus.NORMAL);
    expect(classifyHeartRate(110).status).toBe(HealthReadingStatus.WATCH);
    expect(classifyHeartRate(130).status).toBe(HealthReadingStatus.CRITICAL);
    expect(classifyHeartRate(38).status).toBe(HealthReadingStatus.CRITICAL);
  });

  it('apprecie la saturation en oxygene', () => {
    expect(classifySpo2(98).status).toBe(HealthReadingStatus.NORMAL);
    expect(classifySpo2(93).status).toBe(HealthReadingStatus.WATCH);
    expect(classifySpo2(88).status).toBe(HealthReadingStatus.CRITICAL);
  });

  it('apprecie la temperature', () => {
    expect(classifyTemperature(36.8).status).toBe(HealthReadingStatus.NORMAL);
    expect(classifyTemperature(38.4).status).toBe(HealthReadingStatus.WATCH);
    expect(classifyTemperature(40.1).status).toBe(HealthReadingStatus.CRITICAL);
    expect(classifyTemperature(34.5).status).toBe(HealthReadingStatus.CRITICAL);
  });

  it('calcule l IMC quand la taille est fournie', () => {
    expect(computeBmi(70, 175)).toBe(22.9);
    expect(computeBmi(70, 0)).toBeNull();
    expect(classifyWeight(70, 175).status).toBe(HealthReadingStatus.NORMAL);
    expect(classifyWeight(95, 170).label).toContain('IMC 32.9');
    expect(classifyWeight(70, null).label).toBe('Poids enregistré');
  });
});

describe('health.util — alertes et tendances', () => {
  it('identifie les mesures critiques', () => {
    expect(
      isCriticalReading({
        metric: HealthMetric.SPO2,
        value: 86,
        measuredAt: at('2026-01-01T08:00:00Z'),
      }),
    ).toBe(true);
    expect(
      isCriticalReading({
        metric: HealthMetric.SPO2,
        value: 97,
        measuredAt: at('2026-01-01T08:00:00Z'),
      }),
    ).toBe(false);
  });

  it('detecte une aggravation puis une amelioration', () => {
    const worsening = [
      { metric: HealthMetric.SPO2, value: 97, measuredAt: at('2026-01-01T08:00:00Z') },
      { metric: HealthMetric.SPO2, value: 91, measuredAt: at('2026-01-02T08:00:00Z') },
    ];
    expect(detectTrend(worsening)).toBe('WORSENING');

    const improving = [
      { metric: HealthMetric.SPO2, value: 91, measuredAt: at('2026-01-01T08:00:00Z') },
      { metric: HealthMetric.SPO2, value: 97, measuredAt: at('2026-01-02T08:00:00Z') },
    ];
    expect(detectTrend(improving)).toBe('IMPROVING');

    // L'ordre d'arrivee n'influence pas le resultat : la serie est triee.
    expect(detectTrend([...worsening].reverse())).toBe('WORSENING');
    expect(detectTrend([worsening[0]])).toBe('INSUFFICIENT');
    expect(detectTrend([worsening[0], worsening[0]])).toBe('STABLE');
  });

  it('resume les dernieres valeurs par grandeur', () => {
    const summary = summarizeVitals([
      { metric: HealthMetric.SPO2, value: 96, measuredAt: at('2026-01-01T08:00:00Z') },
      { metric: HealthMetric.SPO2, value: 88, measuredAt: at('2026-01-05T08:00:00Z') },
      {
        metric: HealthMetric.BLOOD_PRESSURE,
        value: 132,
        secondaryValue: 84,
        measuredAt: at('2026-01-04T08:00:00Z'),
      },
    ]);

    expect(summary.map((item) => item.metric)).toEqual([
      HealthMetric.BLOOD_PRESSURE,
      HealthMetric.SPO2,
    ]);
    const spo2 = summary[1];
    expect(spo2.value).toBe(88);
    expect(spo2.unit).toBe('%');
    expect(spo2.status).toBe(HealthReadingStatus.CRITICAL);
    expect(spo2.trend).toBe('WORSENING');
    expect(spo2.sampleCount).toBe(2);
  });

  it('compte les mesures par statut', () => {
    const counts = countByStatus([
      { metric: HealthMetric.SPO2, value: 97, measuredAt: at('2026-01-01T08:00:00Z') },
      { metric: HealthMetric.SPO2, value: 92, measuredAt: at('2026-01-02T08:00:00Z') },
      { metric: HealthMetric.SPO2, value: 85, measuredAt: at('2026-01-03T08:00:00Z') },
    ]);
    expect(counts[HealthReadingStatus.NORMAL]).toBe(1);
    expect(counts[HealthReadingStatus.WATCH]).toBe(1);
    expect(counts[HealthReadingStatus.CRITICAL]).toBe(1);
  });
});

describe('health.util — consentement', () => {
  const consents = [
    {
      scope: HealthConsentScope.DATA_SHARING,
      status: HealthConsentStatus.GRANTED,
      grantedAt: at('2026-01-01T00:00:00Z'),
      expiresAt: at('2028-01-01T00:00:00Z'),
    },
  ];

  it('accorde l acces lorsque le consentement est valide', () => {
    expect(
      hasConsent(consents, HealthConsentScope.DATA_SHARING, at('2026-06-01T00:00:00Z')),
    ).toBe(true);
    expect(
      evaluateConsent(consents, HealthConsentScope.DATA_SHARING, {
        at: at('2026-06-01T00:00:00Z'),
      }),
    ).toEqual({ allowed: true, reason: 'CONSENT_GRANTED' });
  });

  it('refuse en l absence de consentement', () => {
    expect(evaluateConsent([], HealthConsentScope.DATA_SHARING)).toEqual({
      allowed: false,
      reason: 'NO_CONSENT',
    });
  });

  it('refuse un consentement revoque', () => {
    const revoked = [
      {
        scope: HealthConsentScope.DATA_SHARING,
        status: HealthConsentStatus.REVOKED,
        grantedAt: at('2026-01-01T00:00:00Z'),
        revokedAt: at('2026-02-01T00:00:00Z'),
      },
    ];
    expect(
      evaluateConsent(revoked, HealthConsentScope.DATA_SHARING).reason,
    ).toBe('CONSENT_REVOKED');
  });

  it('refuse un consentement expire mais l accorde avant echeance', () => {
    const expiring = [
      {
        scope: HealthConsentScope.DATA_SHARING,
        status: HealthConsentStatus.GRANTED,
        grantedAt: at('2026-01-01T00:00:00Z'),
        expiresAt: at('2026-03-01T00:00:00Z'),
      },
    ];
    expect(
      evaluateConsent(expiring, HealthConsentScope.DATA_SHARING, {
        at: at('2026-04-01T00:00:00Z'),
      }).reason,
    ).toBe('CONSENT_EXPIRED');
    expect(isConsentExpired(expiring[0], at('2026-04-01T00:00:00Z'))).toBe(true);
    expect(
      hasConsent(expiring, HealthConsentScope.DATA_SHARING, at('2026-02-01T00:00:00Z')),
    ).toBe(true);
  });

  it('autorise un acces d urgence sans consentement, en le tracant', () => {
    expect(
      evaluateConsent([], HealthConsentScope.EMERGENCY_DISCLOSURE, {
        emergency: true,
      }),
    ).toEqual({ allowed: true, reason: 'EMERGENCY_BYPASS' });
  });

  it('retient le dernier consentement en date', () => {
    const history = [
      {
        scope: HealthConsentScope.NURSE_CONTACT,
        status: HealthConsentStatus.GRANTED,
        grantedAt: at('2026-01-01T00:00:00Z'),
        revokedAt: at('2026-01-10T00:00:00Z'),
      },
      {
        scope: HealthConsentScope.NURSE_CONTACT,
        status: HealthConsentStatus.GRANTED,
        grantedAt: at('2026-02-01T00:00:00Z'),
      },
    ];
    expect(hasConsent(history, HealthConsentScope.NURSE_CONTACT)).toBe(true);
  });

  it('calcule une echeance de consentement par defaut', () => {
    const expires = defaultConsentExpiry(at('2026-01-31T00:00:00Z'));
    expect(expires.getUTCFullYear()).toBe(2028);
  });
});

describe('health.util — demandes de soin', () => {
  it('construit une reference journaliere', () => {
    expect(buildNurseRequestReference(at('2026-10-04T09:00:00Z'), 7)).toBe(
      'NS-20261004-0007',
    );
  });

  it('calcule l echeance de prise en charge selon la priorite', () => {
    const created = at('2026-10-04T08:00:00Z');
    expect(nurseResponseDueAt(created, 'EMERGENCY').toISOString()).toBe(
      '2026-10-04T08:10:00.000Z',
    );
    expect(nurseResponseDueAt(created, 'URGENT').toISOString()).toBe(
      '2026-10-04T09:00:00.000Z',
    );
    expect(nurseResponseDueAt(created, 'ROUTINE').toISOString()).toBe(
      '2026-10-04T12:00:00.000Z',
    );
  });

  it('detecte une prise en charge tardive', () => {
    const request = {
      createdAt: at('2026-10-04T08:00:00Z'),
      priority: 'URGENT' as const,
    };
    expect(
      isNurseRequestLate(request, at('2026-10-04T08:30:00Z'), at('2026-10-04T09:30:00Z')),
    ).toBe(false);
    expect(
      isNurseRequestLate(request, at('2026-10-04T09:30:00Z'), at('2026-10-04T10:00:00Z')),
    ).toBe(true);
    expect(isNurseRequestLate(request, null, at('2026-10-04T10:00:00Z'))).toBe(
      true,
    );
  });

  it('suggere une priorite a partir des dernieres mesures', () => {
    const reading = (
      metric: HealthMetric,
      value: number,
      secondaryValue?: number,
    ) => ({ metric, value, secondaryValue, measuredAt: at('2026-10-04T08:00:00Z') });

    expect(suggestPriority([reading(HealthMetric.SPO2, 97)])).toBe('ROUTINE');
    expect(suggestPriority([reading(HealthMetric.SPO2, 92)])).toBe('URGENT');
    expect(
      suggestPriority([
        reading(HealthMetric.BLOOD_PRESSURE, 182, 112),
        reading(HealthMetric.SPO2, 97),
      ]),
    ).toBe('EMERGENCY');
  });
});
