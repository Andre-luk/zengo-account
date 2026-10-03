import { SubscriptionStatus } from '@common/enums/client.enum';
import { SubscriptionDuration } from '@common/enums/subscription.enum';

/**
 * Regles metier pures des abonnements.
 *
 * Aucune dependance a TypeORM ou Nest : le calcul de validite, la generation de
 * code et la politique de restriction sont testables directement et decrivent
 * exactement ce que le client constate.
 */

/** Duree commerciale correspondant au nombre de jours saisi. */
export const SUBSCRIPTION_DAYS = [30, 90, 180] as const;

export const isSupportedDuration = (durationDays: number): boolean =>
  (SUBSCRIPTION_DAYS as readonly number[]).includes(durationDays);

/** Remise appliquee aux durees longues (le 180 jours est le plus avantageux). */
export const DURATION_DISCOUNT: Record<number, number> = {
  [SubscriptionDuration.DAYS_30]: 0,
  [SubscriptionDuration.DAYS_90]: 0.05,
  [SubscriptionDuration.DAYS_180]: 0.1,
};

/** Nombre de mois factures pour une duree (30 jours = 1 mois). */
export const monthsForDuration = (durationDays: number): number =>
  Math.round((durationDays / 30) * 100) / 100;

export interface SubscriptionTariff {
  /** Mensualite de reference, en dollars. */
  monthlyFeeUsd: number;
  /** Frais d'installation, uniquement a la premiere souscription. */
  registrationFeeUsd?: number;
  /** Mensualite specifique negociee pour ce client, prioritaire. */
  customMonthlyFeeUsd?: number | null;
}

export interface SubscriptionPrice {
  amountUsd: number;
  discountUsd: number;
  months: number;
  monthlyFeeUsd: number;
  registrationFeeUsd: number;
}

/**
 * Prix d'un abonnement.
 *
 * On facture la mensualite du groupe tarifaire multipliee par la duree en mois,
 * avec une remise pour les engagements longs ; les frais d'installation ne
 * s'appliquent qu'a la premiere souscription (`includeRegistrationFee`).
 */
export const computeSubscriptionPrice = (
  tariff: SubscriptionTariff,
  durationDays: number,
  options: { includeRegistrationFee?: boolean } = {},
): SubscriptionPrice => {
  const monthlyFeeUsd = round2(tariff.customMonthlyFeeUsd ?? tariff.monthlyFeeUsd);
  const months = monthsForDuration(durationDays);
  const gross = round2(monthlyFeeUsd * months);
  const discount = round2(gross * (DURATION_DISCOUNT[durationDays] ?? 0));
  const registrationFeeUsd = options.includeRegistrationFee
    ? round2(tariff.registrationFeeUsd ?? 0)
    : 0;

  return {
    amountUsd: round2(gross - discount + registrationFeeUsd),
    discountUsd: discount,
    months,
    monthlyFeeUsd,
    registrationFeeUsd,
  };
};

/** Conversion en francs congolais, au taux du jour. */
export const toCdf = (amountUsd: number, exchangeRateUsdToCdf: number): number =>
  Math.round(amountUsd * exchangeRateUsdToCdf * 100) / 100;

// ---------------------------------------------------------------------------
// Codes d'abonnement
// ---------------------------------------------------------------------------

/**
 * Alphabet sans caracteres ambigus : un code lu au telephone ne doit pas
 * confondre `0` et `O`, ni `1` et `I`.
 */
const CODE_ALPHABET = 'ACDEFGHJKLMNPQRSTUVWXYZ23456789';

export const SUBSCRIPTION_CODE_PREFIX = 'ZG';

/** Reference `ZG-XXXX-XXXX` : lisible, dictee sans ambiguite au telephone. */
export const buildSubscriptionCode = (random: () => number = Math.random): string => {
  const pick = (): string => {
    const index = Math.floor(random() * CODE_ALPHABET.length) % CODE_ALPHABET.length;
    return CODE_ALPHABET[index];
  };
  const block = (): string => Array.from({ length: 4 }, pick).join('');
  return `${SUBSCRIPTION_CODE_PREFIX}-${block()}-${block()}`;
};

