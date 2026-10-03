/** Langues supportees par la plateforme et le moteur d'appel vocal IA. */
export enum Language {
  FRENCH = 'fr',
  ENGLISH = 'en',
  SWAHILI = 'sw',
  LINGALA = 'ln',
  CHILUBA = 'lu',
  KIKONGO = 'kg',
}

export const DEFAULT_LANGUAGE = Language.FRENCH;

/** Statuts du compte client (fiche Zengo). */
export enum ClientStatus {
  /** Cree, en attente d'installation / activation. */
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  /** Abonnement expire : acces restreint. */
  EXPIRED = 'EXPIRED',
  ARCHIVED = 'ARCHIVED',
}

/** Groupes tarifaires issus du cahier des charges. */
export enum OfferPack {
  STANDARD = 'STANDARD',
  PREMIUM_SMALL = 'PREMIUM_SMALL',
  PREMIUM_INSTITUTION = 'PREMIUM_INSTITUTION',
  CUSTOM = 'CUSTOM',
}

export enum SubscriptionStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  EXPIRED = 'EXPIRED',
  SUSPENDED = 'SUSPENDED',
}

/** Devise de facturation (les deux devises sont gerees par le cahier des charges). */
export enum Currency {
  USD = 'USD',
  CDF = 'CDF',
}
