/**
 * Enums des abonnements et des encaissements.
 *
 * Le cahier des charges prevoit des codes d'abonnement uniques lies au numero
 * du client, valables 30, 90 ou 180 jours, envoyes par SMS a chaque paiement,
 * et une restriction d'acces automatique a l'expiration.
 */

/** Durees commerciales proposees (en jours). */
export enum SubscriptionDuration {
  DAYS_30 = 30,
  DAYS_90 = 90,
  DAYS_180 = 180,
}

export const SUBSCRIPTION_DURATIONS: SubscriptionDuration[] = [
  SubscriptionDuration.DAYS_30,
  SubscriptionDuration.DAYS_90,
  SubscriptionDuration.DAYS_180,
];

/** Cycle de vie d'un code d'abonnement. */
export enum SubscriptionCodeStatus {
  /** Code emis, en attente d'activation par le client. */
  ISSUED = 'ISSUED',
  /** Code active par le client (ou par l'ecran central). */
  ACTIVATED = 'ACTIVATED',
  /** Code arrive a echeance sans avoir ete utilise. */
  EXPIRED = 'EXPIRED',
  /** Code annule par l'encadrement (erreur de saisie, remboursement). */
  CANCELLED = 'CANCELLED',
}

/** Moyens de paiement acceptes. */
export enum PaymentMethod {
  MPESA = 'MPESA',
  AIRTEL_MONEY = 'AIRTEL_MONEY',
  ORANGE_MONEY = 'ORANGE_MONEY',
  ILLICOCASH = 'ILLICOCASH',
  CASH_AGENCY = 'CASH_AGENCY',
  BANK_TRANSFER = 'BANK_TRANSFER',
}

/** Famille de moyen de paiement, pour les tableaux de bord finance. */
export enum PaymentChannel {
  MOBILE_MONEY = 'MOBILE_MONEY',
  CASH = 'CASH',
  TRANSFER = 'TRANSFER',
}

export const PAYMENT_CHANNEL_BY_METHOD: Record<PaymentMethod, PaymentChannel> = {
  [PaymentMethod.MPESA]: PaymentChannel.MOBILE_MONEY,
  [PaymentMethod.AIRTEL_MONEY]: PaymentChannel.MOBILE_MONEY,
  [PaymentMethod.ORANGE_MONEY]: PaymentChannel.MOBILE_MONEY,
  [PaymentMethod.ILLICOCASH]: PaymentChannel.MOBILE_MONEY,
  [PaymentMethod.CASH_AGENCY]: PaymentChannel.CASH,
  [PaymentMethod.BANK_TRANSFER]: PaymentChannel.TRANSFER,
};

/**
 * Etat d'un encaissement.
 *
 * `PENDING` correspond a une demande de paiement Mobile Money envoyee au client
 * (ou a un encaissement guichet non encore valide par le caissier) : c'est le
 * statut par lequel passent les webhooks operateurs avant confirmation.
 */
export enum PaymentStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
}

export const PAYMENT_STATUSES_IN_PROGRESS: PaymentStatus[] = [PaymentStatus.PENDING];
