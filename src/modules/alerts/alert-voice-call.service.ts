import { Inject, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { Subscription } from 'rxjs';
import { TelephonyEvent, TelephonyEventBus } from '@common/bus/telephony-event.bus';
import {
  AlertEventType,
  AlertType,
  VoiceCallDtmf,
  VoiceCallOutcome,
  VoiceCallStatus,
} from '@common/enums/alert.enum';
import { ClientProfile } from '@database/entities/client-profile.entity';
import { Alert } from '@database/entities/alert.entity';
import { VoiceCall } from '@database/entities/voice-call.entity';import { AlertLifecycleService } from '@modules/alerts/alert-lifecycle.service';
import { interpretSpeechIntent } from '@modules/telephony/dtmf.util';
import { TELEPHONY_PROVIDER, TelephonyProvider } from '@modules/telephony/telephony.provider';
import { renderVoiceScript } from '@modules/telephony/voice-scripts';

/**
 * Orchestration de l'appel vocal IA multilingue.
 *
 * Sequence du cahier des charges : la plateforme appelle le client dans sa
 * langue, lui demande s'il est a l'origine du declenchement, et agit :
 *   - « non »  -> alerte confirmee, escalade immediate vers les equipes ;
 *   - « oui »  -> conseil de desarmement et cloture de l'alerte ;
 *   - silence -> la temporisation de 5 minutes du watchdog s'applique.
 */
@Injectable()
export class AlertVoiceCallService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AlertVoiceCallService.name);
  private subscription: Subscription | null = null;

  constructor(
    @InjectRepository(VoiceCall)
    private readonly voiceCallRepository: Repository<VoiceCall>,
    @InjectRepository(ClientProfile)
    private readonly clientRepository: Repository<ClientProfile>,
    @InjectRepository(Alert)
    private readonly alertRepository: Repository<Alert>,
    @Inject(TELEPHONY_PROVIDER)
    private readonly telephonyProvider: TelephonyProvider,
    private readonly alertLifecycle: AlertLifecycleService,
    private readonly configService: ConfigService,
    private readonly telephonyEventBus: TelephonyEventBus,
  ) {}

  onModuleInit(): void {
    this.subscription = this.telephonyEventBus.subscribe((event) => {
      void this.handleTelephonyEvent(event);
    });
  }

  onModuleDestroy(): void {
    this.subscription?.unsubscribe();
  }

  // ---------------------------------------------------------------------------
  // Emission d'un appel
  // ---------------------------------------------------------------------------

  async startForAlert(alert: Alert): Promise<VoiceCall | null> {
    const client =
      alert.client ?? (alert.clientId ? await this.clientRepository.findOne({ where: { id: alert.clientId } }) : null);

    if (!client?.primaryPhone) {
      this.logger.warn(`Alerte ${alert.reference} : aucun numero de telephone exploitable, appel non declenche.`);
      return null;
    }

    const script = renderVoiceScript(alert.type, client.preferredLanguage);

    let voiceCall = await this.voiceCallRepository.save(
      this.voiceCallRepository.create({
        alertId: alert.id,
        clientId: client.id,
        language: script.language,
        provider: this.telephonyProvider.name,
        toNumber: client.primaryPhone,
        status: VoiceCallStatus.QUEUED,
        scriptKey: script.key,
        attemptNumber: 1,
      }),
    );

    try {
      const placed = await this.telephonyProvider.placeCall({
        toNumber: client.primaryPhone,
        script,
        reference: voiceCall.id,
        webhookBaseUrl: this.configService.get<string>('app.telephony.publicBaseUrl') ?? '',
      });

      voiceCall.providerCallId = placed.providerCallId;
      voiceCall.status = placed.status ?? VoiceCallStatus.RINGING;
      voiceCall.startedAt = new Date();
      voiceCall = await this.voiceCallRepository.save(voiceCall);
    } catch (error) {
      voiceCall.status = VoiceCallStatus.FAILED;
      voiceCall.outcome = VoiceCallOutcome.FAILED;
      voiceCall.endedAt = new Date();
      voiceCall.errorMessage = error instanceof Error ? error.message : String(error);
      voiceCall = await this.voiceCallRepository.save(voiceCall);

      this.logger.error(`Echec de l'appel vocal pour l'alerte ${alert.reference} : ${voiceCall.errorMessage}`);
    }

    await this.alertLifecycle.recordEvent(alert.id, AlertEventType.VOICE_CALL_STARTED, {
      message: `Appel vocal IA declenche en ${script.language} vers ${client.primaryPhone} (${this.telephonyProvider.name}).`,
      data: { voiceCallId: voiceCall.id, provider: this.telephonyProvider.name, language: script.language },
    });

    alert.voiceCallLanguage = script.language;
    await this.alertLifecycle.save(alert);
    this.alertLifecycle.publish('voice_call.updated', alert, {
      voiceCallId: voiceCall.id,
      status: voiceCall.status,
      language: script.language,
    });

    return voiceCall;
  }

  // ---------------------------------------------------------------------------
  // Traitement des evenements du fournisseur
  // ---------------------------------------------------------------------------

  private async handleTelephonyEvent(event: TelephonyEvent): Promise<void> {
    const voiceCall = await this.resolveVoiceCall(event);
    if (!voiceCall) {
      this.logger.warn(
        `Evenement de telephonie orphelin (ref=${event.reference ?? '-'}, call=${event.providerCallId ?? '-'}).`,
      );
      return;
    }

    if (event.kind === 'call_status') {
      await this.applyCallStatus(voiceCall, event);
    } else {
      await this.applyCallInput(voiceCall, event);
    }
  }

  private async resolveVoiceCall(event: TelephonyEvent): Promise<VoiceCall | null> {
    if (event.reference) {
      const byReference = await this.voiceCallRepository.findOne({ where: { id: event.reference } });
      if (byReference) return byReference;
    }
    if (event.providerCallId) {
      return this.voiceCallRepository.findOne({ where: { providerCallId: event.providerCallId } });
    }
    return null;
  }

  private async applyCallStatus(voiceCall: VoiceCall, event: TelephonyEvent): Promise<void> {
    const previousStatus = voiceCall.status;
    voiceCall.status = event.status ?? voiceCall.status;
    if (event.durationSeconds !== null && event.durationSeconds !== undefined) {
      voiceCall.durationSeconds = event.durationSeconds;
    }
    if (event.recordingUrl) voiceCall.recordingUrl = event.recordingUrl;

    const terminal: VoiceCallStatus[] = [
      VoiceCallStatus.COMPLETED,
      VoiceCallStatus.NO_ANSWER,
      VoiceCallStatus.BUSY,
      VoiceCallStatus.FAILED,
    ];
    if (terminal.includes(voiceCall.status)) {
      voiceCall.endedAt = voiceCall.endedAt ?? new Date();
      if (!voiceCall.outcome) {
        voiceCall.outcome =
          voiceCall.status === VoiceCallStatus.COMPLETED
            ? VoiceCallOutcome.PARTIAL
            : this.mapStatusToOutcome(voiceCall.status);
      }
    }

    const saved = await this.voiceCallRepository.save(voiceCall);

    if (previousStatus !== saved.status) {
      await this.alertLifecycle.recordEvent(saved.alertId as string, AlertEventType.VOICE_CALL_UPDATED, {
        message: `Appel vocal : ${saved.status}${saved.durationSeconds !== null ? ` (${saved.durationSeconds}s)` : ''}.`,
        data: { status: saved.status, durationSeconds: saved.durationSeconds },
      });
    }

    if (saved.alertId) {
      const alert = await this.alertLifecycle.loadAlert(saved.alertId);
      if (alert) {
        if (terminal.includes(saved.status) && saved.outcome) {
          await this.alertLifecycle.applyClientConfirmation(alert, saved.outcome);
        }
        this.alertLifecycle.publish('voice_call.updated', alert, {
          voiceCallId: saved.id,
          status: saved.status,
          outcome: saved.outcome,
        });
      }
    }
  }

  private async applyCallInput(voiceCall: VoiceCall, event: TelephonyEvent): Promise<void> {
    voiceCall.status = VoiceCallStatus.IN_PROGRESS;
    voiceCall.dtmfDigit = event.dtmfDigit ?? voiceCall.dtmfDigit;
    voiceCall.transcript = event.speechResult ?? voiceCall.transcript;

    let outcome: VoiceCallOutcome | null = null;
    if (event.dtmfDigit === VoiceCallDtmf.NOT_ME) {
      voiceCall.detectedIntent = 'not_me';
      outcome = VoiceCallOutcome.INTRUSION_CONFIRMED;
    } else if (event.dtmfDigit === VoiceCallDtmf.IT_IS_ME) {
      voiceCall.detectedIntent = 'it_is_me';
      outcome = VoiceCallOutcome.CONFIRMED_BY_CLIENT;
    } else {
      const intent = interpretSpeechIntent(event.speechResult);
      if (intent === 'not_me') {
        voiceCall.detectedIntent = 'not_me';
        outcome = VoiceCallOutcome.INTRUSION_CONFIRMED;
      } else if (intent === 'it_is_me') {
        voiceCall.detectedIntent = 'it_is_me';
        outcome = VoiceCallOutcome.CONFIRMED_BY_CLIENT;
      } else {
        voiceCall.detectedIntent = 'unclear';
        outcome = VoiceCallOutcome.PARTIAL;
      }
    }

    if (outcome) voiceCall.outcome = outcome;
    if (!voiceCall.endedAt && outcome !== VoiceCallOutcome.PARTIAL) {
      voiceCall.endedAt = new Date();
      voiceCall.status = VoiceCallStatus.COMPLETED;
    }

    const saved = await this.voiceCallRepository.save(voiceCall);
    if (!saved.alertId) return;

    const alert = await this.alertLifecycle.loadAlertOrFail(saved.alertId);
    const updated = await this.alertLifecycle.applyClientConfirmation(alert, saved.outcome ?? VoiceCallOutcome.PARTIAL);

    await this.alertLifecycle.recordEvent(updated.id, AlertEventType.VOICE_CALL_COMPLETED, {
      message:
        saved.detectedIntent === 'not_me'
          ? "Le client a indique que le declenchement n'est pas de son fait."
          : saved.detectedIntent === 'it_is_me'
            ? "Le client a confirme etre a l'origine du declenchement ; conseil de desarmement donne."
            : `Reponse du client non exploitable (touche=${saved.dtmfDigit ?? '-'}).`,
      data: { dtmf: saved.dtmfDigit, intent: saved.detectedIntent, outcome: saved.outcome },
    });

    this.alertLifecycle.publish('voice_call.updated', updated, {
      voiceCallId: saved.id,
      status: saved.status,
      outcome: saved.outcome,
      intent: saved.detectedIntent,
    });

    // Alerte confirmee par le client : intervention immediate, sans attendre la temporisation.
    if (saved.outcome === VoiceCallOutcome.INTRUSION_CONFIRMED) {
      await this.alertLifecycle.escalate(updated, {
        reason: "Declenchement confirme par le client lors de l'appel vocal IA.",
        automatic: true,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Watchdog des appels sans reponse
  // ---------------------------------------------------------------------------

  /** Cloture les appels restes sans reponse au-dela du delai configure. */
  async expireStaleCalls(): Promise<number> {
    const timeoutSeconds = this.configService.get<number>('app.telephony.callTimeoutSeconds', 45);
    const threshold = new Date(Date.now() - timeoutSeconds * 1_000);

    const stale = await this.voiceCallRepository.find({
      where: [
        { status: VoiceCallStatus.QUEUED, createdAt: LessThan(threshold) },
        { status: VoiceCallStatus.RINGING, createdAt: LessThan(threshold) },
        { status: VoiceCallStatus.IN_PROGRESS, createdAt: LessThan(threshold) },
      ],
    });

    for (const call of stale) {
      call.status = VoiceCallStatus.NO_ANSWER;
      call.outcome = call.outcome ?? VoiceCallOutcome.NO_ANSWER;
      call.endedAt = call.endedAt ?? new Date();
      await this.voiceCallRepository.save(call);

      if (call.alertId) {
        await this.alertLifecycle.recordEvent(call.alertId, AlertEventType.VOICE_CALL_UPDATED, {
          message: "Appel vocal sans reponse : le delai d'attente est depasse.",
          data: { voiceCallId: call.id },
        });
        const alert = await this.alertLifecycle.loadAlert(call.alertId);
        if (alert) {
          this.alertLifecycle.publish('voice_call.updated', alert, {
            voiceCallId: call.id,
            status: call.status,
            outcome: call.outcome,
          });
        }
      }
    }

    return stale.length;
  }

  async listForAlert(alertId: string): Promise<VoiceCall[]> {
    return this.voiceCallRepository.find({ where: { alertId }, order: { createdAt: 'DESC' } });
  }

  async findVoiceCallOrFail(voiceCallId: string): Promise<VoiceCall> {
    const voiceCall = await this.voiceCallRepository.findOne({ where: { id: voiceCallId } });
    if (!voiceCall) throw new NotFoundException('Appel introuvable.');
    return voiceCall;
  }

  // ---------------------------------------------------------------------------
  // Soumission directe d'une reponse (action TwiML, simulation, tests)
  // ---------------------------------------------------------------------------

  async submitClientInput(
    voiceCallId: string,
    input: { dtmf?: string | null; speech?: string | null; providerCallId?: string | null },
  ): Promise<VoiceCall | null> {
    const voiceCall = await this.voiceCallRepository.findOne({ where: { id: voiceCallId } });
    if (!voiceCall) return null;

    await this.applyCallInput(voiceCall, {
      kind: 'call_input',
      provider: voiceCall.provider,
      providerCallId: input.providerCallId ?? voiceCall.providerCallId,
      reference: voiceCall.id,
      dtmfDigit: input.dtmf ?? null,
      speechResult: input.speech ?? null,
      receivedAt: new Date(),
    });

    return this.voiceCallRepository.findOne({ where: { id: voiceCallId } });
  }

  async applyCallStatusById(voiceCallId: string, status: VoiceCallStatus, durationSeconds?: number | null) {
    const voiceCall = await this.voiceCallRepository.findOne({ where: { id: voiceCallId } });
    if (!voiceCall) return null;

    await this.applyCallStatus(voiceCall, {
      kind: 'call_status',
      provider: voiceCall.provider,
      providerCallId: voiceCall.providerCallId,
      reference: voiceCall.id,
      status,
      durationSeconds: durationSeconds ?? null,
      receivedAt: new Date(),
    });

    return this.voiceCallRepository.findOne({ where: { id: voiceCallId } });
  }

  // ---------------------------------------------------------------------------
  // Reponses TwiML (Twilio rappelle l'API a chaque etape de l'appel)
  // ---------------------------------------------------------------------------

  /** TwiML joue a la decroche : situation, question et invite clavier. */
  async buildQuestionTwiMl(voiceCallId: string): Promise<string> {
    const voiceCall = await this.findVoiceCallOrFail(voiceCallId);

    // Si le client a deja repondu (reprise d'appel, relance du fournisseur),
    // on renvoie directement le message de cloture.
    if (voiceCall.outcome) {
      return this.buildClosingTwiMl(voiceCallId);
    }

    const script = await this.resolveScriptFor(voiceCall);
    voiceCall.status = VoiceCallStatus.IN_PROGRESS;
    voiceCall.startedAt = voiceCall.startedAt ?? new Date();
    await this.voiceCallRepository.save(voiceCall);
    return this.telephonyProvider.buildTwiMl(script, 'question');
  }

  /** TwiML de cloture, adapte a la reponse recue (ou a l'absence de reponse). */
  async buildClosingTwiMl(voiceCallId: string): Promise<string> {
    const voiceCall = await this.findVoiceCallOrFail(voiceCallId);
    const script = await this.resolveScriptFor(voiceCall);

    if (voiceCall.outcome === VoiceCallOutcome.INTRUSION_CONFIRMED) {
      return this.telephonyProvider.buildTwiMl(script, 'notMe');
    }
    if (voiceCall.outcome === VoiceCallOutcome.CONFIRMED_BY_CLIENT) {
      return this.telephonyProvider.buildTwiMl(script, 'itIsMe');
    }
    return this.telephonyProvider.buildTwiMl(script, 'noInput');
  }

  private async resolveScriptFor(voiceCall: VoiceCall) {
    const client =
      voiceCall.client ??
      (voiceCall.clientId ? await this.clientRepository.findOne({ where: { id: voiceCall.clientId } }) : null);

    const alert = voiceCall.alert ?? (voiceCall.alertId ? await this.alertRepository.findOne({ where: { id: voiceCall.alertId } }) : null);

    const alertType = alert?.type ?? AlertType.INTRUSION;
    const language = client?.preferredLanguage ?? voiceCall.language;
    return renderVoiceScript(alertType, language);
  }

  private mapStatusToOutcome(status: VoiceCallStatus): VoiceCallOutcome {
    switch (status) {
      case VoiceCallStatus.NO_ANSWER:
      case VoiceCallStatus.BUSY:
        return VoiceCallOutcome.NO_ANSWER;
      default:
        return VoiceCallOutcome.FAILED;
    }
  }

  /** Types d'alerte pour lesquels un appel vocal est pertinent. */
  static isVoiceCallSupported(type: AlertType): boolean {
    return [
      AlertType.INTRUSION,
      AlertType.FIRE,
      AlertType.MEDICAL,
      AlertType.SABOTAGE,
      AlertType.GAS_LEAK,
      AlertType.PANIC,
    ].includes(type);
  }
}
