import {
  HealthConsentScope,
  HealthConsentStatus,
  HealthMetric,
  HealthReadingStatus,
} from '@common/enums/health.enum';

/**
 * Regles metier pures de l'e-sante connectee.
 *
 * Aucune dependance a TypeORM ou Nest : les seuils cliniques, l'appreciation
 * d'une mesure, les tendances et le controle du consentement sont testables
 * directement et documentent la logique appliquee aux dossiers clients.
 */

/** Valeurs d'une mesure : tenseur systolique/diastolique ou valeur unique. */
export interface HealthReading {
  metric: HealthMetric;
  /** Valeur principale (mmHg systolique, bpm, %, mg/dL, degres, kg). */
  value: number;
  /** Valeur secondaire : diastolique pour la tension, taille (cm) pour le poids. */
  secondaryValue?: number | null;
  measuredAt: Date | string;
  status?: HealthReadingStatus;
}

export interface HealthVerdict {
  status: HealthReadingStatus;
  /** Appreciation courte, en francais, affichable telle quelle. */
  label: string;
  /** Explication / conseil delivre au client ou au personnel de sante. */
  advice: string;
}

export type BloodPressureBand =
  | 'HYPOTENSION'
  | 'OPTIMAL'
  | 'NORMAL'
  | 'HIGH_NORMAL'
  | 'HYPERTENSION_1'
  | 'HYPERTENSION_2'
  | 'HYPERTENSIVE_CRISIS';

export const BLOOD_PRESSURE_BANDS: Record<
  BloodPressureBand,
  { label: string; status: HealthReadingStatus; advice: string }
> = {
  HYPOTENSION: {
    label: 'Tension basse',
    status: HealthReadingStatus.WATCH,
    advice:
      'Hydratez-vous et évitez de vous lever brutalement. Signalez tout malaise au personnel de santé.',
  },
  OPTIMAL: {
    label: 'Tension optimale',
    status: HealthReadingStatus.NORMAL,
    advice: 'Continuez le suivi habituel.',
  },
  NORMAL: {
    label: 'Tension normale',
    status: HealthReadingStatus.NORMAL,
    advice: 'Continuez le suivi habituel.',
  },
  HIGH_NORMAL: {
    label: 'Tension normale haute',
    status: HealthReadingStatus.WATCH,
    advice:
      'Réduisez le sel, maintenez une activité physique régulière et recontrôlez la tension.',
  },
  HYPERTENSION_1: {
    label: 'Hypertension stade 1',
    status: HealthReadingStatus.WATCH,
    advice:
      'Surveillance rapprochée : recontrôlez la tension et signalez la valeur au personnel de santé.',
  },
  HYPERTENSION_2: {
    label: 'Hypertension stade 2',
    status: HealthReadingStatus.CRITICAL,
    advice:
      'Contact médical requis : alertez le personnel de santé et respectez le traitement prescrit.',
  },
  HYPERTENSIVE_CRISIS: {
    label: 'Poussée hypertensive',
    status: HealthReadingStatus.CRITICAL,
    advice:
      'Urgence médicale : ne restez pas seul, contactez immédiatement le personnel de santé.',
  },
};

/**
 * Classification de la tension arterielle (referentiel OMS / ESC).
 *
 * On retient toujours le stade le plus eleve entraine par la systolique ou la
 * diastolique : 150/95 est une hypertension stade 2 meme si la diastolique
 * seule resterait en stade 1.
 */
export const classifyBloodPressure = (
  systolic: number,
  diastolic: number,
): BloodPressureBand => {
  if (systolic >= 180 || diastolic >= 110) return 'HYPERTENSIVE_CRISIS';
  if (systolic >= 160 || diastolic >= 100) return 'HYPERTENSION_2';
  if (systolic >= 140 || diastolic >= 90) return 'HYPERTENSION_1';
  if (systolic >= 130 || diastolic >= 85) return 'HIGH_NORMAL';
  if (systolic >= 120) return 'NORMAL';
  if (systolic >= 90 && diastolic >= 60) return 'OPTIMAL';
  if (systolic < 90 || diastolic < 60) return 'HYPOTENSION';
  return 'OPTIMAL';
};

