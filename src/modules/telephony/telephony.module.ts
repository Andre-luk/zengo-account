import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { StubTelephonyProvider } from '@modules/telephony/providers/stub.provider';
import { TwilioTelephonyProvider } from '@modules/telephony/providers/twilio.provider';
import { TELEPHONY_PROVIDER } from '@modules/telephony/telephony.provider';
import { VoiceWebhooksController } from '@modules/telephony/voice-webhooks.controller';

const STUB_ALLOWED_ENVIRONMENTS = ['development', 'test'];

/**
 * Module de telephonie — volontairement sans dependance au domaine metier.
 *
 * Il sait uniquement : composer un appel, normaliser un webhook, produire du
 * TwiML. L'orchestration (quel appel pour quelle alerte, que faire de la
 * reponse) appartient au module alertes, qui consomme `TelephonyEventBus`.
 */
@Module({
  imports: [ConfigModule],
  controllers: [VoiceWebhooksController],
  providers: [
    StubTelephonyProvider,
    TwilioTelephonyProvider,
    {
      provide: TELEPHONY_PROVIDER,
      inject: [ConfigService, StubTelephonyProvider, TwilioTelephonyProvider],
      useFactory: (
        configService: ConfigService,
        stub: StubTelephonyProvider,
        twilio: TwilioTelephonyProvider,
      ) => {
        const selected = (configService.get<string>('app.telephony.provider') ?? 'STUB').toUpperCase();
        const nodeEnv = configService.get<string>('app.nodeEnv') ?? 'development';

        if (selected === 'TWILIO') {
          twilio.assertConfigured();
          return twilio;
        }

        if (!STUB_ALLOWED_ENVIRONMENTS.includes(nodeEnv)) {
          throw new Error(
            `TELEPHONY_PROVIDER=STUB est interdit en environnement "${nodeEnv}" : les appels d alerte ne partiraient jamais.`,
          );
        }

        return stub;
      },
    },
  ],
  exports: [TELEPHONY_PROVIDER, TwilioTelephonyProvider],
})
export class TelephonyModule {}
