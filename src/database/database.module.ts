import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { buildPostgresOptions } from '@database/data-source';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService): TypeOrmModuleOptions => {
        // La configuration applicative (deja validee) prime sur l'environnement brut.
        const defaults = buildPostgresOptions();
        return {
          type: 'postgres',
          host: config.get<string>('app.database.host') ?? defaults.host,
          port: config.get<number>('app.database.port') ?? defaults.port,
          username: config.get<string>('app.database.username') ?? defaults.username,
          password: config.get<string>('app.database.password') ?? defaults.password,
          database: config.get<string>('app.database.name') ?? defaults.database,
          synchronize: config.get<boolean>('app.database.synchronize') ?? defaults.synchronize,
          logging: config.get<boolean>('app.database.logging') ?? defaults.logging,
          ssl: defaults.ssl,
          entities: defaults.entities,
          migrations: defaults.migrations,
          migrationsTableName: defaults.migrationsTableName,
          autoLoadEntities: true,
          retryAttempts: 5,
          retryDelay: 3_000,
        };
      },
    }),
  ],
})
export class DatabaseModule {}
