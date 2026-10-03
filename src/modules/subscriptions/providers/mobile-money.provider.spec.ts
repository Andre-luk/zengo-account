import {
  normalizeMsisdn,
  providerFor,
} from '@modules/subscriptions/providers/mobile-money.provider';

describe('Passerelles Mobile Money', () => {
  describe('M-Pesa', () => {
    const provider = providerFor('mpesa')!;

    it('normalise un callback de paiement marchand (C2B)', () => {
      const notification = provider.parse({
        TransID: 'MP241003.1421.A88213',
        TransAmount: '57000',
        MSISDN: '0812345678',
        BillRefNumber: 'ZGO-LUBAG01-000001',
        TransactionType: 'Pay Bill',
      });

      expect(notification).not.toBeNull();
      expect(notification!.transactionId).toBe('MP241003.1421.A88213');
      expect(notification!.amount).toBe(57_000);
      expect(notification!.currency).toBe('CDF');
      expect(notification!.payerMsisdn).toBe('+243812345678');
      expect(notification!.reference).toBe('ZGO-LUBAG01-000001');
      expect(notification!.success).toBe(true);
    });

    it('exploite la reponse d une demande de paiement (STK push)', () => {
      const notification = provider.parse({
        Body: {
          stkCallback: {
            CheckoutRequestID: 'ws_CO_03102026194121999',
            ResultCode: '0',
            ResultDesc: 'The service request is processed successfully.',
            CallbackMetadata: { Amount: 22, Currency: 'USD' },
          },
        },
      });

      expect(notification!.amount).toBe(22);
      expect(notification!.currency).toBe('USD');
      expect(notification!.success).toBe(true);
      expect(notification!.transactionId).toBe('ws_CO_03102026194121999');
    });

    it('marque un refus client comme non encaisse', () => {
      const notification = provider.parse({
        Body: { stkCallback: { CheckoutRequestID: 'ws_CO_1', ResultCode: '1032', ResultDesc: 'Request cancelled by user' } },
      });

      expect(notification!.success).toBe(false);
      expect(notification!.amount).toBe(0);
      expect(notification!.failureReason).toBe('Request cancelled by user');
    });

    it('refuse une charge utile sans identifiant de transaction', () => {
      expect(provider.parse({ TransAmount: '1000' })).toBeNull();
    });
  });

  describe('Airtel Money', () => {
    const provider = providerFor('airtel')!;

    it('normalise un paiement reussi', () => {
      const notification = provider.parse({
        transaction: {
          id: 'AIR-77812',
          amount: 57_000,
          currency: 'CDF',
          msisdn: '+243971000111',
          status: { code: 'TS', message: 'Success' },
          reference: 'ZGO-LUBAG01-000001',
        },
      });

      expect(notification!.transactionId).toBe('AIR-77812');
      expect(notification!.success).toBe(true);
      expect(notification!.payerMsisdn).toBe('+243971000111');
    });

    it('signale un echec avec son motif', () => {
      const notification = provider.parse({
        transaction: { id: 'AIR-1', amount: 1000, status: { code: 'TF', message: 'Insufficient balance' } },
      });

      expect(notification!.success).toBe(false);
      expect(notification!.failureReason).toBe('Insufficient balance');
    });
  });

  describe('Orange Money', () => {
    const provider = providerFor('orange')!;

    it('normalise un paiement Orange', () => {
      const notification = provider.parse({
        txnid: 'OM-4401',
        amount: '57 000',
        msisdn: '0971200000',
        status: 'SUCCESS',
        order_id: 'ZGO-LUBAG01-000001',
      });

      expect(notification!.transactionId).toBe('OM-4401');
      expect(notification!.amount).toBe(57_000);
      expect(notification!.success).toBe(true);
    });

    it('considere un statut inconnu comme un echec', () => {
      expect(provider.parse({ txnid: 'OM-1', amount: 10, status: 'PENDING' })!.success).toBe(false);
    });
  });

  describe('Illicocash', () => {
    const provider = providerFor('illicocash')!;

    it('normalise un paiement Illicocash', () => {
      const notification = provider.parse({
        transactionId: 'IL-9001',
        amount: 22,
        currency: 'USD',
        phoneNumber: '0812999999',
        status: 'COMPLETED',
        externalReference: 'ZG-K4PM-7RTQ',
      });

      expect(notification!.amount).toBe(22);
      expect(notification!.currency).toBe('USD');
      expect(notification!.method).toBe('ILLICOCASH');
      expect(notification!.payerMsisdn).toBe('+243812999999');
    });

    it('refuse une charge utile non exploitable', () => {
      expect(provider.parse({ amount: 10 })).toBeNull();
    });
  });

  describe('Normalisation des numeros', () => {
    it('convertit les formats congolais usuels', () => {
      expect(normalizeMsisdn('0812345678')).toBe('+243812345678');
      expect(normalizeMsisdn('243812345678')).toBe('+243812345678');
      expect(normalizeMsisdn('+243 812 345 678')).toBe('+243812345678');
      expect(normalizeMsisdn('812345678')).toBe('+243812345678');
      expect(normalizeMsisdn(null)).toBeNull();
    });
  });

  describe('Selection du fournisseur', () => {
    it('reconnait les quatre operateurs et ignore les autres', () => {
      expect(providerFor('mpesa')?.method).toBe('MPESA');
      expect(providerFor('MPESA')?.method).toBe('MPESA');
      expect(providerFor('airtel')?.method).toBe('AIRTEL_MONEY');
      expect(providerFor('orange')?.method).toBe('ORANGE_MONEY');
      expect(providerFor('illicocash')?.method).toBe('ILLICOCASH');
      expect(providerFor('wave')).toBeNull();
    });
  });
});
