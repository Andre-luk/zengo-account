import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { InterventionEventBus } from '@common/bus/intervention-event.bus';
import { FieldTeamsService } from '@modules/interventions/field-teams.service';
import { InterventionsService } from '@modules/interventions/interventions.service';

const WATCHDOG_INTERVAL_NAME = 'interventions-watchdog';

/**
 * Watchdog du pilotage terrain.
 *
 * Deux regles issues du cahier des charges :
 * 1. **Depart non confirme** : une equipe engagee qui n'a pas signale son
 *    depart dans le delai imparti est signalee au superviseur (`INTERVENTION_DEPARTURE_WARN_MINUTES`).
 * 2. **Arrivee anormalement longue** : une equipe en route qui n'arrive pas
 *    dans le delai attendu est relancee (`INTERVENTION_ARRIVAL_WARN_MINUTES`).
 *
 * Les equipes dont la position n'a plus ete transmise sont egalement signalees,
 * sans changement automatique de statut : la decision reste humaine.
 */
@Injectable()
export class InterventionsTasks implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InterventionsTasks.name);
  private running = false;

  constructor(
    private readonly interventionsService: InterventionsService,
    private readonly fieldTeamsService: FieldTeamsService,
    private readonly configService: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly interventionEventBus: InterventionEventBus,
  ) {}

  onModuleInit(): void {
    const intervalSeconds = this.configService.get<number>('app.interventions.watchdogIntervalSeconds', 60);

    const handle = setInterval(() => {
      void this.runWatchdog();
    }, intervalSeconds * 1_000);

    this.schedulerRegistry.addInterval(WATCHDOG_INTERVAL_NAME, handle);
    this.logger.log(
      `Watchdog des interventions actif toutes les ${intervalSeconds}s (relance si depart non confirme apres ${this.configService.get<number>(
        'app.interventions.departureWarnMinutes',
        5,
      )} min).`,
    );
  }

  onModuleDestroy(): void {
    if (this.schedulerRegistry.doesExist('interval', WATCHDOG_INTERVAL_NAME)) {
      this.schedulerRegistry.deleteInterval(WATCHDOG_INTERVAL_NAME);
    }
  }

  /** Execute le controle (expose pour les tests et l'administration). */
  async runWatchdog(): Promise<void> {
    if (this.running) return;
    this.running = true;

    try {
      await this.warnDelayedMissions();
      await this.reportStaleTeamPositions();
    } catch (error) {
      this.logger.error(
        `Echec du watchdog des interventions : ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.running = false;
    }
  }

  private async warnDelayedMissions(): Promise<void> {
    const delayed = await this.interventionsService.findDelayedMissions();
    for (const mission of delayed) {
      this.interventionsService.publishDelay(mission);
    }
    if (delayed.length > 0) {
      this.logger.warn(`${delayed.length} mission(s) en retard signalee(s) au superviseur.`);
    }
  }

  /** Equipes silencieuses : position trop ancienne pour l'affectation automatique. */
  private async reportStaleTeamPositions(): Promise<void> {
    const maxAgeMinutes = this.configService.get<number>('app.interventions.positionMaxAgeMinutes', 60);
    const teams = await this.fieldTeamsService.findTeamsWithStalePosition(maxAgeMinutes);

    for (const team of teams) {
      this.interventionEventBus.publish({
        type: 'team.position_updated',
        interventionId: null,
        interventionReference: null,
        alertId: null,
        alertReference: null,
        status: null,
        teamId: team.id,
        teamName: team.name,
        stationId: team.stationId,
        organizationIds: [team.stationId],
        occurredAt: new Date().toISOString(),
        payload: {
          stale: true,
          lastPositionAt: team.lastPositionAt?.toISOString() ?? null,
          maxAgeMinutes,
        },
      });
    }

    if (teams.length > 0) {
      this.logger.debug(`${teams.length} equipe(s) sans position recente (seuil ${maxAgeMinutes} min).`);
    }
  }
}
