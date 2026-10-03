import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SubscriptionsService } from '@modules/subscriptions/subscriptions.service';

/**
 * Watchdog commercial.
 *
 * Toutes les quinze minutes : les abonnements echus restreignent l'acces de
 * leur client, et les codes jamais actives depuis trente jours sont perimes.
 * Une fois par jour, les clients dont l'abonnement arrive a echeance dans sept
 * jours sont relances par SMS (un client qui n'est pas prevenu se plaint d'une
 * coupure, pas d'avoir oublie de payer).
 */
@Injectable()
export class SubscriptionsTasks {
  private readonly logger = new Logger(SubscriptionsTasks.name);

  constructor(
    private readonly subscriptions: SubscriptionsService,
    private readonly configService: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES, { name: 'subscriptions-expiry' })
  async handleExpiry(): Promise<void> {
    if (!this.configService.get<boolean>('app.billing.autoExpire', true)) return;

    try {
      const result = await this.subscriptions.expireDue();
      if (result.clients > 0 || result.codes > 0) {
        this.logger.warn(
          `Abonnements echus : ${result.clients} client(s) restreint(s), ${result.codes} code(s) perime(s).`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Watchdog des abonnements en echec : ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_8AM, { name: 'subscriptions-reminders' })
  async handleReminders(): Promise<void> {
    if (!this.configService.get<boolean>('app.billing.reminders', true)) return;

    try {
      const sent = await this.subscriptions.notifyExpiringSoon();
      if (sent > 0) this.logger.log(`${sent} client(s) relance(s) avant echeance d'abonnement.`);
    } catch (error) {
      this.logger.error(
        `Relances d'abonnement en echec : ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