/** Normalise une saisie client : espaces, minuscules, tirets manquants. */
export const normalizeSubscriptionCode = (raw: string): string => {
  const cleaned = raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/^ZG/, '');
  if (cleaned.length !== 8) return raw.trim().toUpperCase();
  return `${SUBSCRIPTION_CODE_PREFIX}-${cleaned.slice(0, 4)}-${cleaned.slice(4)}`;
};

export const isValidSubscriptionCodeFormat = (raw: string): boolean =>
  /^ZG-[ACDEFGHJKLMNPQRSTUVWXYZ23456789]{4}-[ACDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/.test(
    normalizeSubscriptionCode(raw),
  );

// ---------------------------------------------------------------------------
// Validite
// ---------------------------------------------------------------------------

export interface ValidityWindow {
  startsAt: Date;
  endsAt: Date;
}

/**
 * Fenetre de validite d'un nouvel abonnement.
 *
 * Un renouvellement anticipe ne fait pas perdre au client les jours qu'il lui
 * reste : la nouvelle periode demarre a la fin de la precedente. Un abonnement
 * deja expire repart de la date du paiement.
 */
export const computeValidityWindow = (
  durationDays: number,
  options: { paidAt?: Date; currentEndsAt?: Date | null } = {},
): ValidityWindow => {
  const paidAt = options.paidAt ?? new Date();
  const currentEndsAt = options.currentEndsAt ?? null;
  const startsAt = currentEndsAt && currentEndsAt > paidAt ? currentEndsAt : paidAt;

  return { startsAt, endsAt: addDays(startsAt, durationDays) };
};

export const addDays = (date: Date, days: number): Date => {
  const result = new Date(date.getTime());
  result.setDate(result.getDate() + days);
  return result;
};

/**
 * Etat reel d'un abonnement, recalcule a la lecture.
 *
 * Le statut stocke peut etre en retard sur la realite (le watchdog tourne
 * toutes les 15 minutes) : la console et l'application mobile lisent donc cet
 * etat derive, jamais le champ brut.
 */
export const deriveSubscriptionStatus = (
  input: { status: SubscriptionStatus; startsAt?: Date | null; endsAt?: Date | null },
  now: Date = new Date(),
): SubscriptionStatus => {
  if (input.status === SubscriptionStatus.SUSPENDED) return SubscriptionStatus.SUSPENDED;
  if (!input.endsAt) return input.status === SubscriptionStatus.ACTIVE ? SubscriptionStatus.ACTIVE : input.status;
  if (input.endsAt <= now) return SubscriptionStatus.EXPIRED;
  if (input.startsAt && input.startsAt > now) return SubscriptionStatus.PENDING;
  return SubscriptionStatus.ACTIVE;
};

/** Jours restants, arrondis au jour superieur (0 si expire). */
export const daysRemaining = (endsAt: Date | null | undefined, now: Date = new Date()): number => {
  if (!endsAt) return 0;
  const milliseconds = endsAt.getTime() - now.getTime();
  return milliseconds <= 0 ? 0 : Math.ceil(milliseconds / 86_400_000);
};

/** L'abonnement arrive a echeance : le client doit etre relance. */
export const isExpiringSoon = (
  endsAt: Date | null | undefined,
  now: Date = new Date(),
  thresholdDays = 7,
): boolean => {
  const remaining = daysRemaining(endsAt, now);
  return remaining > 0 && remaining <= thresholdDays;
};

/** Politique de restriction : l'abonnement au sens du cahier des charges. */
export const shouldRestrictAccess = (
  status: SubscriptionStatus,
  endsAt: Date | null | undefined,
  now: Date = new Date(),
): boolean => {
  if (status === SubscriptionStatus.SUSPENDED) return true;
  if (!endsAt) return status !== SubscriptionStatus.ACTIVE;
  return endsAt <= now;
};

/** Periode de courtoisie offerte apres l'echeance avant durcissement. */
export const GRACE_PERIOD_DAYS = 0;

export const describeValidity = (endsAt: Date | null | undefined, now: Date = new Date()): string => {
  const remaining = daysRemaining(endsAt, now);
  if (!endsAt) return 'sans abonnement';
  if (remaining === 0) return 'abonnement expire';
  return `${remaining} jour(s) restant(s)`;
};

const round2 = (value: number): number => Math.round(value * 100) / 100;