/** Classement OMS de la glycemie capillaire (mg/dL). */
export const classifyGlucose = (
  value: number,
  context: { fasting?: boolean } = {},
): HealthVerdict => {
  const fasting = context.fasting ?? true;

  if (fasting) {
    if (value < 54) {
      return {
        status: HealthReadingStatus.CRITICAL,
        label: 'Hypoglycémie sévère',
        advice:
          'Prenez immédiatement du sucre rapide et alertez le personnel de santé.',
      };
    }
    if (value < 70) {
      return {
        status: HealthReadingStatus.WATCH,
        label: 'Hypoglycémie',
        advice:
          'Prenez 15 g de sucre rapide puis recontrôlez la glycémie dans 15 minutes.',
      };
    }
    if (value <= 99) {
      return {
        status: HealthReadingStatus.NORMAL,
        label: 'Glycémie à jeun normale',
        advice: 'Poursuivez la surveillance habituelle.',
      };
    }
    if (value <= 125) {
      return {
        status: HealthReadingStatus.WATCH,
        label: 'Prédiabète',
        advice:
          'Activité physique, alimentation pauvre en sucres rapides et contrôle à jeun rapproché.',
      };
    }
    if (value < 250) {
      return {
        status: HealthReadingStatus.CRITICAL,
        label: 'Hyperglycémie à jeun',
        advice:
          'Contact médical requis : signalez la valeur et les symptômes au personnel de santé.',
      };
    }
    return {
      status: HealthReadingStatus.CRITICAL,
      label: 'Hyperglycémie majeure',
      advice:
        'Urgence : risque de décompensation, contactez immédiatement le personnel de santé.',
    };
  }

  if (value < 54) {
    return {
      status: HealthReadingStatus.CRITICAL,
      label: 'Hypoglycémie sévère',
      advice: 'Prenez du sucre rapide et alertez le personnel de santé.',
    };
  }
  if (value < 70) {
    return {
      status: HealthReadingStatus.WATCH,
      label: 'Hypoglycémie',
      advice: 'Prenez 15 g de sucre rapide, puis recontrôlez la glycémie.',
    };
  }
  if (value < 140) {
    return {
      status: HealthReadingStatus.NORMAL,
      label: 'Glycémie normale',
      advice: 'Poursuivez la surveillance habituelle.',
    };
  }
  if (value < 200) {
    return {
      status: HealthReadingStatus.WATCH,
      label: 'Glycémie élevée',
      advice: 'Recontrôlez la glycémie et limitez les sucres rapides.',
    };
  }
  return {
    status: HealthReadingStatus.CRITICAL,
    label: 'Hyperglycémie',
    advice:
      'Contact médical requis : signalez la valeur et les symptômes au personnel de santé.',
  };
};

/** Appreciation de la frequence cardiaque de repos. */
export const classifyHeartRate = (bpm: number): HealthVerdict => {
  if (bpm < 40) {
    return {
      status: HealthReadingStatus.CRITICAL,
      label: 'Bradycardie sévère',
      advice: 'Urgence : contactez immédiatement le personnel de santé.',
    };
  }
  if (bpm < 50) {
    return {
      status: HealthReadingStatus.WATCH,
      label: 'Bradycardie',
      advice:
        'Signalez tout vertige ou malaise ; un contrôle médical est conseillé.',
    };
  }
  if (bpm <= 100) {
    return {
      status: HealthReadingStatus.NORMAL,
      label: 'Fréquence cardiaque normale',
      advice: 'Aucune action particulière.',
    };
  }
  if (bpm <= 120) {
    return {
      status: HealthReadingStatus.WATCH,
      label: 'Tachycardie',
      advice: 'Reposez-vous 5 minutes et refaites la mesure.',
    };
  }
  return {
    status: HealthReadingStatus.CRITICAL,
    label: 'Tachycardie sévère',
    advice: 'Urgence : alertez le personnel de santé sans attendre.',
  };
};

