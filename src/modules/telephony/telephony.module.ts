import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { StubSmsProvider } from '@modules/telephony/providers/stub-sms.provider';
import { StubTelephonyProvider } from '@modules/telephony/providers/stub.provider';
import { TwilioSmsProvider } from '@modules/telephony/providers/twilio-sms.provider';
import { TwilioTelephonyProvider } from '@modules/telephony/providers/twilio.provider';
import { SMS_PROVIDER } from '@modules/telephony/sms.provider';
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
    StubSmsProvider,
    TwilioSmsProvider,
    {
      provide: SMS_PROVIDER,
      inject: [ConfigService, StubSmsProvider, TwilioSmsProvider],
      useFactory: (
        configService: ConfigService,
        stub: StubSmsProvider,
        twilio: TwilioSmsProvider,
      ) => {
        const selected = (configService.get<string>('app.sms.provider') ?? 'STUB').toUpperCase();
        const nodeEnv = configService.get<string>('app.nodeEnv') ?? 'development';

        if (selected === 'TWILIO') {
          twilio.assertConfigured();
          return twilio;
        }

        if (!STUB_ALLOWED_ENVIRONMENTS.includes(nodeEnv)) {
          throw new Error(
            `SMS_PROVIDER=STUB est interdit en environnement "${nodeEnv}" : aucun client ne serait notifie.`,
          );
        }

        return stub;
      },
    },
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
  exports: [TELEPHONY_PROVIDER, TwilioTelephonyProvider, SMS_PROVIDER, TwilioSmsProvider],
})
export class TelephonyModule {}
