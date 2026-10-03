/**
 * Normalise une saisie clavier (DTMF) en touche exploitable.
 * Tolere les blancs, les saisies multiples (`12`) et les puces parasites.
 */
export const normalizeDtmf = (value: unknown): string | null => {
  if (value === undefined || value === null) return null;
  const digits = String(value).replace(/\D/g, '');
  if (digits.length === 0) return null;
  // On ne retient que la premiere touche significative (1 ou 2).
  const first = digits.split('').find((digit) => digit === '1' || digit === '2');
  return first ?? digits[0];
};

/**
 * Interprete une reponse libre (reconnaissance vocale) en intention.
 * Retourne `'not_me'`, `'it_is_me'` ou `null` si l'intention est ambigue.
 */
export const interpretSpeechIntent = (speech: string | null | undefined): 'not_me' | 'it_is_me' | null => {
  if (!speech) return null;
  const text = speech
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const negative = [
    'non',
    'no',
    'pas moi',
    'not me',
    'ce n est pas moi',
    'it was not me',
    'hapana',
    'te',
    'to',
  ];
  const affirmative = ['oui', 'yes', 'c est moi', 'it is me', 'ndiyo', 'yo', 'ndi'];

  const matches = (list: string[]) => list.some((needle) => text.includes(needle));

  // La negation est testee en premier : « ce n'est pas moi » contient « est moi ».
  if (matches(negative)) return 'not_me';
  if (matches(affirmative)) return 'it_is_me';
  return null;
};
