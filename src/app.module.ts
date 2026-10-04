import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { BusModule } from '@common/bus/bus.module';
import { AllExceptionsFilter } from '@common/filters/all-exceptions.filter';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import configuration from '@config/configuration';
import { validateEnvironment } from '@config/validate-environment';
import { DatabaseModule } from '@database/database.module';
import { AlertsModule } from '@modules/alerts/alerts.module';
import { AuditModule } from '@modules/audit/audit.module';
import { AuthModule } from '@modules/auth/auth.module';
import { ClientsModule } from '@modules/clients/clients.module';
import { DevicesModule } from '@modules/devices/devices.module';
import { HealthModule } from '@modules/health/health.module';
import { HealthcareModule } from '@modules/healthcare/healthcare.module';
import { InterventionsModule } from '@modules/interventions/interventions.module';
import { ClientMutationsModule } from '@modules/mutations/client-mutations.module';
import { SubscriptionsModule } from '@modules/subscriptions/subscriptions.module';
import { IotModule } from '@modules/iot/iot.module';
import { OrganizationsModule } from '@modules/organizations/organizations.module';
import { RealtimeModule } from '@modules/realtime/realtime.module';
import { SimulationModule } from '@modules/simulation/simulation.module';
import { TariffsModule } from '@modules/tariffs/tariffs.module';
import { TelephonyModule } from '@modules/telephony/telephony.module';
import { UsersModule } from '@modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [configuration],
      validate: validateEnvironment,
      envFilePath: ['.env'],
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            name: 'default',
            ttl: config.get<number>('app.throttle.ttl', 60) * 1000,
            limit: config.get<number>('app.throttle.limit', 120),
          },
        ],
      }),
    }),
    DatabaseModule,
    BusModule,
    ScheduleModule.forRoot(),
    AuditModule,
    OrganizationsModule,
    UsersModule,
    AuthModule,
    ClientsModule,
    DevicesModule,
    TariffsModule,
    TelephonyModule,
    AlertsModule,
    InterventionsModule,
    SubscriptionsModule,
    ClientMutationsModule,
    HealthcareModule,
    SimulationModule,
    IotModule,
    RealtimeModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
