import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { TelephonyEvent } from '@common/bus/telephony-event.bus';
import { VoiceCallStatus } from '@common/enums/alert.enum';
import { normalizeDtmf } from '@modules/telephony/dtmf.util';
import { PlacedCall, PlaceCallRequest, TelephonyProvider } from '@modules/telephony/telephony.provider';
import { toSpeechLanguage } from '@modules/telephony/tts-language.util';
import { RenderedVoiceScript } from '@modules/telephony/voice-scripts';

interface TwilioConfig {
  accountSid: string;
  authToken: string;
  fromNumber: string;
}

const TWILIO_API = 'https://api.twilio.com/2010-04-01';

/**
 * Fournisseur Twilio (TwiML + <Gather> DTMF, ou reconnaissance vocale).
 *
 * Configuration requise :
 *   TELEPHONY_PROVIDER=TWILIO
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER
 *   TELEPHONY_WEBHOOK_BASE_URL (URL publique joignant cette API)
 *
 * Aucun SDK n'est necessaire : l'API REST est appelee directement.
 */
@Injectable()
export class TwilioTelephonyProvider implements TelephonyProvider {
  readonly name = 'TWILIO';
  private readonly logger = new Logger(TwilioTelephonyProvider.name);

  constructor(private readonly configService: ConfigService) {}

  /** Verifie que la configuration est complete (appele par la fabrique du module). */
  assertConfigured(): void {
    const missing = (['accountSid', 'authToken', 'fromNumber'] as const).filter(
      (key) => !this.readConfig()[key],
    );
    const envKeys: Record<(typeof missing)[number], string> = {
      accountSid: 'TWILIO_ACCOUNT_SID',
      authToken: 'TWILIO_AUTH_TOKEN',
      fromNumber: 'TWILIO_FROM_NUMBER',
    };

    if (missing.length > 0) {
      throw new Error(
        `Fournisseur TWILIO selectionne mais configuration incomplete : ${missing
          .map((key) => envKeys[key])
          .join(', ')}.`,
      );
    }
    if (!this.configService.get<string>('app.telephony.webhookBaseUrl')) {
      throw new Error(
        'Fournisseur TWILIO selectionne mais TELEPHONY_WEBHOOK_BASE_URL est absent : Twilio ne pourrait pas rappeler l API.',
      );
    }
  }

  async placeCall(request: PlaceCallRequest): Promise<PlacedCall> {
    const config = this.readConfig();
    const answerUrl = `${request.webhookBaseUrl}/voice-calls/twiml/${request.reference}`;
    const statusUrl = `${request.webhookBaseUrl}/voice-calls/webhooks/twilio/status?ref=${encodeURIComponent(request.reference)}`;

    const body = new URLSearchParams({
      To: request.toNumber,
      From: config.fromNumber,
      Url: answerUrl,
      StatusCallback: statusUrl,
      StatusCallbackEvent: 'initiated ringing answered completed',
      StatusCallbackMethod: 'POST',
      Timeout: '20',
    });

    const response = await fetch(`${TWILIO_API}/Accounts/${config.accountSid}/Calls.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Twilio a refuse l appel (${response.status}) : ${detail.slice(0, 300)}`);
    }

    const payload = (await response.json()) as { sid?: string; status?: string };
    this.logger.log(`Appel Twilio cree (${payload.sid}) vers ${request.toNumber}.`);

