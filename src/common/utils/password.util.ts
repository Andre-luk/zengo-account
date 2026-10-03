import * as bcrypt from 'bcryptjs';

/** Hache un mot de passe (bcrypt). */
export const hashPassword = (plain: string, saltRounds: number): Promise<string> =>
  bcrypt.hash(plain, saltRounds);

/** Compare un mot de passe en clair a son empreinte bcrypt. */
export const verifyPassword = (plain: string, hash: string): Promise<boolean> =>
  bcrypt.compare(plain, hash);

export interface PasswordStrengthResult {
  valid: boolean;
  reasons: string[];
}

const COMMON_WEAK_PASSWORDS = new Set([
  'password',
  'motdepasse',
  '12345678',
  'qwerty123',
  'zengo123',
  'admin123',
]);

/** Politique minimale : 8 caracteres, une majuscule, une minuscule, un chiffre. */
export const assessPasswordStrength = (plain: string): PasswordStrengthResult => {
  const reasons: string[] = [];
  if (plain.length < 8) reasons.push('au moins 8 caracteres');
  if (!/[a-z]/.test(plain)) reasons.push('une minuscule');
  if (!/[A-Z]/.test(plain)) reasons.push('une majuscule');
  if (!/[0-9]/.test(plain)) reasons.push('un chiffre');
  if (COMMON_WEAK_PASSWORDS.has(plain.toLowerCase())) reasons.push('un mot de passe non courant');
  return { valid: reasons.length === 0, reasons };
};

/** Genere un mot de passe temporaire lisible (transmis au client a la creation). */
export const generateTemporaryPassword = (): string => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const pick = (set: string, count: number): string =>
    Array.from({ length: count }, () => set[Math.floor(Math.random() * set.length)]).join('');
  return `${pick(alphabet, 2)}${pick(lower, 4)}${pick(digits, 3)}`;
};
