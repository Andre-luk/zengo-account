import {
  PreventionAudience,
  PreventionCampaignStatus,
  PreventionLevel,
} from '@common/enums/prevention.enum';
import { RiskLevel } from '@common/utils/risk.util';
import { haversineMeters } from '@common/utils/geo.util';

/**
 * Regles metier pures des notifications de prevention.
 *
 * L'analyse de risque produit des zones classees ; la prevention decide *qui* il
 * faut informer, *avec quel message* et *a quelle condition* une nouvelle
 * campagne est utile. Tout est ici testable sans base de donnees.
 */

/** Rayon par defaut d'une campagne autour du barycentre de la zone (km). */
export const DEFAULT_PREVENTION_RADIUS_KM = 3;

/** Niveau de risque minimal pour qu'une zone soit eligible automatiquement. */
export const DEFAULT_PREVENTION_MIN_LEVEL: RiskLevel = 'ELEVE';

/** Nombre minimal d'alertes pour ne pas alerter une zone sur du bruit. */
export const DEFAULT_PREVENTION_MIN_ALERTS = 3;

/** Delai de carence entre deux campagnes sur la meme zone (jours). */
export const DEFAULT_PREVENTION_COOLDOWN_DAYS = 30;

export interface PreventionZone {
  /** Cle de maille geographique (`lat|lng`), stable dans le temps. */
  zoneKey: string;
  latitude: number;
  longitude: number;
  city?: string | null;
  /** Nombre d'alertes de la fenetre d'analyse. */
  alerts: number;
  /** Part d'alertes confirmees (0..1) si connue. */
  confirmedRatio?: number;
  score: number;
  level: RiskLevel;
}

/** Cle de maille geographique, arrondie a la precision demandee. */
export const zoneKeyFor = (
  latitude: number,
  longitude: number,
  precision = 0.0005,
): string => {
  const step = precision > 0 ? precision : 0.0005;
  const round = (value: number): number => {
    const steps = Math.round(Math.abs(value) / step);
    const rounded = (value < 0 ? -1 : 1) * steps * step;
    return Object.is(rounded, -0) ? 0 : rounded;
  };

  return `${round(latitude).toFixed(4)}|${round(longitude).toFixed(4)}`;
};

/** Niveau de vigilance annonce au client, deduit du niveau de risque. */
export const preventionLevelFor = (level: RiskLevel): PreventionLevel => {
  switch (level) {
    case 'CRITIQUE':
      return PreventionLevel.HIGH;
    case 'ELEVE':
      return PreventionLevel.WATCH;
    default:
      return PreventionLevel.ADVISORY;
  }
};

/** Libelle francais du niveau de vigilance (variables de SMS). */
export const PREVENTION_LEVEL_LABELS: Record<PreventionLevel, string> = {
  [PreventionLevel.ADVISORY]: 'information',
  [PreventionLevel.WATCH]: 'vigilance',
  [PreventionLevel.HIGH]: 'vigilance renforcee',
};

/** Conseil operationnel affiche dans la console selon le niveau. */
export const PREVENTION_LEVEL_ADVICE: Record<PreventionLevel, string> = {
  [PreventionLevel.ADVISORY]:
    'Rappel d entretien : verifiez les capteurs et la fermeture des ouvertures.',
  [PreventionLevel.WATCH]:
    'Informer les clients de la zone : controlez les capteurs, fermez les ouvertures et signalez toute anomalie.',
  [PreventionLevel.HIGH]:
    'Vigilance renforcee : tournee de controle des installations et information des clients de la zone.',
};

export interface ClientLocation {
  id: string;
  fullName: string;
  latitude: number | null;
  longitude: number | null;
  subscriptionActive: boolean;
  primaryPhone: string | null;
}

export interface PreventionTarget {
  clientId: string;
  fullName: string;
  distanceKm: number;
  phone: string | null;
}

export interface SelectAudienceOptions {
  centre: { latitude: number; longitude: number };
  radiusKm?: number;
  audience?: PreventionAudience;
  /** Clients a declenchements repetes (analyse predictive), si connu. */
  repeatClientIds?: string[];
  /** Exiger un abonnement actif (defaut : oui). */
  requireActiveSubscription?: boolean;
}

/**
 * Selection des destinataires d'une campagne.
 *
 * Un client est retenu s'il est geolocalise, dans le rayon demandé, joignable
 * par telephone et — par defaut — porteur d'un abonnement actif : on n'informe
 * pas un client dont le service est suspendu.
 */
export const selectPreventionAudience = (
  clients: ClientLocation[],
  options: SelectAudienceOptions,
): PreventionTarget[] => {
  const radiusKm = options.radiusKm ?? DEFAULT_PREVENTION_RADIUS_KM;
  const audience = options.audience ?? PreventionAudience.CLIENTS_IN_ZONE;
  const requireActive = options.requireActiveSubscription ?? true;
  const repeat = new Set(options.repeatClientIds ?? []);
  const radiusMeters = radiusKm * 1_000;

  const targets: PreventionTarget[] = [];
  for (const client of clients) {
    if (requireActive && !client.subscriptionActive) continue;
    if (
      audience === PreventionAudience.REPEAT_CLIENTS &&
      !repeat.has(client.id)
    ) {
      continue;
    }
    if (client.latitude === null || client.longitude === null) continue;

    const distanceMeters = haversineMeters(
      { latitude: options.centre.latitude, longitude: options.centre.longitude },
      { latitude: client.latitude, longitude: client.longitude },
    );
    if (distanceMeters > radiusMeters) continue;

    targets.push({
      clientId: client.id,
      fullName: client.fullName,
      distanceKm: Math.round((distanceMeters / 1_000) * 10) / 10,
      phone: client.primaryPhone,
    });
  }

  return targets.sort((a, b) => a.distanceKm - b.distanceKm);
};