/** Appreciation de la saturation en oxygene. */
export const classifySpo2 = (spo2: number): HealthVerdict => {
  if (spo2 >= 95) {
    return {
      status: HealthReadingStatus.NORMAL,
      label: 'Saturation normale',
      advice: 'Aucune action particulière.',
    };
  }
  if (spo2 >= 90) {
    return {
      status: HealthReadingStatus.WATCH,
      label: 'Saturation basse',
      advice:
        'Respirez calmement, refaites la mesure et signalez toute gêne respiratoire.',
    };
  }
  return {
    status: HealthReadingStatus.CRITICAL,
    label: 'Hypoxie',
    advice:
      'Urgence respiratoire : alertez immédiatement le personnel de santé.',
  };
};

/** Appreciation de la temperature corporelle (degres Celsius). */
export const classifyTemperature = (celsius: number): HealthVerdict => {
  if (celsius < 35) {
    return {
      status: HealthReadingStatus.CRITICAL,
      label: 'Hypothermie',
      advice: 'Réchauffez la personne et contactez le personnel de santé.',
    };
  }
  if (celsius < 36) {
    return {
      status: HealthReadingStatus.WATCH,
      label: 'Température basse',
      advice: 'Couvrez la personne et recontrôlez la température.',
    };
  }
  if (celsius <= 37.5) {
    return {
      status: HealthReadingStatus.NORMAL,
      label: 'Température normale',
      advice: 'Aucune action particulière.',
    };
  }
  if (celsius <= 39) {
    return {
      status: HealthReadingStatus.WATCH,
      label: 'Fièvre',
      advice:
        'Hydratez-vous, surveillez la température et signalez tout signe associé.',
    };
  }
  return {
    status: HealthReadingStatus.CRITICAL,
    label: 'Fièvre élevée',
    advice: 'Contact médical requis : consultez sans attendre.',
  };
};

/** Indice de masse corporelle a partir d'un poids et d'une taille en cm. */
export const computeBmi = (
  weightKg: number,
  heightCm: number,
): number | null => {
  if (!heightCm || heightCm <= 0) return null;
  const meters = heightCm / 100;
  return round1(weightKg / (meters * meters));
};

/** Appreciation du poids via l'IMC (taille requise). */
export const classifyWeight = (
  weightKg: number,
  heightCm?: number | null,
): HealthVerdict => {
  const bmi = heightCm ? computeBmi(weightKg, heightCm) : null;
  if (bmi === null) {
    return {
      status: HealthReadingStatus.NORMAL,
      label: 'Poids enregistré',
      advice: "Renseignez la taille pour obtenir l'interprétation de l'IMC.",
    };
  }
  if (bmi < 16) {
    return {
      status: HealthReadingStatus.CRITICAL,
      label: `Insuffisance pondérale sévère (IMC ${bmi})`,
      advice: 'Contact médical requis : risque de dénutrition.',
    };
  }
  if (bmi < 18.5) {
    return {
      status: HealthReadingStatus.WATCH,
      label: `Insuffisance pondérale (IMC ${bmi})`,
      advice: 'Renforcez les apports nutritionnels et surveillez le poids.',
    };
  }
  if (bmi < 25) {
    return {
      status: HealthReadingStatus.NORMAL,
      label: `Corpulence normale (IMC ${bmi})`,
      advice: 'Aucune action particulière.',
    };
  }
  if (bmi < 30) {
    return {
      status: HealthReadingStatus.WATCH,
      label: `Surpoids (IMC ${bmi})`,
      advice: 'Activité physique régulière et alimentation équilibrée.',
    };
  }
  if (bmi < 35) {
    return {
      status: HealthReadingStatus.WATCH,
      label: `Obésité modérée (IMC ${bmi})`,
      advice: 'Un accompagnement médical est recommandé.',
    };
  }
  return {
    status: HealthReadingStatus.CRITICAL,
    label: `Obésité sévère (IMC ${bmi})`,
    advice:
      'Contact médical requis : suivi nutritionnel et recherche de complications.',
  };
};

const withBand = (
  band: BloodPressureBand,
  systolic: number,
  diastolic: number,
): HealthVerdict => {
  const { label, status, advice } = BLOOD_PRESSURE_BANDS[band];
  return { status, label: `${label} (${systolic}/${diastolic} mmHg)`, advice };
};

