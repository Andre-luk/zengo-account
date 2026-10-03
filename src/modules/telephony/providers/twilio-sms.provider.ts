import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  mapProviderStatus,
  SendSmsRequest,
  SentSms,
  SmsDeliveryReport,
  SmsProvider,
} from '@modules/telephony/sms.provider';

interface TwilioSmsConfig {
  accountSid: string;
  authToken: string;
  fromNumber: string;
  messagingServiceSid: string;
}

const TWILIO_API = 'https://api.twilio.com/2010-04-01';

/**
 * Passerelle SMS Twilio.
 *
 * Configuration requise :
 *   SMS_PROVIDER=TWILIO
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN
 *   TWILIO_SMS_FROM (numero expediteur) ou TWILIO_MESSAGING_SERVICE_SID
 *   SMS_STATUS_CALLBACK_URL (URL publique recevant les accuses de remise)
 *
 * Aucun SDK n'est necessaire : l'API REST est appelee directement, comme pour
 * les appels vocaux.
 */
@Injectable()
export class TwilioSmsProvider implements SmsProvider {
  readonly name = 'TWILIO';
  private readonly logger = new Logger(TwilioSmsProvider.name);

  constructor(private readonly configService: ConfigService) {}

  assertConfigured(): void {
    const config = this.readConfig();
    if (!config.accountSid || !config.authToken) {
      throw new Error(
        'Fournisseur SMS TWILIO selectionne mais TWILIO_ACCOUNT_SID ou TWILIO_AUTH_TOKEN est absent.',
      );
    }
    if (!config.fromNumber && !config.messagingServiceSid) {
      throw new Error(
        'Fournisseur SMS TWILIO selectionne mais TWILIO_SMS_FROM et TWILIO_MESSAGING_SERVICE_SID sont tous les deux absents.',
      );
    }
  }

  async send(request: SendSmsRequest): Promise<SentSms> {
    const config = this.readConfig();
    const body = new URLSearchParams({
      To: request.toNumber,
      Body: request.body,
    });

    if (config.messagingServiceSid) {
      body.set('MessagingServiceSid', config.messagingServiceSid);
    } else {
      body.set('From', config.fromNumber);
    }

    if (request.statusCallbackUrl) {
      body.set('StatusCallback', request.statusCallbackUrl);
    }

    const response = await fetch(`${TWILIO_API}/Accounts/${config.accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Twilio a refuse le SMS (${response.status}) : ${detail.slice(0, 300)}`);
    }

    const payload = (await response.json()) as {
      sid?: string;
      status?: string;
      from?: string;
      num_segments?: string;
      price?: string | null;
      error_code?: number | null;
      error_message?: string | null;
    };

    if (!payload.sid) {
      throw new Error('Twilio a accepte la requete sans renvoyer d identifiant de message.');
    }

    return {
      providerMessageId: payload.sid,
      status: mapProviderStatus(payload.status ?? 'sent'),
      fromNumber: payload.from ?? request.toNumber,
      segments: payload.num_segments ? Number(payload.num_segments) : null,
      costUsd: payload.price ? payload.price.replace('-', '') : null,
    };
  }

  parseDeliveryReport(body: Record<string, unknown>): SmsDeliveryReport | null {
    const providerMessageId = typeof body.MessageSid === 'string' ? body.MessageSid : null;
    if (!providerMessageId) {
      this.logger.warn('Accuse de remise SMS recu sans MessageSid : requete ignoree.');
      return null;
    }

    const errorCode = typeof body.ErrorCode === 'string' ? body.ErrorCode : null;
    return {
      providerMessageId,
      status: mapProviderStatus(
        typeof body.MessageStatus === 'string' ? body.MessageStatus : 'unknown',
      ),
      errorCode,
      errorMessage: typeof body.ErrorMessage === 'string' ? body.ErrorMessage.slice(0, 512) : null,
      costUsd: typeof body.Price === 'string' ? body.Price.replace('-', '') : null,
    };
  }

  private readConfig(): TwilioSmsConfig {
    return {
      accountSid: this.configService.get<string>('app.telephony.accountSid') ?? '',
      authToken: this.configService.get<string>('app.telephony.authToken') ?? '',
      fromNumber: this.configService.get<string>('app.sms.fromNumber') ?? '',
      messagingServiceSid:
        this.configService.get<string>('app.sms.messagingServiceSid') ?? '',
    };
  }
}
