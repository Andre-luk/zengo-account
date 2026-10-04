import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { HealthEventBus, HealthRealtimeEventType } from '@common/bus/health-event.bus';
import { HealthAccessService } from '@modules/healthcare/health-access.service';
import { HealthMeasurementsService } from '@modules/healthcare/health-measurements.service';
import { NurseRequestsService } from '@modules/healthcare/nurse-requests.service';

/** Nombre de jours sans mesure a partir duquel un client est relance. */
const FOLLOW_UP_DAYS = 30;

/**
 * Taches planifiees de l'e-sante connectee.
 *
 * Trois surveillances quotidiennes : les consentements arrives a echeance, les
 * clients suivis qui ne remontent plus de mesure (depistage interrompu) et les
 * demandes de soin non prises en charge qui depassent leur delai.
 */
@Injectable()
export class HealthcareTasks {
  private readonly logger = new Logger(HealthcareTasks.name);

  constructor(
    private readonly consents: HealthAccessService,
    private readonly measurements: HealthMeasurementsService,
    private readonly nurseRequests: NurseRequestsService,
    private readonly healthBus: HealthEventBus,
  ) {}

  /** Bascule les consentements echus : plus aucun acces n'est possible ensuite. */
  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async expireConsents(): Promise<void> {
    const expired = await this.consents.expireDueConsents();
    if (expired > 0) {
      this.logger.log(`${expired} consentement(s) de sante arrive(s) a echeance.`);
    }
  }

  /**
   * Relance les clients suivis devenus silencieux.
   *
   * La diffusion temps reel previent le personnel de sante : un dossier suivi
   * sans mesure pendant 30 jours signale un depistage interrompu.
   */
  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async remindSilentClients(): Promise<void> {
    const clientIds = await this.measurements.clientsWithoutRecentMeasurement(
      FOLLOW_UP_DAYS,
    );
    if (clientIds.length === 0) return;

    this.logger.log(
      `${clientIds.length} client(s) suivi(s) sans mesure depuis ${FOLLOW_UP_DAYS} jours.`,
    );
    this.healthBus.publish({
      type: HealthRealtimeEventType.MEASUREMENT_RECORDED,
      clientId: clientIds[0],
      clientName: `${clientIds.length} client(s)`,
      organizationId: null,
      entityId: null,
      reference: null,
      message: `${clientIds.length} client(s) suivi(s) sans mesure depuis ${FOLLOW_UP_DAYS} jours : relance du depistage conseillee.`,
      payload: { clientIds, followUpDays: FOLLOW_UP_DAYS },
      occurredAt: new Date().toISOString(),
    });
  }

  /**
   * Relance les demandes de soin non prises en charge au-dela de leur delai.
   *
   * Un rappel n'est emis qu'une fois par jour et par demande (le pic de
   * diffusion sert d'horodatage) afin d'eviter de saturer les postes.
   */
  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async remindLateNurseRequests(): Promise<void> {
    const open = await this.nurseRequests.findOpenRequests();
    const late = open.filter((request) => {
      const target =
        request.priority === 'EMERGENCY'
          ? 10
          : request.priority === 'URGENT'
            ? 60
            : 240;
      const deltaMinutes =
        (Date.now() - request.createdAt.getTime()) / 60000;
      return !request.acceptedAt && deltaMinutes > target;
    });

    if (late.length === 0) return;

    this.logger.warn(
      `${late.length} demande(s) de soin en retard de prise en charge.`,
    );
    this.healthBus.publish({
      type: HealthRealtimeEventType.NURSE_REQUEST_UPDATED,
      clientId: late[0].clientId,
      clientName: `${late.length} demande(s)`,
      organizationId: late[0].organizationId,
      entityId: null,
      reference: late[0].reference,
      message: `${late.length} demande(s) de soin en attente de prise en charge.`,
      payload: {
        references: late.map((request) => request.reference),
      },
      occurredAt: new Date().toISOString(),
    });
  }
}
