import { createHash, randomBytes, randomUUID } from 'node:crypto';

/** Genere un token opaque (refresh token, code d'activation, secret de device). */
export const generateOpaqueToken = (bytes = 48): string => randomBytes(bytes).toString('hex');

/** Empreinte SHA-256 (stockage des refresh tokens et secrets de device). */
export const sha256 = (value: string): string =>
  createHash('sha256').update(value).digest('hex');

export const newId = (): string => randomUUID();

/**
 * Genere un identifiant Zengo lisible : `ZGO-<CODE>-<NNNNNN>`.
 * Le code agence est normalise (majuscules, sans caracteres speciaux).
 */
export const buildZengoId = (organizationCode: string, sequence: number): string => {
  const code = organizationCode
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
    .slice(0, 8);
  return `ZGO-${code}-${String(sequence).padStart(6, '0')}`;
};

/** Normalise un numero de telephone (conserve le `+` initial). */
export const normalizePhone = (phone: string): string => {
  const trimmed = phone.trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  return hasPlus ? `+${digits}` : digits;
};

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();