/**
 * Appreciation d'une mesure, quelle que soit la grandeur.
 *
 * La tension attend la diastolique dans `secondaryValue` ; le poids accepte la
 * taille (cm) pour l'IMC ; la glycemie accepte une precision « a jeun » via
 * `context.fasting`.
 */
export const classifyReading = (
  metric: HealthMetric,
  value: number,
  secondaryValue?: number | null,
  context: { fasting?: boolean } = {},
): HealthVerdict => {
  switch (metric) {
    case HealthMetric.BLOOD_PRESSURE: {
      const diastolic = secondaryValue ?? 0;
      return withBand(
        classifyBloodPressure(value, diastolic),
        value,
        diastolic,
      );
    }
    case HealthMetric.HEART_RATE:
      return classifyHeartRate(value);
    case HealthMetric.SPO2:
      return classifySpo2(value);
    case HealthMetric.BLOOD_GLUCOSE:
      return classifyGlucose(value, context);
    case HealthMetric.TEMPERATURE:
      return classifyTemperature(value);
    case HealthMetric.WEIGHT:
      return classifyWeight(value, secondaryValue ?? null);
    default:
      return {
        status: HealthReadingStatus.NORMAL,
        label: 'Mesure enregistrée',
        advice: 'Aucune règle automatique pour cette grandeur.',
      };
  }
};

export const isCriticalReading = (reading: HealthReading): boolean =>
  classifyReading(
    reading.metric,
    reading.value,
    reading.secondaryValue,
  ).status === HealthReadingStatus.CRITICAL;

/** Mesures critiques a remonter en alerte medicale. */
export const criticalReadings = (
  readings: HealthReading[],
): HealthReading[] => readings.filter(isCriticalReading);

/** Sens d'evolution d'une serie de mesures. */
export type HealthTrend = 'IMPROVING' | 'WORSENING' | 'STABLE' | 'INSUFFICIENT';

/**
 * Tendance d'une serie triee du plus ancien au plus recent.
 *
 * L'evolution est jugee sur la gravite (`NORMAL` < `WATCH` < `CRITICAL`) et non
 * sur la valeur brute, car le sens « favorable » depend de la grandeur suivie.
 */
export const detectTrend = (readings: HealthReading[]): HealthTrend => {
  if (readings.length < 2) return 'INSUFFICIENT';
  const rank = (reading: HealthReading): number => {
    const status = classifyReading(
      reading.metric,
      reading.value,
      reading.secondaryValue,
    ).status;
    if (status === HealthReadingStatus.CRITICAL) return 2;
    if (status === HealthReadingStatus.WATCH) return 1;
    return 0;
  };
  const ordered = [...readings].sort(
    (a, b) => new Date(a.measuredAt).getTime() - new Date(b.measuredAt).getTime(),
  );
  const first = rank(ordered[0]);
  const last = rank(ordered[ordered.length - 1]);
  if (last < first) return 'IMPROVING';
  if (last > first) return 'WORSENING';
  return 'STABLE';
};

export interface VitalSummary {
  metric: HealthMetric;
  value: number;
  secondaryValue: number | null;
  unit: string;
  measuredAt: string;
  status: HealthReadingStatus;
  label: string;
  advice: string;
  trend: HealthTrend;
  /** Nombre de mesures disponibles pour cette grandeur. */
  sampleCount: number;
}

export const HEALTH_METRIC_UNITS: Record<HealthMetric, string> = {
  [HealthMetric.BLOOD_PRESSURE]: 'mmHg',
  [HealthMetric.HEART_RATE]: 'bpm',
  [HealthMetric.SPO2]: '%',
  [HealthMetric.BLOOD_GLUCOSE]: 'mg/dL',
  [HealthMetric.TEMPERATURE]: '°C',
  [HealthMetric.WEIGHT]: 'kg',
};

/** Libelles affiches en console. */
export const HEALTH_METRIC_LABELS: Record<HealthMetric, string> = {
  [HealthMetric.BLOOD_PRESSURE]: 'Tension artérielle',
  [HealthMetric.HEART_RATE]: 'Fréquence cardiaque',
  [HealthMetric.SPO2]: 'Saturation O₂',
  [HealthMetric.BLOOD_GLUCOSE]: 'Glycémie',
  [HealthMetric.TEMPERATURE]: 'Température',
  [HealthMetric.WEIGHT]: 'Poids / IMC',
};

