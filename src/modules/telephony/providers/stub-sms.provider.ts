import { Injectable, Logger } from '@nestjs/common';
import { SmsMessageStatus } from '@common/enums/sms.enum';
import {
  mapProviderStatus,
  SendSmsRequest,
  SentSms,
  SmsDeliveryReport,
  SmsProvider,
} from '@modules/telephony/sms.provider';

/**
 * Passerelle SMS de developpement : elle n'envoie rien et se contente de tracer.
 *
 * Autorisee uniquement en developpement et en test — comme pour la voix, la
 * fabrique du module refuse ce fournisseur en production, ou le client
 * croirait etre notifie alors qu'aucun SMS ne partirait.
 */
@Injectable()
export class StubSmsProvider implements SmsProvider {
  readonly name = 'STUB';
  private readonly logger = new Logger(StubSmsProvider.name);

  async send(request: SendSmsRequest): Promise<SentSms> {
    this.logger.log(
      `[SIMULATION] SMS ${request.template} vers ${request.toNumber} : ${request.body.slice(0, 120)}`,
    );

    return {
      providerMessageId: `stub-sms-${request.reference}`,
      status: SmsMessageStatus.SENT,
      fromNumber: '+243000000000',
      segments: null,
      costUsd: null,
    };
  }

  parseDeliveryReport(body: Record<string, unknown>): SmsDeliveryReport | null {
    const providerMessageId = typeof body.MessageSid === 'string' ? body.MessageSid : null;
    if (!providerMessageId) return null;

    return {
      providerMessageId,
      status: mapProviderStatus(typeof body.MessageStatus === 'string' ? body.MessageStatus : 'sent'),
      errorCode: typeof body.ErrorCode === 'string' ? body.ErrorCode : null,
      errorMessage:
        typeof body.ErrorMessage === 'string' ? body.ErrorMessage.slice(0, 512) : null,
      costUsd: typeof body.Price === 'string' ? body.Price.replace('-', '') : null,
    };
  }
}
