import { DEFAULT_LANGUAGE, Language } from '@common/enums/client.enum';
import { SmsEncoding, SmsTemplate } from '@common/enums/sms.enum';

/**
 * Textes des SMS transactionnels.
 *
 * ⚠️ Comme pour les scripts vocaux, les versions francaise et anglaise sont
 * validees ; les versions swahili, lingala, chiluba et kikongo sont des
 * traductions de premiere passe a faire relire par un locuteur natif.
 *
 * Les messages partent en mode "accuse non sollicite" : ils informent le client
 * sans attendre de reponse, ils restent donc courts (un segment quand possible).
 */

/** Variables disponibles dans les modeles. */
export interface SmsContext {
  /** Reference de l'alerte (`AL-20261003-0004`). */
  reference?: string;
  /** Nature de l'evenement, deja traduite (`Intrusion`, `Incendie`...). */
  alertType?: string;
  /** Heure locale de l'evenement, deja formatee (`19:42`). */
  time?: string;
  /** Adresse du lieu concerne. */
  address?: string;
  /** Nom de l'equipe engagee. */
  teamName?: string;
  /** Delai annonce en minutes. */
  etaMinutes?: number | string;
  /** Resultat constate a la cloture. */
  outcome?: string;
  /** Numero d'urgence rappele au client. */
  emergencyPhone?: string;
  /** Corps libre d'un message redige depuis la console (modele `CUSTOM`). */
  body?: string;
}

/** Texte par situation et par langue, avec les variables entre accolades. */
export const SMS_TEMPLATES: Record<SmsTemplate, Record<Language, string>> = {
  [SmsTemplate.ALERT_RAISED]: {
    [Language.FRENCH]:
      'Zengo : alerte {alertType} detectee ({reference}) a {time}{address}. Notre centre vous appelle. Urgence : {emergencyPhone}.',
    [Language.ENGLISH]:
      'Zengo: {alertType} alert detected ({reference}) at {time}{address}. Our centre is calling you. Emergency: {emergencyPhone}.',
    [Language.SWAHILI]:
      'Zengo: tahadhari ya {alertType} imegunduliwa ({reference}) saa {time}{address}. Kituo chetu kinakupigia. Dharura: {emergencyPhone}.',
    [Language.LINGALA]:
      'Zengo : elembo ya {alertType} emonani ({reference}) na {time}{address}. Santre na biso ezali kobenga yo. Nokinoki: {emergencyPhone}.',
    [Language.CHILUBA]:
      'Zengo: tshimanyinu tshia {alertType} tshimweneka ({reference}) mu {time}{address}. Tshibungu tshietu tshidi tshikukubila. Dikenga: {emergencyPhone}.',
    [Language.KIKONGO]:
      'Zengo: kidimbu ya {alertType} me monanaka ({reference}) na {time}{address}. Kisika kieto ke binga nge. Nsonga: {emergencyPhone}.',
  },
  [SmsTemplate.ALERT_CONFIRMED]: {
    [Language.FRENCH]:
      'Zengo : vous avez confirme l evenement ({reference}). Une equipe est engagee et arrive sur place. Urgence : {emergencyPhone}.',
    [Language.ENGLISH]:
      'Zengo: you confirmed the event ({reference}). A team is on its way. Emergency: {emergencyPhone}.',
    [Language.SWAHILI]:
      'Zengo: umethibitisha tukio ({reference}). Timu inakuja. Dharura: {emergencyPhone}.',
    [Language.LINGALA]:
      'Zengo : ondimi likambo yango ({reference}). Ekipi ezali koya. Nokinoki: {emergencyPhone}.',
    [Language.CHILUBA]:
      'Zengo: wakumbaine tshintu etshi ({reference}). Tshibungu tshidi tshikwiza. Dikenga: {emergencyPhone}.',
    [Language.KIKONGO]:
      'Zengo: nge ndimaka diambu yayi ({reference}). Ekipi ke kwiza. Nsonga: {emergencyPhone}.',
  },
  [SmsTemplate.MISSION_ASSIGNED]: {
    [Language.FRENCH]:
      'Zengo : l equipe {teamName} est en route vers vous ({reference}). Arrivee estimee : {etaMinutes} min.',
    [Language.ENGLISH]:
      'Zengo: team {teamName} is on the way ({reference}). Estimated arrival: {etaMinutes} min.',
    [Language.SWAHILI]:
      'Zengo: timu {teamName} inakuja kwako ({reference}). Kufika kwa kadiri: dakika {etaMinutes}.',
    [Language.LINGALA]:
      'Zengo : ekipi {teamName} ezali na nzela epai na yo ({reference}). Ekokoma na {etaMinutes} min.',
    [Language.CHILUBA]:
      'Zengo: tshibungu {teamName} tshidi mu njila kudi wewe ({reference}). Kufika: {etaMinutes} min.',
    [Language.KIKONGO]:
      'Zengo: ekipi {teamName} ke na nzila na nge ({reference}). Kukuma: {etaMinutes} min.',
  },
  [SmsTemplate.MISSION_ON_SITE]: {
    [Language.FRENCH]: 'Zengo : l equipe {teamName} est arrivee sur place ({reference}).',
    [Language.ENGLISH]: 'Zengo: team {teamName} has arrived on site ({reference}).',
    [Language.SWAHILI]: 'Zengo: timu {teamName} imefika ({reference}).',
    [Language.LINGALA]: 'Zengo : ekipi {teamName} ekɔmi ({reference}).',
    [Language.CHILUBA]: 'Zengo: tshibungu {teamName} tshifika ({reference}).',
    [Language.KIKONGO]: 'Zengo: ekipi {teamName} me kumaka ({reference}).',
  },
  [SmsTemplate.ALERT_CLOSED]: {
    [Language.FRENCH]: 'Zengo : dossier {reference} clos. Resultat : {outcome}. Merci de votre confiance.',
    [Language.ENGLISH]: 'Zengo: case {reference} closed. Outcome: {outcome}. Thank you.',
    [Language.SWAHILI]: 'Zengo: kesi {reference} imefungwa. Matokeo: {outcome}. Asante.',
    [Language.LINGALA]: 'Zengo : dossier {reference} ekangami. Bilembo : {outcome}. Matondi.',
    [Language.CHILUBA]: 'Zengo: dilongolongo {reference} dipangidibue. Mvualo: {outcome}. Tusakidila.',
    [Language.KIKONGO]: 'Zengo: diambu {reference} me kangamaka. Mvutu: {outcome}. Matondo.',
  },
  [SmsTemplate.CUSTOM]: {
    [Language.FRENCH]: '{body}',
    [Language.ENGLISH]: '{body}',
    [Language.SWAHILI]: '{body}',
    [Language.LINGALA]: '{body}',
    [Language.CHILUBA]: '{body}',
    [Language.KIKONGO]: '{body}',
  },
};