/**
 * Derniere valeur connue de chaque grandeur, avec appreciation et tendance.
 *
 * Sert de resume de dossier : une ligne par grandeur mesuree, la plus recente
 * gagnant, triee selon l'ordre clinique d'usage.
 */
export const summarizeVitals = (readings: HealthReading[]): VitalSummary[] => {
  const byMetric = new Map<HealthMetric, HealthReading[]>();
  for (const reading of readings) {
    const bucket = byMetric.get(reading.metric) ?? [];
    bucket.push(reading);
    byMetric.set(reading.metric, bucket);
  }

  const summaries: VitalSummary[] = [];
  for (const [metric, bucket] of byMetric) {
    const ordered = [...bucket].sort(
      (a, b) =>
        new Date(a.measuredAt).getTime() - new Date(b.measuredAt).getTime(),
    );
    const latest = ordered[ordered.length - 1];
    const verdict = classifyReading(
      metric,
      latest.value,
      latest.secondaryValue,
    );
    summaries.push({
      metric,
      value: latest.value,
      secondaryValue: latest.secondaryValue ?? null,
      unit: HEALTH_METRIC_UNITS[metric],
      measuredAt: new Date(latest.measuredAt).toISOString(),
      status: verdict.status,
      label: verdict.label,
      advice: verdict.advice,
      trend: detectTrend(ordered),
      sampleCount: ordered.length,
    });
  }

  const order = Object.values(HealthMetric) as HealthMetric[];
  return summaries.sort(
    (a, b) => order.indexOf(a.metric) - order.indexOf(b.metric),
  );
};

/** Compte des mesures par statut (indicateurs de sante). */
export const countByStatus = (
  readings: HealthReading[],
): Record<HealthReadingStatus, number> => {
  const counts: Record<HealthReadingStatus, number> = {
    [HealthReadingStatus.NORMAL]: 0,
    [HealthReadingStatus.WATCH]: 0,
    [HealthReadingStatus.CRITICAL]: 0,
  };
  for (const reading of readings) {
    counts[
      classifyReading(reading.metric, reading.value, reading.secondaryValue)
        .status
    ] += 1;
  }
  return counts;
};

export interface ConsentLike {
  scope: HealthConsentScope;
  status: HealthConsentStatus;
  grantedAt?: Date | string | null;
  revokedAt?: Date | string | null;
  expiresAt?: Date | string | null;
}

/**
 * Consentement effectif pour une finalite donnee.
 *
 * Un consentement est valide s'il est `GRANTED`, non revoque et non expire a la
 * date demandee ; le dernier consentement en date fait foi.
 */
export const hasConsent = (
  consents: ConsentLike[],
  scope: HealthConsentScope,
  at: Date = new Date(),
): boolean => {
  const candidates = consents
    .filter((consent) => consent.scope === scope)
    .sort(
      (a, b) =>
        new Date(a.grantedAt ?? 0).getTime() -
        new Date(b.grantedAt ?? 0).getTime(),
    );
  const consent = candidates[candidates.length - 1];
  if (!consent) return false;
  if (consent.status !== HealthConsentStatus.GRANTED) return false;
  if (consent.revokedAt) return false;
  if (consent.expiresAt && new Date(consent.expiresAt).getTime() <= at.getTime()) {
    return false;
  }
  return true;
};

/** Consentement arrive a echeance et qui doit etre bascule en `EXPIRED`. */
export const isConsentExpired = (
  consent: ConsentLike,
  at: Date = new Date(),
): boolean =>
  consent.status === HealthConsentStatus.GRANTED &&
  !!consent.expiresAt &&
  new Date(consent.expiresAt).getTime() <= at.getTime();

/**
 * Motif d'acces accorde (tracabilite) ou refus oppose.
 *
 * Le refus est explicite afin d'enregistrer une raison normee dans le journal
 * d'acces aux donnees de sante.
 */
