import { Language } from '@common/enums/client.enum';
import { SmsEncoding, SmsTemplate } from '@common/enums/sms.enum';
import {
  countSmsSegments,
  detectSmsEncoding,
  renderSmsTemplate,
  SMS_TEMPLATES,
} from '@modules/telephony/sms-templates';

describe('Modeles de SMS', () => {
  it('couvre toutes les situations dans les six langues', () => {
    const languages = Object.values(Language);
    for (const template of Object.values(SmsTemplate)) {
      for (const language of languages) {
        expect(SMS_TEMPLATES[template][language]).toBeTruthy();
      }
    }
  });

  it('remplace les variables du modele', () => {
    const body = renderSmsTemplate(SmsTemplate.ALERT_RAISED, Language.FRENCH, {
      reference: 'AL-20261003-0004',
      alertType: 'intrusion',
      time: '19:42',
      address: ', 12 avenue de la Paix',
      emergencyPhone: '+243 970 255 599',
    });

    expect(body).toContain('AL-20261003-0004');
    expect(body).toContain('intrusion');
    expect(body).toContain('19:42');
    expect(body).toContain('12 avenue de la Paix');
    expect(body).not.toContain('{');
  });

  it('retire proprement les variables absentes au lieu de les afficher', () => {
    const body = renderSmsTemplate(SmsTemplate.MISSION_ON_SITE, Language.FRENCH, {
      reference: 'IN-20261003-0002',
    });

    expect(body).toBe('Zengo : l equipe est arrivee sur place (IN-20261003-0002).');
    expect(body).not.toContain('null');
    expect(body).not.toContain('undefined');
  });

  it('nettoie les espaces laisses par les variables vides', () => {
    const body = renderSmsTemplate(SmsTemplate.ALERT_CLOSED, Language.FRENCH, {
      reference: 'AL-20261003-0007',
      outcome: 'incident traite sur place',
    });

    expect(body).toBe(
      'Zengo : dossier AL-20261003-0007 clos. Resultat : incident traite sur place. Merci de votre confiance.',
    );
  });

  it('rend les modeles personnalises avec le corps fourni', () => {
    expect(
      renderSmsTemplate(SmsTemplate.CUSTOM, Language.ENGLISH, { body: 'Votre code est 4412.' }),
    ).toBe('Votre code est 4412.');
  });

  it('retombe sur le francais pour une langue non traduite', () => {
    const body = renderSmsTemplate(
      SmsTemplate.MISSION_ON_SITE,
      'xx' as Language,
      { reference: 'IN-1' },
    );
    expect(body).toContain('arrivee sur place');
  });
});

describe('Decoupage des SMS', () => {
  it('classe en GSM-7 un texte sans accent hors table', () => {
    expect(detectSmsEncoding('Zengo : intrusion detectee a 19:42.')).toBe(SmsEncoding.GSM7);
  });

  it('classe en UCS-2 des le premier caractere hors table GSM', () => {
    expect(detectSmsEncoding('Alerte incendie — equipe sur place')).toBe(SmsEncoding.UCS2);
  });

  it('tient dans un segment GSM-7 jusqu a 160 caracteres', () => {
    expect(countSmsSegments('a'.repeat(160))).toEqual({
      encoding: SmsEncoding.GSM7,
      length: 160,
      segments: 1,
    });
  });

  it('passe a deux segments au-dela de 160 caracteres', () => {
    expect(countSmsSegments('a'.repeat(161)).segments).toBe(2);
    expect(countSmsSegments('a'.repeat(306)).segments).toBe(2);
    expect(countSmsSegments('a'.repeat(307)).segments).toBe(3);
  });

  it('facture les caracteres etendus GSM en double', () => {
    // `{` et `}` sont des caracteres etendus : chaque occurrence compte 2.
    const withBraces = countSmsSegments('a'.repeat(80) + '{}'.repeat(20));
    expect(withBraces.encoding).toBe(SmsEncoding.GSM7);
    expect(withBraces.length).toBe(160);
  });

  it('applique les seuils UCS-2 (70 / 67)', () => {
    // `ê` n'appartient pas a la table GSM 03.38 : le message bascule en UCS-2.
    expect(countSmsSegments('ê'.repeat(70))).toEqual({
      encoding: SmsEncoding.UCS2,
      length: 70,
      segments: 1,
    });
    expect(countSmsSegments('ê'.repeat(71)).segments).toBe(2);
    expect(countSmsSegments('ê'.repeat(134)).segments).toBe(2);
    expect(countSmsSegments('ê'.repeat(135)).segments).toBe(3);
  });

  it('ne facture rien pour un corps vide', () => {
    expect(countSmsSegments('').segments).toBe(0);
  });
});
