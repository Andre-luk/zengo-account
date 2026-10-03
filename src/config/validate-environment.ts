import { plainToInstance } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min, validateSync } from 'class-validator';

enum NodeEnv {
  Development = 'development',
  Test = 'test',
  Staging = 'staging',
  Production = 'production',
}

/**
 * Valide les variables d'environnement au demarrage : l'application refuse de
 * demarrer si la configuration est incoherente (ex. secret JWT manquant en prod).
 */
class EnvironmentVariables {
  @IsEnum(NodeEnv)
  @IsOptional()
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @IsInt()
  @Min(0)
  @Max(65535)
  @IsOptional()
  PORT = 3000;

  @IsString()
  @IsOptional()
  API_PREFIX = 'api/v1';

  @IsString()
  @IsOptional()
  DB_HOST = '127.0.0.1';

  @IsInt()
  @Min(0)
  @Max(65535)
  @IsOptional()
  DB_PORT = 5432;

  @IsString()
  @IsOptional()
  DB_USERNAME = 'zengo';

  @IsString()
  @IsOptional()
  DB_PASSWORD = 'zengo';

  @IsString()
  @IsOptional()
  DB_NAME = 'zengo_account';

  @IsString()
  @IsOptional()
  JWT_ACCESS_SECRET?: string;

  @IsString()
  @IsOptional()
  JWT_REFRESH_SECRET?: string;
}

/** Variables numeriques : converties explicitement avant validation. */
const NUMERIC_KEYS = [
  'PORT',
  'DB_PORT',
  'JWT_ACCESS_TTL',
  'JWT_REFRESH_TTL',
  'BCRYPT_SALT_ROUNDS',
  'THROTTLE_TTL',
  'THROTTLE_LIMIT',
] as const;

export function validateEnvironment(raw: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = { ...raw };
  for (const key of NUMERIC_KEYS) {
    const value = normalized[key];
    if (value === undefined || value === null || value === '') continue;
    const parsed = Number(value);
    normalized[key] = Number.isNaN(parsed) ? value : parsed;
  }

  const config = plainToInstance(EnvironmentVariables, normalized, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(config, { skipMissingProperties: false });

  if (errors.length > 0) {
    const details = errors
      .map((error) => Object.values(error.constraints ?? {}).join(', '))
      .join('\n  - ');
    throw new Error(`Configuration invalide :\n  - ${details}`);
  }

  if (config.NODE_ENV === NodeEnv.Production) {
    for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const) {
      const value = raw[key];
      if (typeof value !== 'string' || value.length < 32) {
        throw new Error(`Configuration invalide : ${key} doit contenir au moins 32 caracteres en production.`);
      }
    }
  }

  return normalized;
}
