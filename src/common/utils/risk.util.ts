import { AlertType } from '@common/enums/alert.enum';

/**
 * Analyse predictive : regroupement des incidents par zone et detection des
 * zones a risque.
 *
 * Toutes les fonctions de ce fichier sont pures : la ponderation et les seuils
 * sont explicites et testables, ce qui permet d'ajuster la sensibilite du
 * modele sans redemarrer les tests de fumee ni toucher SQL.
 */

/** Poids d'une nature d'alerte dans le score de risque d'une zone. */
export const ALERT_TYPE_WEIGHT: Record<AlertType, number> = {
  [AlertType.INTRUSION]: 3,
  [AlertType.FIRE]: 5,
  [AlertType.MEDICAL]: 4,
  [AlertType.PANIC]: 4,
  [AlertType.SABOTAGE]: 3,
  [AlertType.GAS_LEAK]: 4,
  [AlertType.WATER_LEAK]: 1,
  [AlertType.SYSTEM]: 1,
};

/** Poids d'une gravite declaree sur le declenchement. */
export const SEVERITY_WEIGHT: Record<string, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

export type RiskLevel = 'CALME' | 'MODERE' | 'ELEVE' | 'CRITIQUE';

/** Seuils de qualification d'un score de risque. */
export const RISK_LEVEL_THRESHOLDS: { level: RiskLevel; min: number }[] = [
  { level: 'CRITIQUE', min: 80 },
  { level: 'ELEVE', min: 45 },
  { level: 'MODERE', min: 20 },
  { level: 'CALME', min: 0 },
];

export const riskLevelFor = (score: number): RiskLevel =>
  RISK_LEVEL_THRESHOLDS.find((entry) => score >= entry.min)?.level ?? 'CALME';

export type RiskTrend = 'EN_HAUSSE' | 'STABLE' | 'EN_BAISSE';

/**
 * Tendance entre deux periodes de meme duree. Une variation de moins de 20 %
 * est consideree comme du bruit : elle n'est pas presentee comme une tendance.
 */
export const trendFor = (recent: number, previous: number): RiskTrend => {
  if (previous === 0 && recent === 0) return 'STABLE';
  if (previous === 0) return 'EN_HAUSSE';

  const variation = (recent - previous) / previous;
  if (variation > 0.2) return 'EN_HAUSSE';
  if (variation < -0.2) return 'EN_BAISSE';
  return 'STABLE';
};

export interface AlertLike {
  type: AlertType;
  severity?: string | null;
}

export interface ZoneAggregate {
  latitude: number;
  longitude: number;
  alerts: number;
  /** Alertes confirmees ou traitees par une equipe (exclut les faux positifs). */
  confirmed: number;
  byType: { type: AlertType; count: number }[];
}

export interface ZoneRisk extends ZoneAggregate {
  /** Cle de la maille geographique (`-4.32,15.32`). */
  cell: string;
  score: number;
  level: RiskLevel;
}

/** Cle de maille : arrondi des coordonnees a `precisionDegrees` pres. */
export const gridCellFor = (
  latitude: number,
  longitude: number,
  precisionDegrees = 0.05,
): string => {
  // Arrondi symetrique : `Math.round(-86.5)` vaut -86, ce qui decalerait les
  // mailles de l'hemisphere sud par rapport a celles de l'hemisphere nord.
  const round = (value: number): string => {
    const steps = Math.round(Math.abs(value) / precisionDegrees);
    const rounded = (value < 0 ? -1 : 1) * steps * precisionDegrees;
    // `toFixed` evite les cles du type `-4.300000000000001`.
    return (Object.is(rounded, -0) ? 0 : rounded).toFixed(4);
  };
  return `${round(latitude)},${round(longitude)}`;
};

/**
 * Score de risque d'une maille.
 *
 * Le score combine le volume (`2` points par alerte), la nature des
 * declenchements (poids par type, applique a la nature dominante) et la part
 * d'alertes confirmes : une zone qui declenche beaucoup mais dont la plupart
 * des alertes sont des faux positifs ne doit pas etre presentee comme
 * dangereuse. Le resultat est borne a 100.
 */
export const zoneRiskScore = (aggregate: ZoneAggregate): number => {
  if (aggregate.alerts === 0) return 0;

  const dominant = aggregate.byType.reduce<(typeof aggregate.byType)[number] | null>(
    (best, entry) => (!best || entry.count > best.count ? entry : best),
    null,
  );
  const typeWeight = dominant ? (ALERT_TYPE_WEIGHT[dominant.type] ?? 1) : 1;
  const confirmationRate = aggregate.confirmed / aggregate.alerts;

  const volume = aggregate.alerts * 2;
  const nature = typeWeight * 4;
  const confirmation = confirmationRate * 30;

  return Math.min(100, Math.round((volume + nature + confirmation) * 10) / 10);
};

/** Construit une zone notee a partir d'une agregation SQL. */
export const buildZoneRisk = (aggregate: ZoneAggregate, precisionDegrees = 0.05): ZoneRisk => {
  const score = zoneRiskScore(aggregate);
  return {
    ...aggregate,
    cell: gridCellFor(aggregate.latitude, aggregate.longitude, precisionDegrees),
    score,
    level: riskLevelFor(score),
  };
};

export interface RepeatClientInput {
  clientId: string;
  reference: string;
  type: AlertType;
  openedAt: Date | string;
}

export interface RepeatClient {
  clientId: string;
  alerts: number;
  lastAlertAt: Date;
  types: AlertType[];
}

/**
 * Clients a declenchements repetes sur la periode : un client qui declenche
 * trois fois ou plus merite une visite de controle (reglage capteur, usage
 * domestique mal compris, ou vrai probleme d'installation).
 */
export const findRepeatClients = (alerts: RepeatClientInput[], minimum = 3): RepeatClient[] => {
  const byClient = new Map<string, RepeatClient>();

  for (const alert of alerts) {
    const existing = byClient.get(alert.clientId);
    const openedAt = alert.openedAt instanceof Date ? alert.openedAt : new Date(alert.openedAt);

    if (!existing) {
      byClient.set(alert.clientId, {
        clientId: alert.clientId,
        alerts: 1,
        lastAlertAt: openedAt,
        types: [alert.type],
      });
      continue;
    }

    existing.alerts += 1;
    if (openedAt > existing.lastAlertAt) existing.lastAlertAt = openedAt;
    if (!existing.types.includes(alert.type)) existing.types.push(alert.type);
  }

  return [...byClient.values()]
    .filter((entry) => entry.alerts >= minimum)
    .sort((left, right) => right.alerts - left.alerts || right.lastAlertAt.getTime() - left.lastAlertAt.getTime());
};

/** Grille lisible pour la console : `-4.32 / 15.32`. */
export const formatCell = (cell: string): string => cell.split(',').join(' / ');
