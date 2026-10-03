import { AlertType } from '@common/enums/alert.enum';
import { DEFAULT_LANGUAGE, Language } from '@common/enums/client.enum';

/**
 * Textes du moteur d'appel vocal intelligent.
 *
 * ⚠️ Les versions francaise et anglaise sont validees. Les versions swahili,
 * lingala et chiluba sont des traductions de premiere passe : elles doivent
 * etre relues par un locuteur natif avant mise en production (la restitution
 * vocale est un element sensible du parcours client).
 */
export interface VoiceScriptTexts {
  greeting: string;
  /** Phrase de situation, selon la nature de l'alerte. */
  situations: Partial<Record<AlertType, string>> & { default: string };
  question: string;
  dtmfPrompt: string;
  /** Reponse apres la touche 1 : le client n'est pas a l'origine. */
  notMe: string;
  /** Reponse apres la touche 2 : le client est a l'origine. */
  itIsMe: string;
  noInput: string;
}

export const VOICE_SCRIPT_VERSION = 'v1';

export const VOICE_SCRIPTS: Record<Language, VoiceScriptTexts> = {
  [Language.FRENCH]: {
    greeting: 'Bonjour, ici le centre de surveillance Zengo.',
    situations: {
      [AlertType.INTRUSION]:
        "Nous avons constate une ouverture inhabituelle de porte chez vous pendant que votre systeme est arme.",
      [AlertType.FIRE]:
        'Nous avons detecte une alarme incendie dans votre residence.',
      [AlertType.MEDICAL]:
        'Nous avons recu une demande d assistance medicale depuis votre domicile.',
      default: 'Nous avons detecte une anomalie dans votre residence.',
    },
    question: "Etes-vous a l'origine de cette action ?",
    dtmfPrompt: "Appuyez sur 1 si ce n'est pas vous, sur 2 si c'est vous.",
    notMe: 'Merci. Une equipe va intervenir immediatement. Restez en securite.',
    itIsMe: 'Veuillez desarmer votre systeme si vous etes a la maison. Merci et bonne journee.',
    noInput: "Nous n'avons pas recu de reponse. Le centre prend le relais.",
  },
  [Language.ENGLISH]: {
    greeting: 'Hello, this is the Zengo monitoring centre.',
    situations: {
      [AlertType.INTRUSION]:
        'We detected an unusual door opening at your home while your system is armed.',
      [AlertType.FIRE]: 'We detected a fire alarm at your residence.',
      [AlertType.MEDICAL]: 'We received a medical assistance request from your home.',
      default: 'We detected an anomaly at your residence.',
    },
    question: 'Are you the person behind this action?',
    dtmfPrompt: 'Press 1 if it was not you, press 2 if it was you.',
    notMe: 'Thank you. A team is on its way immediately. Please stay safe.',
    itIsMe: 'Please disarm your system if you are at home. Thank you and have a good day.',
    noInput: 'We did not receive an answer. Our centre is taking over.',
  },
  [Language.SWAHILI]: {
    greeting: 'Habari, hii ni kituo cha ufuatiliaji cha Zengo.',
    situations: {
      [AlertType.INTRUSION]:
        'Tumegundua mlango ukifunguliwa kwa njia isiyo ya kawaida wakati mfumo wako umewekwa.',
      [AlertType.FIRE]: 'Tumegundua kengele ya moto nyumbani kwako.',
      [AlertType.MEDICAL]: 'Tumepokea ombi la msaada wa matibabu kutoka nyumbani kwako.',
      default: 'Tumegundua tatizo nyumbani kwako.',
    },
    question: 'Je, wewe ndiye uliyefanya hivi?',
    dtmfPrompt: 'Bonyeza 1 kama si wewe, bonyeza 2 kama ni wewe.',
    notMe: 'Asante. Timu inakuja mara moja. Tafadhali kaa salama.',
    itIsMe: 'Tafadhali zima mfumo wako ikiwa uko nyumbani. Asante na siku njema.',
    noInput: 'Hatukupata jibu. Kituo chetu kinaendelea.',
  },
  [Language.LINGALA]: {
    greeting: 'Mbote, oyo ezali santre ya bokengi ya Zengo.',
    situations: {
      [AlertType.INTRUSION]:
        'Tomonaki ete ekuke efungwamaki na ndenge ya kokamwa na ndako na yo ntango sistema na yo ezali na bokengi.',
      [AlertType.FIRE]: 'Tomonaki elembo ya moto na ndako na yo.',
      [AlertType.MEDICAL]: 'Tozwaki bosengi ya lisalisi ya monganga uta na ndako na yo.',
      default: 'Tomonaki likambo moko na ndako na yo.',
    },
    question: 'Yo nde osalaki yango?',
    dtmfPrompt: 'Fina 1 soki ezali yo te, fina 2 soki ezali yo.',
    notMe: 'Matondi. Ekipi ekoya ntango kaka wana. Bikala na kimya.',
    itIsMe: 'Tima sistema na yo soki ozali na ndako. Matondi mpe mokolo malamu.',
    noInput: 'Tozwaki eyano te. Santre na biso ezali kokoba.',
  },
  [Language.CHILUBA]: {
    greeting: 'Moyo, eyi ndi tshibungu tshia kulama tshia Zengo.',
    situations: {
      [AlertType.INTRUSION]:
        'Twamona tshiswele tshia mukoko tshidi tshifunguka mu ndumbu yebe mushi tshikola tshibe tshidi tshikema.',
      [AlertType.FIRE]: 'Twamona tshimanyinu tshia mudilu mu ndumbu yebe.',
      [AlertType.MEDICAL]: 'Twapikila lukonku lua bukitshi bua ku ndumbu yebe.',
      default: 'Twamona tshintu tshia kukema mu ndumbu yebe.',
    },
    question: 'Wewe mudi wuvua musalanyi wa mbikadilo eyi?',
    dtmfPrompt: 'Kanda 1 bika mudi wewe to, kanda 2 bika mudi wewe.',
    notMe: 'Tusakidila. Tshibungu tshidi tshikwenda kunyima. Bika mudi munda mua tshikema.',
    itIsMe: 'Funda tshikola tshibe bika mudi wewe mu ndumbu. Tusakidila ne difuku dilamue.',
    noInput: 'Katuatupikile mvualo to. Tshibungu tshitu tshidi tshikwenda kumpala.',
  },
  [Language.KIKONGO]: {
    greeting: 'Mbote, yawu kele kisika ya kukengila ya Zengo.',
    situations: {
      [AlertType.INTRUSION]:
        'Beto monaka kukanguka ya kielo ya kukonda kuzaba ntangu sistema na nge kele na kukengila.',
      [AlertType.FIRE]: 'Beto monaka kidimbu ya tiya na nzo na nge.',
      [AlertType.MEDICAL]: 'Beto bakaka lombu ya lusadisu ya monganga na nzo na nge.',
      default: 'Beto monaka mambu ya kuyituka na nzo na nge.',
    },
    question: 'Nge kele muntu ya kusala yau?',
    dtmfPrompt: 'Fina 1 kana ke nge ve, fina 2 kana ke nge.',
    notMe: 'Matondo. Ekipi ke kwiza ntangu yayi. Bika na ngemba.',
    itIsMe: 'Katula kukengila na nge kana nge kele na nzo. Matondo mpi kilumbu ya mbote.',
    noInput: 'Beto bakaka mvutu ve. Kisika na beto ke landa.',
  },
};

