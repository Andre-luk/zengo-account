import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { AlertVoiceCallService } from '@modules/alerts/alert-voice-call.service';
import { AlertsService } from '@modules/alerts/alerts.service';

const ESCALATION_INTERVAL_NAME = 'alerts-escalation-watchdog';

/**
 * Taches planifiees du Zengo Monitoring Center.
 *
 * 1. **Watchdog d'escalade** : implemente la regle du cahier des charges
 *    « Si aucune action dans les 5 minutes, le systeme declenche
 *    automatiquement l'envoi a toutes les equipes actives du point de
 *    distribution » (`ALERT_ESCALATION_SECONDS`).
 * 2. **Watchdog d'appel** : cloture les appels vocaux restes sans reponse afin
 *    qu'une alerte ne reste pas indefiniment en attente d'un retour client.
 *
 * La cadence est lue dans la configuration a l'initialisation ; chaque
 * execution est protegee contre le chevauchement.
 */
@Injectable()
export class AlertsTasks implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AlertsTasks.name);
  private escalationRunning = false;
  private voiceCallRunning = false;

  constructor(
    private readonly alertsService: AlertsService,
    private readonly alertVoiceCall: AlertVoiceCallService,
    private readonly configService: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  onModuleInit(): void {
    const intervalSeconds = this.configService.get<number>('app.alerts.watchdogIntervalSeconds', 30);

    const handle = setInterval(() => {
      void this.runWatchdogs();
    }, intervalSeconds * 1_000);

    this.schedulerRegistry.addInterval(ESCALATION_INTERVAL_NAME, handle);
    this.logger.log(
      `Watchdog du ZMC actif toutes les ${intervalSeconds}s (escalade apres ${this.configService.get<number>(
        'app.alerts.escalationSeconds',
        300,
      )}s sans action).`,
    );
  }

  onModuleDestroy(): void {
    if (this.schedulerRegistry.doesExist('interval', ESCALATION_INTERVAL_NAME)) {
      this.schedulerRegistry.deleteInterval(ESCALATION_INTERVAL_NAME);
    }
  }

  /** Execute les deux watchdogs (expose pour les tests et l'administration). */
  async runWatchdogs(): Promise<void> {
    await this.escalateOverdueAlerts();
    await this.expireStaleVoiceCalls();
  }

  private async escalateOverdueAlerts(): Promise<void> {
    if (this.escalationRunning) return;
    this.escalationRunning = true;
    try {
      const escalated = await this.alertsService.escalateOverdue();
      if (escalated > 0) {
        this.logger.warn(`${escalated} alerte(s) escaladee(s) automatiquement.`);
      }
    } catch (error) {
      this.logger.error(
        `Echec du watchdog d'escalade : ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.escalationRunning = false;
    }
  }

  private async expireStaleVoiceCalls(): Promise<void> {
    if (this.voiceCallRunning) return;
    this.voiceCallRunning = true;
    try {
      const expired = await this.alertVoiceCall.expireStaleCalls();
      if (expired > 0) {
        this.logger.log(`${expired} appel(s) vocal(aux) clos faute de reponse.`);
      }
    } catch (error) {
      this.logger.error(
        `Echec du watchdog d'appel : ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.voiceCallRunning = false;
    }
  }
}
