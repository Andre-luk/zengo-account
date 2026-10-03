import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AlertGateway } from '@modules/realtime/alert.gateway';
import { UsersModule } from '@modules/users/users.module';

/**
 * Canal temps reel (Socket.IO) : diffuse les alertes aux consoles connectees.
 *
 * Le module ne publie jamais dans le domaine : il consomme `AlertEventBus`
 * (global) et s'appuie sur `UsersService` pour authentifier la poignee de main.
 */
@Module({
  imports: [
    UsersModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('app.jwt.accessSecret'),
      }),
    }),
  ],
  providers: [AlertGateway],
  exports: [AlertGateway],
})
export class RealtimeModule {}
