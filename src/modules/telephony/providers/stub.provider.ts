import { Injectable, Logger } from '@nestjs/common';
import { TelephonyEvent } from '@common/bus/telephony-event.bus';
import { VoiceCallStatus } from '@common/enums/alert.enum';
import { normalizeDtmf } from '@modules/telephony/dtmf.util';
import { toSpeechLanguage } from '@modules/telephony/tts-language.util';
import { PlacedCall, PlaceCallRequest, TelephonyProvider } from '@modules/telephony/telephony.provider';
import { RenderedVoiceScript } from '@modules/telephony/voice-scripts';

/**
 * Fournisseur local : aucun appel reel n'est emis.
 *
 * Le script qui aurait ete lu est journalise, et l'appel est ensuite pilote par
 * les *memes* webhooks que Twilio (`/voice-calls/webhooks/stub/...`), ce qui
 * permet de tester de bout en bout toute la chaine d'alerte sans compte
 * telephonique ni cout.
 */
@Injectable()
export class StubTelephonyProvider implements TelephonyProvider {
  readonly name = 'STUB';
  private readonly logger = new Logger(StubTelephonyProvider.name);

  async placeCall(request: PlaceCallRequest): Promise<PlacedCall> {
    const providerCallId = `stub-${request.reference}`;

    this.logger.log(
      `[SIMULATION] Appel vers ${request.toNumber} (${request.script.language}) : "${request.script.fullText}"`,
    );

    return { providerCallId, status: VoiceCallStatus.RINGING };
  }

  parseWebhook(
    kind: 'status' | 'input',
    body: Record<string, unknown>,
    query: Record<string, unknown>,
  ): TelephonyEvent | null {
    const providerCallId = String(body.CallSid ?? body.providerCallId ?? '') || null;
    const reference = String(body.reference ?? query.ref ?? '') || null;
    const receivedAt = new Date();

    if (kind === 'status') {
      const status = this.mapStatus(String(body.CallStatus ?? body.status ?? 'ringing'));
      return {
        kind: 'call_status',
        provider: this.name,
        providerCallId,
        reference,
        status,
        durationSeconds: parseDuration(body.CallDuration ?? body.duration),
        recordingUrl: typeof body.RecordingUrl === 'string' ? body.RecordingUrl : null,
        raw: body,
        receivedAt,
      };
    }

    const digits = normalizeDtmf(body.Digits ?? body.dtmf);
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
    const texts: Record<typeof fileName, string> = {
      question: `${script.greeting} ${script.situation} ${script.question} ${script.dtmfPrompt}`,
      notMe: script.notMe,
      itIsMe: script.itIsMe,
      noInput: script.noInput,
    };

    // TwiML compris par Twilio ; en mode STUB il sert de reference lisible.
    const speechLanguage = toSpeechLanguage(script.language);
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<Response>',
      `  <Say language="${speechLanguage}">${escapeXml(texts[fileName])}</Say>`,
      '</Response>',
    ].join('\n');
  }

  private mapStatus(raw: string): VoiceCallStatus {
    const value = raw.toLowerCase();
    switch (value) {
      case 'queued':
        return VoiceCallStatus.QUEUED;
      case 'ringing':
      case 'initiated':
        return VoiceCallStatus.RINGING;
      case 'in-progress':
      case 'in_progress':
        return VoiceCallStatus.IN_PROGRESS;
      case 'completed':
        return VoiceCallStatus.COMPLETED;
      case 'no-answer':
      case 'no_answer':
      case 'noanswer':
        return VoiceCallStatus.NO_ANSWER;
      case 'busy':
        return VoiceCallStatus.BUSY;
      default:
        return VoiceCallStatus.FAILED;
    }
  }
}

const parseDuration = (value: unknown): number | null => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isNaN(parsed) ? null : parsed;
};

const escapeXml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