export interface RenderedVoiceScript {
  key: string;
  language: Language;
  greeting: string;
  situation: string;
  question: string;
  dtmfPrompt: string;
  notMe: string;
  itIsMe: string;
  noInput: string;
  /** Texte complet, dans l'ordre de lecture, pour le fournisseur TTS. */
  fullText: string;
}

/** Resout la langue du script : langue du client, sinon francais par defaut (CDC). */
export const resolveScriptLanguage = (language?: Language | null): Language =>
  language && VOICE_SCRIPTS[language] ? language : DEFAULT_LANGUAGE;

export const renderVoiceScript = (
  alertType: AlertType,
  language?: Language | null,
): RenderedVoiceScript => {
  const resolved = resolveScriptLanguage(language);
  const texts = VOICE_SCRIPTS[resolved];
  const situation = texts.situations[alertType] ?? texts.situations.default;

  return {
    key: `alert_${VOICE_SCRIPT_VERSION}_${resolved}`,
    language: resolved,
    greeting: texts.greeting,
    situation,
    question: texts.question,
    dtmfPrompt: texts.dtmfPrompt,
    notMe: texts.notMe,
    itIsMe: texts.itIsMe,
    noInput: texts.noInput,
    fullText: [texts.greeting, situation, texts.question, texts.dtmfPrompt].join(' '),
  };
};
