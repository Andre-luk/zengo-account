import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ClientMutationsService } from '@modules/mutations/client-mutations.service';

/**
 * Watchdog du suivi de portefeuille.
 *
 * Chaque matin, les mutations appliquees dont le rapport d'integration (7 ou 30
 * jours) est attendu sont relancees une fois : le controle qualite verifie ainsi
 * que le client a reellement ete pris en charge par sa nouvelle agence, et non
 * seulement transfere dans la base.
 */
@Injectable()
export class ClientMutationsTasks {
  private readonly logger = new Logger(ClientMutationsTasks.name);

  constructor(private readonly mutations: ClientMutationsService) {}

  @Cron(CronExpression.EVERY_DAY_AT_9AM, { name: 'mutations-integration-reminders' })
  async handleIntegrationReminders(): Promise<void> {
    try {
      const pending = await this.mutations.findPendingIntegrationReports();
      if (pending.length === 0) return;

      const reminded = await this.mutations.remindPendingIntegrationReports();
      this.logger.warn(
        `${pending.length} mutation(s) avec rapport d'integration en attente (${reminded} relance(s) envoyee(s)).`,
      );
    } catch (error) {
      this.logger.error(
        `Relance des rapports d'integration en echec : ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
