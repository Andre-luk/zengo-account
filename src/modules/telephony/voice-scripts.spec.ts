import { AlertType } from '@common/enums/alert.enum';
import { DEFAULT_LANGUAGE, Language } from '@common/enums/client.enum';
import { resolveScriptLanguage, renderVoiceScript, VOICE_SCRIPTS } from './voice-scripts';
import { hasNativeSpeechSupport, toSpeechLanguage } from './tts-language.util';

describe('resolveScriptLanguage', () => {
  it('retombe sur le francais par defaut (regle du cahier des charges)', () => {
    expect(resolveScriptLanguage(null)).toBe(DEFAULT_LANGUAGE);
    expect(resolveScriptLanguage(undefined)).toBe(DEFAULT_LANGUAGE);
    expect(resolveScriptLanguage(DEFAULT_LANGUAGE)).toBe(Language.FRENCH);
  });

  it('respecte la langue du client', () => {
    expect(resolveScriptLanguage(Language.SWAHILI)).toBe(Language.SWAHILI);
    expect(resolveScriptLanguage(Language.LINGALA)).toBe(Language.LINGALA);
  });
});

describe('renderVoiceScript', () => {
  it('produit un script complet dans la langue demandee', () => {
    const script = renderVoiceScript(AlertType.INTRUSION, Language.FRENCH);

    expect(script.language).toBe(Language.FRENCH);
    expect(script.key).toContain('fr');
    expect(script.greeting).toBeTruthy();
    expect(script.question).toContain('origine');
    expect(script.dtmfPrompt).toContain('1');
    expect(script.dtmfPrompt).toContain('2');
    // Le texte complet reprend les phases dans l'ordre de lecture.
    expect(script.fullText.startsWith(script.greeting)).toBe(true);
    expect(script.fullText).toContain(script.situation);
    expect(script.fullText).toContain(script.question);
    expect(script.fullText.endsWith(script.dtmfPrompt)).toBe(true);
  });

  it('adapte la phrase de situation au type d alerte', () => {
    const intrusion = renderVoiceScript(AlertType.INTRUSION, Language.FRENCH);
    const fire = renderVoiceScript(AlertType.FIRE, Language.FRENCH);

    expect(intrusion.situation).toContain('porte');
    expect(fire.situation).toContain('incendie');
    expect(intrusion.situation).not.toBe(fire.situation);
  });

  it('utilise la phrase par defaut pour un type non couvert', () => {
    const script = renderVoiceScript(AlertType.WATER_LEAK, Language.FRENCH);
    expect(script.situation).toBe(VOICE_SCRIPTS[Language.FRENCH].situations.default);
  });

  it('fournit un script pour toutes les langues supportees', () => {
    for (const language of Object.values(Language)) {
      const script = renderVoiceScript(AlertType.INTRUSION, language);
      expect(script.greeting.length).toBeGreaterThan(10);
      expect(script.notMe.length).toBeGreaterThan(10);
      expect(script.itIsMe.length).toBeGreaterThan(10);
      expect(script.language).toBe(language);
    }
  });

  it('reprend les messages du cahier des charges (conseil de desarmement)', () => {
    const script = renderVoiceScript(AlertType.INTRUSION, Language.FRENCH);
    expect(script.notMe).toContain('equipe va intervenir');
    expect(script.itIsMe).toContain('desarmer');
  });
});

describe('toSpeechLanguage', () => {
  it('mappe les langues supportees par les moteurs TTS', () => {
    expect(toSpeechLanguage(Language.FRENCH)).toBe('fr-FR');
    expect(toSpeechLanguage(Language.ENGLISH)).toBe('en-US');
  });

  it('replie les langues locales sur une langue disponible', () => {
    expect(hasNativeSpeechSupport(Language.LINGALA)).toBe(false);
    expect(toSpeechLanguage(Language.LINGALA)).toBe('fr-FR');
    expect(toSpeechLanguage(Language.CHILUBA)).toBe('fr-FR');
  });
});