export interface ConsentDecision {
  allowed: boolean;
  reason:
    | 'CONSENT_GRANTED'
    | 'NO_CONSENT'
    | 'CONSENT_REVOKED'
    | 'CONSENT_EXPIRED'
    | 'EMERGENCY_BYPASS';
}

export const evaluateConsent = (
  consents: ConsentLike[],
  scope: HealthConsentScope,
  options: { emergency?: boolean; at?: Date } = {},
): ConsentDecision => {
  const at = options.at ?? new Date();
  if (hasConsent(consents, scope, at)) {
    return { allowed: true, reason: 'CONSENT_GRANTED' };
  }
  if (options.emergency) {
    return { allowed: true, reason: 'EMERGENCY_BYPASS' };
  }
  const policies = consents
    .filter((consent) => consent.scope === scope)
    .sort(
      (a, b) =>
        new Date(a.grantedAt ?? 0).getTime() -
        new Date(b.grantedAt ?? 0).getTime(),
    );
  const latest = policies[policies.length - 1];
  if (!latest) return { allowed: false, reason: 'NO_CONSENT' };
  if (isConsentExpired(latest, at)) {
    return { allowed: false, reason: 'CONSENT_EXPIRED' };
  }
  if (latest.revokedAt || latest.status === HealthConsentStatus.REVOKED) {
    return { allowed: false, reason: 'CONSENT_REVOKED' };
  }
  return { allowed: false, reason: 'NO_CONSENT' };
};

/** Duree de conservation d'un consentement sans limite explicite (mois). */
export const DEFAULT_CONSENT_MONTHS = 24;

/** Date d'echeance par defaut d'un consentement. */
export const defaultConsentExpiry = (
  grantedAt: Date = new Date(),
  months = DEFAULT_CONSENT_MONTHS,
): Date => {
  const expires = new Date(grantedAt.getTime());
  expires.setMonth(expires.getMonth() + months);
  return expires;
};

/** Reference lisible d'une demande de soin : `NS-AAAAMMJJ-NNNN`. */
export const buildNurseRequestReference = (
  date: Date,
  sequence: number,
): string => {
  const yyyy = date.getUTCFullYear();
  const mm = `${date.getUTCMonth() + 1}`.padStart(2, '0');
  const dd = `${date.getUTCDate()}`.padStart(2, '0');
  return `NS-${yyyy}${mm}${dd}-${`${sequence}`.padStart(4, '0')}`;
};

/** Delai de prise en charge attendu selon la priorite (minutes). */
export const NURSE_RESPONSE_TARGET_MINUTES = {
  ROUTINE: 240,
  URGENT: 60,
  EMERGENCY: 10,
} as const;

/** Echeance de prise en charge d'une demande de soin. */
export const nurseResponseDueAt = (
  createdAt: Date,
  priority: keyof typeof NURSE_RESPONSE_TARGET_MINUTES,
): Date =>
  new Date(
    createdAt.getTime() + NURSE_RESPONSE_TARGET_MINUTES[priority] * 60 * 1000,
  );

/** Demande de soin en retard de prise en charge compte tenu de sa priorite. */
export const isNurseRequestLate = (
  request: { createdAt: Date | string; priority: keyof typeof NURSE_RESPONSE_TARGET_MINUTES },
  acceptedAt: Date | string | null | undefined,
  now: Date = new Date(),
): boolean => {
  const created = new Date(request.createdAt);
  const dueAt = nurseResponseDueAt(created, request.priority);
  if (acceptedAt) return new Date(acceptedAt).getTime() > dueAt.getTime();
  return now.getTime() > dueAt.getTime();
};

/** Priorite suggeree a partir de la gravite des dernieres mesures. */
export const suggestPriority = (
  readings: HealthReading[],
): keyof typeof NURSE_RESPONSE_TARGET_MINUTES => {
  const statuses = readings.map(
    (reading) =>
      classifyReading(reading.metric, reading.value, reading.secondaryValue)
        .status,
  );
  if (statuses.includes(HealthReadingStatus.CRITICAL)) return 'EMERGENCY';
  if (statuses.includes(HealthReadingStatus.WATCH)) return 'URGENT';
  return 'ROUTINE';
};

const round1 = (value: number): number => Math.round(value * 10) / 10;