    return {
      providerCallId: payload.sid ?? `twilio-${request.reference}`,
      status: this.mapStatus(payload.status ?? 'queued'),
    };
  }

  parseWebhook(
    kind: 'status' | 'input',
    body: Record<string, unknown>,
    query: Record<string, unknown>,
  ): TelephonyEvent | null {
    const providerCallId = typeof body.CallSid === 'string' ? body.CallSid : null;
    const reference = String(body.reference ?? query.ref ?? '') || null;
    const receivedAt = new Date();

    if (kind === 'status') {
      return {
        kind: 'call_status',
        provider: this.name,
        providerCallId,
        reference,
        status: this.mapStatus(String(body.CallStatus ?? 'failed')),
        durationSeconds: this.parseDuration(body.CallDuration),
        recordingUrl: typeof body.RecordingUrl === 'string' ? body.RecordingUrl : null,
        raw: body,
        receivedAt,
      };
    }

    const digits = normalizeDtmf(body.Digits);
    const speech = typeof body.SpeechResult === 'string' ? body.SpeechResult : null;
    if (!digits && !speech) return null;

    return {
      kind: 'call_input',
      provider: this.name,
      providerCallId,
      reference,
      dtmfDigit: digits,
      speechResult: speech,
      raw: body,
      receivedAt,
    };
  }

  buildTwiMl(
    script: RenderedVoiceScript,
    fileName: 'question' | 'notMe' | 'itIsMe' | 'noInput',
  ): string {
    const speechLanguage = toSpeechLanguage(script.language);

    if (fileName === 'question') {
      const intro = escapeXml(`${script.greeting} ${script.situation} ${script.question} ${script.dtmfPrompt}`);
      return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<Response>',
        `  <Gather input="dtmf speech" numDigits="1" timeout="6" speechTimeout="auto" language="${speechLanguage}" actionOnEmptyResult="true">`,
        `    <Say language="${speechLanguage}">${intro}</Say>`,
        '  </Gather>',
        `  <Say language="${speechLanguage}">${escapeXml(script.noInput)}</Say>`,
        '  <Hangup/>',
        '</Response>',
      ].join('\n');
    }

    const text = fileName === 'notMe' ? script.notMe : fileName === 'itIsMe' ? script.itIsMe : script.noInput;
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<Response>',
      `  <Say language="${speechLanguage}">${escapeXml(text)}</Say>`,
      '  <Hangup/>',
      '</Response>',
    ].join('\n');
  }

  /**
   * Valide la signature `X-Twilio-Signature` (HMAC-SHA1 de l URL + parametres
   * tries, encode en base64). Protege les webhooks, qui sont necessairement
   * accessibles sans JWT.
   */
  verifyWebhook(url: string, params: Record<string, unknown>, signature: string | undefined): boolean {
    const { authToken } = this.readConfig();
    if (!authToken || !signature) return false;

    const payload = Object.keys(params)
      .sort()
      .reduce((acc, key) => acc + key + String(params[key]), url);

    const expected = createHmac('sha1', authToken).update(Buffer.from(payload, 'utf8')).digest('base64');

    const expectedBuffer = Buffer.from(expected);
    const providedBuffer = Buffer.from(signature);
    if (expectedBuffer.length !== providedBuffer.length) return false;
    return timingSafeEqual(expectedBuffer, providedBuffer);
  }

  private readConfig(): TwilioConfig {
    return {
      accountSid: this.configService.get<string>('app.telephony.twilio.accountSid') ?? '',
      authToken: this.configService.get<string>('app.telephony.twilio.authToken') ?? '',
      fromNumber: this.configService.get<string>('app.telephony.twilio.fromNumber') ?? '',
    };
  }

  private mapStatus(raw: string): VoiceCallStatus {
    switch (raw.toLowerCase()) {
      case 'queued':
        return VoiceCallStatus.QUEUED;
      case 'initiated':
      case 'ringing':
        return VoiceCallStatus.RINGING;
      case 'in-progress':
        return VoiceCallStatus.IN_PROGRESS;
      case 'completed':
        return VoiceCallStatus.COMPLETED;
      case 'no-answer':
        return VoiceCallStatus.NO_ANSWER;
      case 'busy':
        return VoiceCallStatus.BUSY;
      default:
        return VoiceCallStatus.FAILED;
    }
  }

  private parseDuration(value: unknown): number | null {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    return Number.isNaN(parsed) ? null : parsed;
  }
}

const escapeXml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
