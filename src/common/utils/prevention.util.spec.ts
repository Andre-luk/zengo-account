import {
  PreventionAudience,
  PreventionCampaignStatus,
  PreventionLevel,
} from '@common/enums/prevention.enum';
import {
  campaignStatusFor,
  describeCampaignOutcome,
  eligiblePreventionZones,
  evaluatePreventionEligibility,
  PREVENTION_LEVEL_ADVICE,
  PREVENTION_LEVEL_LABELS,
  preventionLevelFor,
  preventionTemplateVars,
  selectPreventionAudience,
  zoneKeyFor,
  type ClientLocation,
  type PreventionZone,
} from '@common/utils/prevention.util';

const at = (iso: string): Date => new Date(iso);

const zone = (overrides: Partial<PreventionZone> = {}): PreventionZone => ({
  zoneKey: '-4.3250|15.3125',
  latitude: -4.325,
  longitude: 15.3125,
  city: 'Kinshasa',
  alerts: 6,
  confirmedRatio: 0.5,
  score: 62,
  level: 'ELEVE',
  ...overrides,
});

const client = (
  id: string,
  latitude: number | null,
  longitude: number | null,
  overrides: Partial<ClientLocation> = {},
): ClientLocation => ({
  id,
  fullName: `Client ${id}`,
  latitude,
  longitude,
  subscriptionActive: true,
  primaryPhone: '+243810000000',
  ...overrides,
});

describe('prevention.util — maille et niveau', () => {
  it('construit une cle de maille stable', () => {
    expect(zoneKeyFor(-4.325, 15.3125)).toBe('-4.3250|15.3125');
    // Deux points de la meme maille partagent la meme cle.
    expect(zoneKeyFor(-4.3249, 15.3126)).toBe(zoneKeyFor(-4.3251, 15.3124));
  });

  it('arrondit selon la precision demandee', () => {
    expect(zoneKeyFor(-4.325, 15.3125, 0.5)).toBe('-4.5000|15.5000');
  });

  it('traduit le niveau de risque en niveau de vigilance', () => {
    expect(preventionLevelFor('CRITIQUE')).toBe(PreventionLevel.HIGH);
    expect(preventionLevelFor('ELEVE')).toBe(PreventionLevel.WATCH);
    expect(preventionLevelFor('MODERE')).toBe(PreventionLevel.ADVISORY);
    expect(preventionLevelFor('CALME')).toBe(PreventionLevel.ADVISORY);
  });

  it('expose des libelles et conseils par niveau', () => {
    expect(PREVENTION_LEVEL_LABELS[PreventionLevel.HIGH]).toBe('vigilance renforcee');
    expect(PREVENTION_LEVEL_ADVICE[PreventionLevel.WATCH]).toContain('capteurs');
  });
});

describe('prevention.util — eligibilite', () => {
  it('accepte une zone a risque avec volume suffisant', () => {
    expect(evaluatePreventionEligibility(zone()).eligible).toBe(true);
    expect(evaluatePreventionEligibility(zone()).reason).toBe('ELIGIBLE');
  });

  it('refuse une zone trop calme', () => {
    const verdict = evaluatePreventionEligibility(zone({ level: 'MODERE', score: 25 }));
    expect(verdict.eligible).toBe(false);
    expect(verdict.reason).toBe('LEVEL_TOO_LOW');
  });

  it('refuse une zone sans volume d alertes suffisant', () => {
    const verdict = evaluatePreventionEligibility(zone({ alerts: 1 }));
    expect(verdict.eligible).toBe(false);
    expect(verdict.reason).toBe('VOLUME_TOO_LOW');
  });

  it('respecte le delai de carence entre deux campagnes', () => {
    const verdict = evaluatePreventionEligibility(zone(), {
      lastCampaignAt: at('2026-09-20T08:00:00Z'),
      cooldownDays: 30,
      now: at('2026-10-01T08:00:00Z'),
    });
    expect(verdict.eligible).toBe(false);
    expect(verdict.reason).toBe('COOLDOWN_ACTIVE');
    expect(verdict.nextEligibleAt?.toISOString()).toBe('2026-10-20T08:00:00.000Z');
  });

  it('redevient eligible apres le delai de carence', () => {
    expect(
      evaluatePreventionEligibility(zone(), {
        lastCampaignAt: at('2026-09-01T08:00:00Z'),
        cooldownDays: 30,
        now: at('2026-10-05T08:00:00Z'),
      }).eligible,
    ).toBe(true);
  });

  it('retient les zones eligibles les plus risquees', () => {
    const zones = [
      zone({ zoneKey: 'a', score: 90, level: 'CRITIQUE' }),
      zone({ zoneKey: 'b', score: 60, level: 'ELEVE' }),
      zone({ zoneKey: 'c', score: 10, level: 'CALME' }),
    ];
    const selected = eligiblePreventionZones(zones, {
      b: at('2026-10-04T08:00:00Z'),
    });
    expect(selected.map((entry) => entry.zone.zoneKey)).toEqual(['a']);
  });

  it('limite le nombre de zones traitees automatiquement', () => {
    const zones = Array.from({ length: 8 }, (_, index) =>
      zone({ zoneKey: `z${index}`, score: 90 - index, level: 'CRITIQUE' }),
    );
    expect(eligiblePreventionZones(zones, {}, { limit: 3 })).toHaveLength(3);
  });
});

