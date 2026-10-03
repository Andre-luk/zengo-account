import { Language } from '@common/enums/client.enum';

/**
 * Correspondance entre la langue du client et le code de synthese vocale du
 * fournisseur.
 *
 * ⚠️ Les moteurs TTS des fournisseurs grand public couvrent mal le lingala, le
 * chiluba et le kikongo. En production, deux options :
 *   1. utiliser un moteur TTS dedie (Google Cloud TTS, Azure, OpenAI) ;
 *   2. pre-enregistrer les messages par un locuteur natif.
 * Tant qu'aucune de ces options n'est branchee, on retombe sur le francais
 * (langue officielle) pour eviter un appel muet.
 */
export const toSpeechLanguage = (language: Language): string => {
  switch (language) {
    case Language.FRENCH:
      return 'fr-FR';
    case Language.ENGLISH:
      return 'en-US';
    case Language.SWAHILI:
      // Non garanti par tous les moteurs : repli explicite sur l'anglais.
      return 'sw-KE';
    default:
      return 'fr-FR';
  }
};

/** Indique si la langue dispose d'un moteur TTS fiable chez le fournisseur. */
export const hasNativeSpeechSupport = (language: Language): boolean =>
  [Language.FRENCH, Language.ENGLISH].includes(language);
