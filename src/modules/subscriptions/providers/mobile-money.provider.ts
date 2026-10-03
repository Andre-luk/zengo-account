import { PaymentMethod } from '@common/enums/subscription.enum';

/**
 * Passerelles Mobile Money.
 *
 * Chaque operateur pousse un accus de paiement avec sa propre forme de donnees.
 * Le travail du provider est de ramener cela a une **notification normalisee**
 * unique, que le service d'encaissement sait traiter : confirmer un paiement
 * annonce, ou le mettre en attente de rapprochement.
 */

export type MobileMoneyOperator = 'mpesa' | 'airtel' | 'orange' | 'illicocash';

export interface PaymentNotification {
  operator: MobileMoneyOperator;
  method: PaymentMethod;
  /** Identifiant de transaction chez l'operateur (unique par mouvement). */
  transactionId: string;
  /** Montant annonce par l'operateur. */
  amount: number;
  /** Devise annoncee : `CDF` ou `USD`. */
  currency: 'CDF' | 'USD';
  /** Numero du payeur, au format international si possible. */
  payerMsisdn: string | null;
  /** Reference commerciale envoyee par le client (numero de contrat, code...). */
  reference: string | null;
  /** Paiement accepte par l'operateur. */
  success: boolean;
  /** Motif d'echec lorsque l'operateur refuse le mouvement. */
  failureReason: string | null;
  receivedAt: Date;
  raw: Record<string, unknown>;
}

export interface MobileMoneyProvider {
  readonly operator: MobileMoneyOperator;
  readonly method: PaymentMethod;
  /**
   * Normalise un webhook. Retourne `null` si la charge utile est inexploitable :
   * mieux vaut un 400 explicite qu'un paiement invente.
   */
  parse(body: Record<string, unknown>): PaymentNotification | null;
}

// ---------------------------------------------------------------------------
// Lecture defensive des charges utiles
// ---------------------------------------------------------------------------

