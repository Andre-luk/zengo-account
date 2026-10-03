import { buildZengoId, generateOpaqueToken, normalizeEmail, normalizePhone, sha256 } from './identifier.util';

describe('buildZengoId', () => {
  it('construit un identifiant lisible prefixe du code agence', () => {
    expect(buildZengoId('LUB-AG01', 1)).toBe('ZGO-LUBAG01-000001');
    expect(buildZengoId('KIN-AG01', 42)).toBe('ZGO-KINAG01-000042');
  });

  it('normalise les codes contenant accents et separateurs', () => {
    expect(buildZengoId('kolwezi-01', 7)).toBe('ZGO-KOLWEZI0-000007');
    expect(buildZengoId('kin/ag 2', 3)).toBe('ZGO-KINAG2-000003');
  });

  it('limite le code a 8 caracteres et complete la sequence sur 6 chiffres', () => {
    expect(buildZengoId('ABCDEFGHIJKL', 123456)).toBe('ZGO-ABCDEFGH-123456');
  });
});

describe('normalizePhone', () => {
  it('conserve le prefixe international', () => {
    expect(normalizePhone('+243 970 255 599')).toBe('+243970255599');
  });

  it('retire les separateurs des numeros locaux', () => {
    expect(normalizePhone('0810-000-001')).toBe('0810000001');
  });
});

describe('normalizeEmail', () => {
  it('met en minuscules et supprime les espaces', () => {
    expect(normalizeEmail('  Jean.Luc@Zengo.CD ')).toBe('jean.luc@zengo.cd');
  });
});

describe('sha256', () => {
  it('est deterministe et produit 64 caracteres hexadecimaux', () => {
    const first = sha256('zengo');
    expect(first).toBe(sha256('zengo'));
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(first).not.toBe(sha256('zengo2'));
  });
});

describe('generateOpaqueToken', () => {
  it('genere des tokens uniques de la longueur attendue', () => {
    const first = generateOpaqueToken(24);
    const second = generateOpaqueToken(24);
    expect(first).toHaveLength(48);
    expect(first).not.toBe(second);
  });
});