describe('prevention.util — selection des destinataires', () => {
  const centre = { latitude: -4.325, longitude: 15.3125 };
  // ~1,1 km au nord du centre.
  const near = { latitude: -4.315, longitude: 15.3125 };
  // ~11 km au nord du centre.
  const far = { latitude: -4.225, longitude: 15.3125 };

  it('retient les clients du rayon avec un abonnement actif', () => {
    const targets = selectPreventionAudience(
      [
        client('near', near.latitude, near.longitude),
        client('far', far.latitude, far.longitude),
        client('suspended', near.latitude, near.longitude, { subscriptionActive: false }),
        client('unknown', null, null),
      ],
      { centre, radiusKm: 3 },
    );
    expect(targets.map((target) => target.clientId)).toEqual(['near']);
    expect(targets[0].distanceKm).toBeGreaterThan(0.5);
    expect(targets[0].distanceKm).toBeLessThan(2);
  });

  it('trie les destinataires du plus proche au plus eloigne', () => {
    const targets = selectPreventionAudience(
      [
        client('mid', -4.318, 15.3125),
        client('near', -4.323, 15.3125),
      ],
      { centre, radiusKm: 5 },
    );
    expect(targets.map((target) => target.clientId)).toEqual(['near', 'mid']);
  });

  it('restreint aux clients a declenchements repetes quand demande', () => {
    const targets = selectPreventionAudience(
      [
        client('repeat', near.latitude, near.longitude),
        client('other', near.latitude, near.longitude),
      ],
      {
        centre,
        radiusKm: 5,
        audience: PreventionAudience.REPEAT_CLIENTS,
        repeatClientIds: ['repeat'],
      },
    );
    expect(targets.map((target) => target.clientId)).toEqual(['repeat']);
  });

  it('peut inclure les abonnements suspendus si demande', () => {
    const targets = selectPreventionAudience(
      [client('suspended', near.latitude, near.longitude, { subscriptionActive: false })],
      { centre, radiusKm: 5, requireActiveSubscription: false },
    );
    expect(targets).toHaveLength(1);
  });

  it('elargit le rayon quand il augmente', () => {
    const clients = [client('far', far.latitude, far.longitude)];
    expect(selectPreventionAudience(clients, { centre, radiusKm: 3 })).toHaveLength(0);
    expect(selectPreventionAudience(clients, { centre, radiusKm: 15 })).toHaveLength(1);
  });
});

describe('prevention.util — resultats et message', () => {
  it('determine le statut de la campagne', () => {
    expect(campaignStatusFor(10, 0)).toBe(PreventionCampaignStatus.SENT);
    expect(campaignStatusFor(10, 2)).toBe(PreventionCampaignStatus.PARTIAL);
    expect(campaignStatusFor(0, 3)).toBe(PreventionCampaignStatus.FAILED);
    expect(campaignStatusFor(0, 0)).toBe(PreventionCampaignStatus.SENT);
  });

  it('decrit le resultat de la diffusion', () => {
    expect(describeCampaignOutcome(12, 0, 0)).toBe('12 message(s) transmis.');
    expect(describeCampaignOutcome(9, 2, 1)).toBe(
      '9 message(s) transmis, 2 echec(s), 1 destinataire(s) sans numero exploitable.',
    );
  });

  it('prepare les variables du SMS de prevention', () => {
    const vars = preventionTemplateVars(zone({ level: 'CRITIQUE', alerts: 12 }));
    expect(vars.level).toBe('vigilance renforcee');
    expect(vars.zone).toBe('Kinshasa');
    expect(vars.alerts).toBe(12);
    expect(vars.advice).toContain('tournee');

    const fallback = preventionTemplateVars(zone({ city: null }));
    expect(fallback.zone).toBe('votre zone');
  });
});