export const readString = (source: unknown, ...paths: string[]): string | null => {
  for (const path of paths) {
    const value = path.split('.').reduce<unknown>((current, key) => {
      if (current && typeof current === 'object' && key in (current as Record<string, unknown>)) {
        return (current as Record<string, unknown>)[key];
      }
      return undefined;
    }, source);

    if (typeof value === 'string' && value.trim() !== '') return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return null;
};

export const readNumber = (source: unknown, ...paths: string[]): number | null => {
  const raw = readString(source, ...paths);
  if (raw === null) return null;
  // Les operateurs envoient parfois « 57 000 » ou « 1 234,56 » : on retire les
  // separateurs de milliers avant de convertir.
  const parsed = Number(raw.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
};

/** Normalise un numero congolais : `0812345678` -> `+243812345678`. */
export const normalizeMsisdn = (raw: string | null | undefined): string | null => {
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  if (digits.startsWith('243')) return `+${digits}`;
  if (digits.startsWith('0')) return `+243${digits.slice(1)}`;
  return digits.length >= 9 ? `+243${digits}` : digits;
};

/** Montant : le franc congolais n'a pas de centimes. */
export const roundAmount = (value: number, currency: 'CDF' | 'USD'): number =>
  currency === 'USD' ? Math.round(value * 100) / 100 : Math.round(value);

// ---------------------------------------------------------------------------
// M-Pesa (Vodacom) — callback C2B et reponse d'une demande de paiement (STK)
// ---------------------------------------------------------------------------

export class MpesaProvider implements MobileMoneyProvider {
  readonly operator = 'mpesa' as const;
  readonly method = PaymentMethod.MPESA;

  parse(body: Record<string, unknown>): PaymentNotification | null {
    const transactionId = readString(body, 'TransID', 'transactionId', 'Body.stkCallback.CheckoutRequestID');
    if (!transactionId) return null;

    const amount = readNumber(body, 'TransAmount', 'amount', 'Body.stkCallback.CallbackMetadata.Amount');
    const resultCode = readString(body, 'Body.stkCallback.ResultCode', 'ResultCode');
    const success = resultCode === null ? true : resultCode === '0';
    if (amount === null) {
      // Paiement refuse par le client : aucun montant n'est transmis.
      return {
        operator: this.operator,
        method: this.method,
        transactionId,
        amount: 0,
        currency: 'CDF',
        payerMsisdn: normalizeMsisdn(readString(body, 'MSISDN', 'msisdn')),
        reference: readString(body, 'BillRefNumber', 'reference', 'Body.stkCallback.CheckoutRequestID'),
        success: false,
        failureReason: readString(body, 'Body.stkCallback.ResultDesc', 'ResultDesc') ?? 'operation refusee',
        receivedAt: new Date(),
        raw: body,
      };
    }

    const currency =
      (readString(body, 'currency', 'Currency', 'Body.stkCallback.CallbackMetadata.Currency') ?? 'CDF').toUpperCase() ===
      'USD'
        ? 'USD'
        : 'CDF';

    return {
      operator: this.operator,
      method: this.method,
      transactionId,
      amount: roundAmount(amount, currency),
      currency,
      payerMsisdn: normalizeMsisdn(readString(body, 'MSISDN', 'msisdn')),
      reference: readString(body, 'BillRefNumber', 'reference', 'Body.stkCallback.CheckoutRequestID'),
      success,
      failureReason: success ? null : readString(body, 'ResultDesc'),
      receivedAt: new Date(),
      raw: body,
    };
  }
}

// ---------------------------------------------------------------------------
// Airtel Money
// ---------------------------------------------------------------------------

export class AirtelMoneyProvider implements MobileMoneyProvider {
  readonly operator = 'airtel' as const;
  readonly method = PaymentMethod.AIRTEL_MONEY;

  parse(body: Record<string, unknown>): PaymentNotification | null {
    const transactionId = readString(body, 'transaction.id', 'transaction_id', 'transactionId');
    if (!transactionId) return null;

    const amount = readNumber(body, 'transaction.amount', 'amount');
    if (amount === null) return null;

    const statusCode = readString(body, 'transaction.status.code', 'status.code', 'status');
    const currency = (readString(body, 'transaction.currency', 'currency') ?? 'CDF').toUpperCase() === 'USD' ? 'USD' : 'CDF';

    return {
      operator: this.operator,
      method: this.method,
      transactionId,
      amount: roundAmount(amount, currency),
      currency,
      payerMsisdn: normalizeMsisdn(readString(body, 'transaction.msisdn', 'msisdn')),
      reference: readString(body, 'transaction.reference', 'reference'),
      success: statusCode === 'TS' || statusCode === 'SUCCESS' || statusCode === 'success',
      failureReason: statusCode === 'TS' ? null : readString(body, 'transaction.status.message', 'message'),
      receivedAt: new Date(),
      raw: body,
    };
  }
}

// ---------------------------------------------------------------------------
// Orange Money
// ---------------------------------------------------------------------------

export class OrangeMoneyProvider implements MobileMoneyProvider {
  readonly operator = 'orange' as const;
  readonly method = PaymentMethod.ORANGE_MONEY;

  parse(body: Record<string, unknown>): PaymentNotification | null {
    const transactionId = readString(body, 'txnid', 'transaction_id', 'transactionId');
    if (!transactionId) return null;

    const amount = readNumber(body, 'amount', 'transaction.amount');
    if (amount === null) return null;

    const status = (readString(body, 'status', 'transaction.status') ?? 'SUCCESS').toUpperCase();
    const currency = (readString(body, 'currency') ?? 'CDF').toUpperCase() === 'USD' ? 'USD' : 'CDF';

    return {
      operator: this.operator,
      method: this.method,
      transactionId,
      amount: roundAmount(amount, currency),
      currency,
      payerMsisdn: normalizeMsisdn(readString(body, 'msisdn', 'customer.msisdn')),
      reference: readString(body, 'order_id', 'reference'),
      success: ['SUCCESS', 'SUCCESSFULL', 'OK'].includes(status),
      failureReason: ['SUCCESS', 'SUCCESSFULL', 'OK'].includes(status) ? null : readString(body, 'message'),
      receivedAt: new Date(),
      raw: body,
    };
  }
}

// ---------------------------------------------------------------------------
// Illicocash
// ---------------------------------------------------------------------------

export class IllicocashProvider implements MobileMoneyProvider {
  readonly operator = 'illicocash' as const;
  readonly method = PaymentMethod.ILLICOCASH;

  parse(body: Record<string, unknown>): PaymentNotification | null {
    const transactionId = readString(body, 'transactionId', 'transaction_id', 'id');
    if (!transactionId) return null;

    const amount = readNumber(body, 'amount', 'transaction.amount');
    if (amount === null) return null;

    const status = (readString(body, 'status', 'transaction.status') ?? 'SUCCESS').toUpperCase();
    const currency = (readString(body, 'currency') ?? 'CDF').toUpperCase() === 'USD' ? 'USD' : 'CDF';

    return {
      operator: this.operator,
      method: this.method,
      transactionId,
      amount: roundAmount(amount, currency),
      currency,
      payerMsisdn: normalizeMsisdn(readString(body, 'phoneNumber', 'msisdn', 'customer.phone')),
      reference: readString(body, 'externalReference', 'reference'),
      success: ['SUCCESS', 'SUCCEEDED', 'COMPLETED'].includes(status),
      failureReason: ['SUCCESS', 'SUCCEEDED', 'COMPLETED'].includes(status)
        ? null
        : readString(body, 'message', 'reason'),
      receivedAt: new Date(),
      raw: body,
    };
  }
}

export const MOBILE_MONEY_PROVIDERS: Record<MobileMoneyOperator, MobileMoneyProvider> = {
  mpesa: new MpesaProvider(),
  airtel: new AirtelMoneyProvider(),
  orange: new OrangeMoneyProvider(),
  illicocash: new IllicocashProvider(),
};

export const providerFor = (operator: string): MobileMoneyProvider | null =>
  MOBILE_MONEY_PROVIDERS[operator.toLowerCase() as MobileMoneyOperator] ?? null;