export interface EligibilityResult {
  eligible: boolean;
  reason:
    | 'ELIGIBLE'
    | 'LEVEL_TOO_LOW'
    | 'VOLUME_TOO_LOW'
    | 'COOLDOWN_ACTIVE';
  /** Prochaine date autorisee lorsqu'un delai de carence est en cours. */
  nextEligibleAt?: Date;
}

/**
 * Une campagne automatique est-elle justifiee ?
 *
 * Trois verrous evitent de saturer les clients : le niveau de risque, le volume
 * d'alertes observe (une zone a une seule alerte n'est pas « a risque ») et le
 * delai de carence depuis la derniere campagne sur la meme maille.
 */
export const evaluatePreventionEligibility = (
  zone: PreventionZone,
  options: {
    minLevel?: RiskLevel;
    minAlerts?: number;
    cooldownDays?: number;
    lastCampaignAt?: Date | null;
    now?: Date;
  } = {},
): EligibilityResult => {
  const minLevel = options.minLevel ?? DEFAULT_PREVENTION_MIN_LEVEL;
  const minAlerts = options.minAlerts ?? DEFAULT_PREVENTION_MIN_ALERTS;
  const cooldownDays =
    options.cooldownDays ?? DEFAULT_PREVENTION_COOLDOWN_DAYS;
  const now = options.now ?? new Date();

  if (riskRank(zone.level) < riskRank(minLevel)) {
    return { eligible: false, reason: 'LEVEL_TOO_LOW' };
  }
  if (zone.alerts < minAlerts) {
    return { eligible: false, reason: 'VOLUME_TOO_LOW' };
  }
  if (options.lastCampaignAt) {
    const nextEligibleAt = new Date(options.lastCampaignAt.getTime());
    nextEligibleAt.setUTCDate(nextEligibleAt.getUTCDate() + cooldownDays);
    if (nextEligibleAt.getTime() > now.getTime()) {
      return { eligible: false, reason: 'COOLDOWN_ACTIVE', nextEligibleAt };
    }
  }
  return { eligible: true, reason: 'ELIGIBLE' };
};

const RISK_ORDER: RiskLevel[] = ['CALME', 'MODERE', 'ELEVE', 'CRITIQUE'];

const riskRank = (level: RiskLevel): number => RISK_ORDER.indexOf(level);

/** Statut final d'une campagne d'apres ses resultats d'envoi. */
export const campaignStatusFor = (
  sent: number,
  failed: number,
): PreventionCampaignStatus => {
  if (sent === 0 && failed === 0) return PreventionCampaignStatus.SENT;
  if (sent === 0) return PreventionCampaignStatus.FAILED;
  if (failed === 0) return PreventionCampaignStatus.SENT;
  return PreventionCampaignStatus.PARTIAL;
};

/** Message de synthese affiche dans la console apres diffusion. */
export const describeCampaignOutcome = (
  sent: number,
  failed: number,
  skipped: number,
): string => {
  const parts = [`${sent} message(s) transmis`];
  if (failed > 0) parts.push(`${failed} echec(s)`);
  if (skipped > 0) parts.push(`${skipped} destinataire(s) sans numero exploitable`);
  return parts.join(', ') + '.';
};

/** Variables de SMS d'une campagne de prevention. */
export const preventionTemplateVars = (
  zone: PreventionZone,
  options: { zoneLabel?: string | null } = {},
): {
  level: string;
  zone: string;
  alerts: number;
  advice: string;
} => {
  const level = preventionLevelFor(zone.level);
  return {
    level: PREVENTION_LEVEL_LABELS[level],
    zone: options.zoneLabel ?? zone.city ?? 'votre zone',
    alerts: zone.alerts,
    advice: PREVENTION_LEVEL_ADVICE[level],
  };
};

/** Zones a examiner automatiquement, de la plus risquee a la moins risquee. */
export const eligiblePreventionZones = (
  zones: PreventionZone[],
  lastCampaignByZone: Record<string, Date | null | undefined>,
  options: {
    minLevel?: RiskLevel;
    minAlerts?: number;
    cooldownDays?: number;
    limit?: number;
    now?: Date;
  } = {},
): { zone: PreventionZone; nextEligibleAt?: Date }[] => {
  const limit = options.limit ?? 5;
  return zones
    .slice()
    .sort((a, b) => b.score - a.score)
    .map((zone) => ({
      zone,
      verdict: evaluatePreventionEligibility(zone, {
        minLevel: options.minLevel,
        minAlerts: options.minAlerts,
        cooldownDays: options.cooldownDays,
        lastCampaignAt: lastCampaignByZone[zone.zoneKey] ?? null,
        now: options.now,
      }),
    }))
    .filter((entry) => entry.verdict.eligible)
    .slice(0, limit)
    .map((entry) => ({ zone: entry.zone }));
};
