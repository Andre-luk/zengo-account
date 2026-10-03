import { AlertType } from '@common/enums/alert.enum';
import {
  ALERT_TYPE_WEIGHT,
  buildZoneRisk,
  findRepeatClients,
  formatCell,
  gridCellFor,
  riskLevelFor,
  trendFor,
  zoneRiskScore,
} from '@common/utils/risk.util';

describe('Analyse predictive des zones', () => {
  describe('Maillage geographique', () => {
    it('regroupe deux alertes proches dans la meme maille', () => {
      expect(gridCellFor(-4.34, 15.34)).toBe(gridCellFor(-4.36, 15.36));
    });

    it('separe deux alertes de villes differentes', () => {
      expect(gridCellFor(-4.325, 15.322)).not.toBe(gridCellFor(-11.6609, 27.4794));
    });

    it('produit des cles stables, sans derive de virgule flottante', () => {
      expect(gridCellFor(-4.325, 15.322)).toBe('-4.3500,15.3000');
    });

    it('arrondit symetriquement de part et d autre de l equateur', () => {
      // `Math.round(-86.5)` vaut -86 : sans correction, les mailles du sud
      // seraient decalees d'une demi-maille par rapport a celles du nord.
      expect(gridCellFor(4.32, 15.32)).toBe('4.3000,15.3000');
      expect(gridCellFor(-4.32, -15.32)).toBe('-4.3000,-15.3000');
      expect(gridCellFor(4.36, 15.36)).toBe('4.3500,15.3500');
      expect(gridCellFor(-4.36, -15.36)).toBe('-4.3500,-15.3500');
    });

    it('evite la cle « -0 »', () => {
      expect(gridCellFor(0, 0)).toBe('0.0000,0.0000');
      expect(gridCellFor(-0.0001, 0.0001)).toBe('0.0000,0.0000');
    });

    it('formate la maille pour la console', () => {
      expect(formatCell('-4.3250,15.3200')).toBe('-4.3250 / 15.3200');
    });
  });

  describe('Score de risque', () => {
    const base = {
      latitude: -4.325,
      longitude: 15.322,
      alerts: 0,
      confirmed: 0,
      byType: [] as { type: AlertType; count: number }[],
    };

    it('vaut zero sans alerte', () => {
      expect(zoneRiskScore(base)).toBe(0);
    });

    it('croît avec le volume d alertes', () => {
      const one = zoneRiskScore({ ...base, alerts: 1, confirmed: 1, byType: [{ type: AlertType.INTRUSION, count: 1 }] });
      const five = zoneRiskScore({ ...base, alerts: 5, confirmed: 5, byType: [{ type: AlertType.INTRUSION, count: 5 }] });
      expect(five).toBeGreaterThan(one);
    });

    it('pondere davantage un incendie qu une fuite d eau', () => {
      const fire = zoneRiskScore({ ...base, alerts: 3, confirmed: 3, byType: [{ type: AlertType.FIRE, count: 3 }] });
      const water = zoneRiskScore({ ...base, alerts: 3, confirmed: 3, byType: [{ type: AlertType.WATER_LEAK, count: 3 }] });
      expect(fire).toBeGreaterThan(water);
    });

    it('retient la nature dominante des declenchements', () => {
      const score = zoneRiskScore({
        ...base,
        alerts: 4,
        confirmed: 4,
        byType: [
          { type: AlertType.FIRE, count: 3 },
          { type: AlertType.WATER_LEAK, count: 1 },
        ],
      });
      expect(score).toBe(zoneRiskScore({ ...base, alerts: 4, confirmed: 4, byType: [{ type: AlertType.FIRE, count: 4 }] }));
    });

    it('penalise moins une zone dont les alertes sont des faux positifs', () => {
      const real = zoneRiskScore({ ...base, alerts: 6, confirmed: 6, byType: [{ type: AlertType.INTRUSION, count: 6 }] });
      const falseAlarms = zoneRiskScore({ ...base, alerts: 6, confirmed: 0, byType: [{ type: AlertType.INTRUSION, count: 6 }] });
      expect(falseAlarms).toBeLessThan(real);
    });

    it('reste borne a 100', () => {
      expect(
        zoneRiskScore({
          ...base,
          alerts: 200,
          confirmed: 200,
          byType: [{ type: AlertType.FIRE, count: 200 }],
        }),
      ).toBe(100);
    });
  });

  describe('Qualification et tendance', () => {
    it('qualifie les niveaux de risque', () => {
      expect(riskLevelFor(0)).toBe('CALME');
      expect(riskLevelFor(19.9)).toBe('CALME');
      expect(riskLevelFor(20)).toBe('MODERE');
      expect(riskLevelFor(45)).toBe('ELEVE');
      expect(riskLevelFor(80)).toBe('CRITIQUE');
    });

    it('detecte une hausse, une baisse et le bruit', () => {
      expect(trendFor(10, 5)).toBe('EN_HAUSSE');
      expect(trendFor(5, 10)).toBe('EN_BAISSE');
      expect(trendFor(10, 10)).toBe('STABLE');
      expect(trendFor(11, 10)).toBe('STABLE');
      expect(trendFor(0, 0)).toBe('STABLE');
      expect(trendFor(3, 0)).toBe('EN_HAUSSE');
    });
  });

  describe('Construction d une zone notee', () => {
    it('assemble maille, score et niveau', () => {
      const zone = buildZoneRisk({
        latitude: -4.325,
        longitude: 15.322,
        alerts: 8,
        confirmed: 6,
        byType: [{ type: AlertType.INTRUSION, count: 8 }],
      });

      expect(zone.cell).toBe('-4.3500,15.3000');
      expect(zone.level).toBe(riskLevelFor(zone.score));
      expect(zone.score).toBeGreaterThan(20);
    });
  });

  describe('Clients a declenchements repetes', () => {
    const alerts = [
      { clientId: 'a', reference: 'AL-1', type: AlertType.INTRUSION, openedAt: '2026-10-01T10:00:00Z' },
      { clientId: 'a', reference: 'AL-2', type: AlertType.FIRE, openedAt: '2026-10-02T10:00:00Z' },
      { clientId: 'a', reference: 'AL-3', type: AlertType.INTRUSION, openedAt: '2026-10-03T10:00:00Z' },
      { clientId: 'b', reference: 'AL-4', type: AlertType.MEDICAL, openedAt: '2026-10-02T10:00:00Z' },
    ];

    it('retient les clients au-dessus du seuil, du plus actif au moins actif', () => {
      const repeat = findRepeatClients(alerts);
      expect(repeat).toHaveLength(1);
      expect(repeat[0].clientId).toBe('a');
      expect(repeat[0].alerts).toBe(3);
      expect(repeat[0].types).toEqual([AlertType.INTRUSION, AlertType.FIRE]);
      expect(repeat[0].lastAlertAt.toISOString()).toBe('2026-10-03T10:00:00.000Z');
    });

    it('abaisse le seuil si demande', () => {
      expect(findRepeatClients(alerts, 1)).toHaveLength(2);
    });

    it('accepte des dates deja converties', () => {
      const repeat = findRepeatClients(
        alerts.map((alert) => ({ ...alert, openedAt: new Date(alert.openedAt) })),
        4,
      );
      expect(repeat).toHaveLength(0);
    });
  });

  describe('Ponderations', () => {
    it('couvre toutes les natures d alerte', () => {
      for (const type of Object.values(AlertType)) {
        expect(ALERT_TYPE_WEIGHT[type]).toBeGreaterThan(0);
      }
    });
  });
});