/**
 * Remplace les variables d'un modele.
 *
 * Une variable absente est retiree du texte (plutot qu'affichee en clair) et le
 * resultat est nettoye : un client ne doit jamais recevoir « chez vous a
 * {address} ». L'espace insecable avant les deux-points (typographie francaise)
 * est preserve ; seuls les espaces avant un point ou une virgule sont retires.
 */
export const renderSmsTemplate = (
  template: SmsTemplate,
  language: Language,
  context: SmsContext = {},
): string => {
  const texts = SMS_TEMPLATES[template] ?? SMS_TEMPLATES[SmsTemplate.CUSTOM];
  const source = texts[language] ?? texts[DEFAULT_LANGUAGE];

  return source
    .replace(/\{(\w+)\}/g, (_match, key: string) => {
      const value = context[key as keyof SmsContext];
      return value === undefined || value === null ? '' : String(value);
    })
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,])/g, '$1')
    .trim();
};

/**
 * Table GSM 03.38 : les caracteres hors de cet alphabet imposent l'UCS-2, qui
 * divise par deux le nombre de caracteres par segment (70 au lieu de 160).
 */
const GSM7_EXTENDED = '^{}\\[~]|€';
const GSM7_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';

export const detectSmsEncoding = (body: string): SmsEncoding => {
  for (const character of body) {
    if (!GSM7_BASIC.includes(character) && !GSM7_EXTENDED.includes(character)) {
      return SmsEncoding.UCS2;
    }
  }
  return SmsEncoding.GSM7;
};

export interface SmsSegments {
  encoding: SmsEncoding;
  length: number;
  segments: number;
}

/**
 * Decoupe un message en segments factures. Les caracteres etendus GSM comptent
 * double (echappement), et un message long perd 7 caracteres par segment pour
 * l'en-tete de concatenation.
 */
export const countSmsSegments = (body: string): SmsSegments => {
  const encoding = detectSmsEncoding(body);
  let length = 0;
  for (const character of body) {
    length += encoding === SmsEncoding.GSM7 && GSM7_EXTENDED.includes(character) ? 2 : 1;
  }

  const single = encoding === SmsEncoding.GSM7 ? 160 : 70;
  const multipart = encoding === SmsEncoding.GSM7 ? 153 : 67;

  if (length === 0) return { encoding, length, segments: 0 };
  return {
    encoding,
    length,
    segments: length <= single ? 1 : Math.ceil(length / multipart),
  };
};
