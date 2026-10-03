import 'reflect-metadata';
import { config as loadEnvironment } from 'dotenv';
import { DataSource, DataSourceOptions } from 'typeorm';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import { ENTITIES } from '@database/entities';

loadEnvironment();

const toInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const toBool = (value: string | undefined, fallback: boolean): boolean =>
  value === undefined ? fallback : ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());

/**
 * Options de connexion PostgreSQL, partagees entre le runtime NestJS et la CLI
 * TypeORM (generation / execution de migrations).
 */
export const buildPostgresOptions = (): PostgresConnectionOptions => ({
  type: 'postgres',
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: toInt(process.env.DB_PORT, 5432),
  username: process.env.DB_USERNAME ?? 'zengo',
  password: process.env.DB_PASSWORD ?? 'zengo',
  database: process.env.DB_NAME ?? 'zengo_account',
  entities: ENTITIES,
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  migrationsTableName: 'typeorm_migrations',
  synchronize: toBool(process.env.DB_SYNCHRONIZE, true),
  logging: toBool(process.env.DB_LOGGING, false),
  ssl: toBool(process.env.DB_SSL, false) ? { rejectUnauthorized: false } : false,
});

export const buildDataSourceOptions = (): DataSourceOptions => buildPostgresOptions();

/** Instance utilisee par la CLI TypeORM (`npm run migration:generate`, etc.). */
export default new DataSource(buildPostgresOptions());
