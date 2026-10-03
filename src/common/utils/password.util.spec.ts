import {
  assessPasswordStrength,
  generateTemporaryPassword,
  hashPassword,
  verifyPassword,
} from './password.util';

describe('assessPasswordStrength', () => {
  it('accepte un mot de passe conforme a la politique', () => {
    expect(assessPasswordStrength('Zengo@2026').valid).toBe(true);
  });

  it('rejette un mot de passe trop court', () => {
    const result = assessPasswordStrength('Ab1');
    expect(result.valid).toBe(false);
    expect(result.reasons).toContain('au moins 8 caracteres');
  });

  it('exige majuscule, minuscule et chiffre', () => {
    expect(assessPasswordStrength('motdepasse1').reasons).toContain('une majuscule');
    expect(assessPasswordStrength('MOTDEPASSE1').reasons).toContain('une minuscule');
    expect(assessPasswordStrength('MotDePasse').reasons).toContain('un chiffre');
  });

  it('rejette les mots de passe courants', () => {
    expect(assessPasswordStrength('Password').valid).toBe(false);
  });
});

describe('hashPassword / verifyPassword', () => {
  it('verifie un mot de passe correct et rejette un mauvais', async () => {
    const hash = await hashPassword('Zengo@2026', 4);
    expect(hash).not.toContain('Zengo@2026');
    await expect(verifyPassword('Zengo@2026', hash)).resolves.toBe(true);
    await expect(verifyPassword('Zengo@2027', hash)).resolves.toBe(false);
  });
});

describe('generateTemporaryPassword', () => {
  it('genere un mot de passe temporaire valide et change a chaque appel', () => {
    const first = generateTemporaryPassword();
    const second = generateTemporaryPassword();
    expect(first).not.toBe(second);
    expect(assessPasswordStrength(first).valid).toBe(true);
  });
});
