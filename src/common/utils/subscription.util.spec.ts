import { SubscriptionStatus } from '@common/enums/client.enum';
import { SubscriptionDuration } from '@common/enums/subscription.enum';
import {
  buildSubscriptionCode,
  computeSubscriptionPrice,
  computeValidityWindow,
  daysRemaining,
  deriveSubscriptionStatus,
  isExpiringSoon,
  isSupportedDuration,
  isValidSubscriptionCodeFormat,
  monthsForDuration,
  normalizeSubscriptionCode,
  shouldRestrictAccess,
  toCdf,
} from '@common/utils/subscription.util';

/** Générateur déterministe : les codes doivent être reproductibles en test. */
const sequence = (values: number[]) => {
  let index = 0;
  return () => values[index++ % values.length];
};

/**
 * Les periodes sont calendaires (meme heure locale, meme quantieme) : on
 * compare donc l'heure locale et non l'instant UTC, sinon le test dependrait du
 * fuseau du serveur et de ses changements d'heure.
 */
const localDay = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

describe('Abonnements : regles metier', () => {
  describe('Codes', () => {
    it('genere un code au format ZG-XXXX-XXXX', () => {
      const code = buildSubscriptionCode(sequence([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]));
      expect(code).toMatch(/^ZG-[ACDEFGHJKLMNPQRSTUVWXYZ23456789]{4}-[ACDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/);
    });

    it('n utilise jamais de caracteres ambigus', () => {
      for (let index = 0; index < 200; index += 1) {
        const code = buildSubscriptionCode();
        expect(code.slice(3)).not.toMatch(/[0O1IB]/);
      }
    });

    it('normalise une saisie au telephone (minuscules, espaces, sans tirets)', () => {
      expect(normalizeSubscriptionCode('zgk4pm7rtq')).toBe('ZG-K4PM-7RTQ');
      expect(normalizeSubscriptionCode(' ZG K4PM 7RTQ ')).toBe('ZG-K4PM-7RTQ');
      expect(normalizeSubscriptionCode('ZG-K4PM-7RTQ')).toBe('ZG-K4PM-7RTQ');
    });

    it('valide le format apres normalisation', () => {
      expect(isValidSubscriptionCodeFormat('ZG-K4PM-7RTQ')).toBe(true);
      expect(isValidSubscriptionCodeFormat('k4pm7rtq')).toBe(true);
      expect(isValidSubscriptionCodeFormat('ZG-K4PM')).toBe(false);
      expect(isValidSubscriptionCodeFormat('ZG-0000-1111')).toBe(false);
    });
  });

  describe('Prix', () => {
    const tariff = { monthlyFeeUsd: 20, registrationFeeUsd: 150 };

    it('facture la mensualite multipliee par la duree', () => {
      const price = computeSubscriptionPrice(tariff, SubscriptionDuration.DAYS_30);
      expect(price.amountUsd).toBe(20);
      expect(price.months).toBe(1);
      expect(price.discountUsd).toBe(0);
    });

    it('applique la remise des engagements longs', () => {
      expect(computeSubscriptionPrice(tariff, SubscriptionDuration.DAYS_90).amountUsd).toBe(57);
      expect(computeSubscriptionPrice(tariff, SubscriptionDuration.DAYS_180).amountUsd).toBe(108);
    });

    it('ajoute les frais d installation au premier abonnement seulement', () => {
      expect(computeSubscriptionPrice(tariff, SubscriptionDuration.DAYS_30, { includeRegistrationFee: true }).amountUsd).toBe(170);
      expect(computeSubscriptionPrice(tariff, SubscriptionDuration.DAYS_30).registrationFeeUsd).toBe(0);
    });

    it('arrondit les montants au centime', () => {
      const price = computeSubscriptionPrice({ monthlyFeeUsd: 19.999 }, SubscriptionDuration.DAYS_30);
      expect(price.amountUsd).toBe(20);
    });

    it('convertit en francs congolais au taux du jour', () => {
      expect(toCdf(20, 2800)).toBe(56_000);
      expect(toCdf(57.5, 2750.5)).toBe(158_153.75);
    });

    it('compte les mois des durees commerciales', () => {
      expect(monthsForDuration(30)).toBe(1);
      expect(monthsForDuration(90)).toBe(3);
      expect(monthsForDuration(180)).toBe(6);
    });
  });

  describe('Validite', () => {
    const paidAt = new Date('2026-10-03T10:00:00Z');

    it('ouvre une periode de la duree demandee', () => {
      const window = computeValidityWindow(SubscriptionDuration.DAYS_30, { paidAt });
      expect(localDay(window.startsAt)).toBe(localDay(paidAt));
      expect(localDay(window.endsAt).slice(-5)).toBe(localDay(paidAt).slice(-5));
      expect(Math.round((window.endsAt.getTime() - window.startsAt.getTime()) / 86_400_000)).toBe(30);
    });

    it('ne fait pas perdre les jours restants lors d un renouvellement anticipe', () => {
      const currentEndsAt = new Date('2026-10-20T10:00:00Z');
      const window = computeValidityWindow(SubscriptionDuration.DAYS_30, { paidAt, currentEndsAt });
      expect(localDay(window.startsAt)).toBe(localDay(currentEndsAt));
      expect(Math.round((window.endsAt.getTime() - window.startsAt.getTime()) / 86_400_000)).toBe(30);
    });

    it('repart de la date du paiement si l abonnement est deja expire', () => {
      const window = computeValidityWindow(SubscriptionDuration.DAYS_90, {
        paidAt,
        currentEndsAt: new Date('2026-09-01T10:00:00Z'),
      });
      expect(localDay(window.startsAt)).toBe(localDay(paidAt));
      expect(Math.round((window.endsAt.getTime() - window.startsAt.getTime()) / 86_400_000)).toBe(90);
    });

    it('ne commercialise que 30, 90 et 180 jours', () => {
      expect(isSupportedDuration(30)).toBe(true);
      expect(isSupportedDuration(180)).toBe(true);
      expect(isSupportedDuration(45)).toBe(false);
    });
  });

  describe('Etat et restriction', () => {
    const now = new Date('2026-10-03T10:00:00Z');

    it('derive l etat reel a la lecture', () => {
      expect(
        deriveSubscriptionStatus(
          {
            status: SubscriptionStatus.ACTIVE,
            startsAt: new Date('2026-09-01T00:00:00Z'),
            endsAt: new Date('2026-10-01T00:00:00Z'),
          },
          now,
        ),
      ).toBe(SubscriptionStatus.EXPIRED);

      expect(
        deriveSubscriptionStatus(
          {
            status: SubscriptionStatus.ACTIVE,
            startsAt: new Date('2026-10-10T00:00:00Z'),
            endsAt: new Date('2026-11-10T00:00:00Z'),
          },
          now,
        ),
      ).toBe(SubscriptionStatus.PENDING);

      expect(
        deriveSubscriptionStatus(
          {
            status: SubscriptionStatus.ACTIVE,
            startsAt: new Date('2026-09-01T00:00:00Z'),
            endsAt: new Date('2026-12-01T00:00:00Z'),
          },
          now,
        ),
      ).toBe(SubscriptionStatus.ACTIVE);
    });

    it('respecte une suspension manuelle', () => {
      expect(
        deriveSubscriptionStatus(
          { status: SubscriptionStatus.SUSPENDED, endsAt: new Date('2027-01-01T00:00:00Z') },
          now,
        ),
      ).toBe(SubscriptionStatus.SUSPENDED);
    });

    it('compte les jours restants, arrondis au jour superieur', () => {
      expect(daysRemaining(new Date('2026-10-03T18:00:00Z'), now)).toBe(1);
      expect(daysRemaining(new Date('2026-10-02T00:00:00Z'), now)).toBe(0);
      expect(daysRemaining(null, now)).toBe(0);
    });

    it('detecte les echeances proches', () => {
      expect(isExpiringSoon(new Date('2026-10-06T10:00:00Z'), now)).toBe(true);
      expect(isExpiringSoon(new Date('2026-10-20T10:00:00Z'), now)).toBe(false);
      expect(isExpiringSoon(new Date('2026-10-02T10:00:00Z'), now)).toBe(false);
    });

    it('restreint l acces des abonnements echus ou suspendus', () => {
      expect(shouldRestrictAccess(SubscriptionStatus.ACTIVE, new Date('2026-10-02T10:00:00Z'), now)).toBe(true);
      expect(shouldRestrictAccess(SubscriptionStatus.ACTIVE, new Date('2026-11-02T10:00:00Z'), now)).toBe(false);
      expect(shouldRestrictAccess(SubscriptionStatus.SUSPENDED, new Date('2027-01-01T00:00:00Z'), now)).toBe(true);
      expect(shouldRestrictAccess(SubscriptionStatus.PENDING, null, now)).toBe(true);
    });
  });
});
