import { interpretSpeechIntent, normalizeDtmf } from './dtmf.util';

describe('normalizeDtmf', () => {
  it('conserve les touches significatives', () => {
    expect(normalizeDtmf('1')).toBe('1');
    expect(normalizeDtmf('2')).toBe('2');
  });

  it('extrait la premiere touche significative d une saisie multiple', () => {
    expect(normalizeDtmf('12')).toBe('1');
    expect(normalizeDtmf('9 2')).toBe('2');
  });

  it('ignore les valeurs vides ou non numeriques', () => {
    expect(normalizeDtmf(undefined)).toBeNull();
    expect(normalizeDtmf(null)).toBeNull();
    expect(normalizeDtmf('')).toBeNull();
    expect(normalizeDtmf('abc')).toBeNull();
  });
});

describe('interpretSpeechIntent', () => {
  it('detecte la negation en francais', () => {
    expect(interpretSpeechIntent('Non')).toBe('not_me');
    expect(interpretSpeechIntent("Ce n'est pas moi")).toBe('not_me');
    expect(interpretSpeechIntent('non non')).toBe('not_me');
  });

  it('detecte l affirmation en francais', () => {
    expect(interpretSpeechIntent('Oui')).toBe('it_is_me');
    expect(interpretSpeechIntent("oui c'est moi")).toBe('it_is_me');
  });

  it('detecte l anglais', () => {
    expect(interpretSpeechIntent('no, it was not me')).toBe('not_me');
    expect(interpretSpeechIntent('yes it is me')).toBe('it_is_me');
  });

  it('detecte le swahili', () => {
    expect(interpretSpeechIntent('hapana')).toBe('not_me');
    expect(interpretSpeechIntent('ndiyo')).toBe('it_is_me');
  });

  it('priorise la negation sur l affirmation', () => {
    // « ce n'est pas moi » contient « est moi » : la negation doit gagner.
    expect(interpretSpeechIntent("ce n'est pas moi")).toBe('not_me');
  });

  it('retourne null pour une reponse ambigue ou absente', () => {
    expect(interpretSpeechIntent('')).toBeNull();
    expect(interpretSpeechIntent(null)).toBeNull();
    expect(interpretSpeechIntent('je ne comprends pas')).toBeNull();
  });

  it('ignore les accents et la casse', () => {
    expect(interpretSpeechIntent('NON')).toBe('not_me');
    expect(interpretSpeechIntent('Oui, c\u2019est moi')).toBe('it_is_me');
  });
});
