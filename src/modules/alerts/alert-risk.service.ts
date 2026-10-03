import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AlertStatus, AlertType } from '@common/enums/alert.enum';
import { AuthenticatedUser } from '@common/interfaces/authenticated-user.interface';
import {
  buildZoneRisk,
  findRepeatClients,
  RISK_LEVEL_THRESHOLDS,
  trendFor,
  ZoneRisk,
  ZoneAggregate,
} from '@common/utils/risk.util';
import { Alert } from '@database/entities/alert.entity';
import { Organization } from '@database/entities/organization.entity';
import { OrganizationScopeService } from '@modules/organizations/organizations.service';

/** Precision du maillage geographique, en degres (0,05° ≈ 5,5 km). */
const DEFAULT_GRID_PRECISION = 0.05;
const DEFAULT_WINDOW_DAYS = 30;
/**
 * Nombre de zones analysees pour la repartition par niveau. Borne volontaire :
 * chaque zone declaree coute une requete de repartition par nature d'alerte.
 */
const LEVEL_DISTRIBUTION_LIMIT = 25;

/** Statuts qui comptent comme un evenement reel (les faux positifs sont exclus). */
const CONFIRMED_STATUSES: AlertStatus[] = [
  AlertStatus.ASSIGNED,
  AlertStatus.IN_PROGRESS,
  AlertStatus.RESOLVED,
];

export interface ZoneRiskQuery {
  days?: number;
  limit?: number;
  minAlerts?: number;
  precision?: number;
}

export interface RiskZone extends ZoneRisk {
  city: string | null;
  /** Alertes des 7 derniers jours, pour situer la dynamique recente. */
  recentAlerts: number;
  trend: ReturnType<typeof trendFor>;
  lastAlertAt: Date;
}

interface ZoneRow {
  latitude: string;
  longitude: string;
  alerts: string;
  confirmed: string;
  recent_alerts: string;
  city: string | null;
  last_alert_at: Date;
}

/**
 * Analyse predictive du risque par zone.
 *
 * Le principe est volontairement simple et explicable au client : on maille le
 * territoire, on compte les declenchements par maille sur une fenetre glissante,
 * on pondere par la nature et par la part d'alertes confirmees, puis on classe.
 * Une zone n'est jamais presentee comme dangereuse sans volume suffisant
 * (`minAlerts`), et la console affiche toujours les chiffres qui ont produit le
 * score — pas seulement un indice opaque.
 */
@Injectable()
export class AlertRiskService {
  constructor(
    @InjectRepository(Alert)
    private readonly alertRepository: Repository<Alert>,
    @InjectRepository(Organization)
    private readonly organizationRepository: Repository<Organization>,
    private readonly scopeService: OrganizationScopeService,
  ) {}

  /** Zones les plus sensibles du perimetre, de la plus risquee a la moins risquee. */
  async zones(actor: AuthenticatedUser, query: ZoneRiskQuery = {}): Promise<{
    windowDays: number;
    precisionDegrees: number;
    minAlerts: number;
    zones: RiskZone[];
  }> {
    const days = clamp(query.days ?? DEFAULT_WINDOW_DAYS, 1, 365);
    const limit = clamp(query.limit ?? 10, 1, 100);
    const minAlerts = clamp(query.minAlerts ?? 2, 1, 100);
    const precision = query.precision && query.precision > 0 ? query.precision : DEFAULT_GRID_PRECISION;

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1_000);
    const recentSince = new Date(Date.now() - 7 * 24 * 60 * 60 * 1_000);

    const builder = this.alertRepository
      .createQueryBuilder('alert')
      .where('alert.openedAt >= :since', { since })
      .andWhere('alert.latitude IS NOT NULL')
      .andWhere('alert.longitude IS NOT NULL');

    const scope = await this.scopeService.getAccessibleOrganizationIds(actor);
    if (scope !== null) {
      if (scope.length === 0) {
        return { windowDays: days, precisionDegrees: precision, minAlerts, zones: [] };
      }
      builder.andWhere('alert.organizationId IN (:...scope)', { scope });
    }

    const rows = await builder
      .select('alert.latitude', 'latitude')
      .addSelect('alert.longitude', 'longitude')
      .addSelect('COUNT(*)::int', 'alerts')
      .addSelect(
        `COUNT(*) FILTER (WHERE alert.status IN (:...confirmedStatuses))::int`,
        'confirmed',
      )
      .addSelect('COUNT(*) FILTER (WHERE alert.openedAt >= :recentSince)::int', 'recent_alerts')
      .addSelect('MAX(alert.city)', 'city')
      .addSelect('MAX(alert.openedAt)', 'last_alert_at')
      .setParameter('confirmedStatuses', CONFIRMED_STATUSES)
      .setParameter('recentSince', recentSince)
      .groupBy('alert.latitude')
      .addGroupBy('alert.longitude')
      .getRawMany<ZoneRow>();

    const aggregates = await Promise.all(
      rows
        .map((row) => ({
          row,
          latitude: Number(row.latitude),
          longitude: Number(row.longitude),
          alerts: Number(row.alerts),
        }))
        .filter((entry) => entry.alerts >= minAlerts)
        .map(async (entry) => ({
          entry,
          byType: await this.typeBreakdown(entry.latitude, entry.longitude, since, scope),
        })),
    );

    const zones = aggregates
      .map(({ entry, byType }): RiskZone => {
        const aggregate: ZoneAggregate = {
          latitude: entry.latitude,
          longitude: entry.longitude,
          alerts: entry.alerts,
          confirmed: Number(entry.row.confirmed),
          byType,
        };
        const recentAlerts = Number(entry.row.recent_alerts);
        const previous = entry.alerts - recentAlerts;

        return {
          ...buildZoneRisk(aggregate, precision),
          city: entry.row.city ?? null,
          recentAlerts,
          trend: trendFor(recentAlerts, previous),
          lastAlertAt: entry.row.last_alert_at,
        };
      })
      .sort((left, right) => right.score - left.score || right.alerts - left.alerts)
      .slice(0, limit);

    return { windowDays: days, precisionDegrees: precision, minAlerts, zones };
  }

  /**
   * Synthese pour le tableau de bord : zones sensibles, repartition par ville,
   * clients a declenchements repetes et volumes confirmes.
   */
  async summary(actor: AuthenticatedUser, query: ZoneRiskQuery = {}): Promise<{
    windowDays: number;
    total: number;
    confirmed: number;
    confirmationRate: number | null;
    byLevel: Record<string, number>;
    topZones: RiskZone[];
    byCity: { city: string; alerts: number }[];
    repeatClients: { clientId: string; alerts: number; lastAlertAt: Date; types: AlertType[] }[];
    thresholds: typeof RISK_LEVEL_THRESHOLDS;
  }> {
    const days = clamp(query.days ?? DEFAULT_WINDOW_DAYS, 1, 365);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1_000);

    const scoped = this.alertRepository.createQueryBuilder('alert').where('alert.openedAt >= :since', { since });
    const scope = await this.scopeService.getAccessibleOrganizationIds(actor);
    if (scope !== null) {
      if (scope.length === 0) {
        return {
          windowDays: days,
          total: 0,
          confirmed: 0,
          confirmationRate: null,
          byLevel: {},
          topZones: [],
          byCity: [],
          repeatClients: [],
          thresholds: RISK_LEVEL_THRESHOLDS,
        };
      }
      scoped.andWhere('alert.organizationId IN (:...scope)', { scope });
    }

    const [totals] = await scoped
      .clone()
      .select('COUNT(*)::int', 'total')
      .addSelect(`COUNT(*) FILTER (WHERE alert.status IN (:...confirmedStatuses))::int`, 'confirmed')
      .setParameter('confirmedStatuses', CONFIRMED_STATUSES)
      .getRawMany<{ total: number; confirmed: number }>();

    const byCityRows = await scoped
      .clone()
      .select('COALESCE(alert.city, alert.address, \'inconnue\')', 'city')
      .addSelect('COUNT(*)::int', 'alerts')
      .groupBy('COALESCE(alert.city, alert.address, \'inconnue\')')
      .orderBy('alerts', 'DESC')
      .limit(8)
      .getRawMany<{ city: string; alerts: number }>();

    const clientRows = await scoped
      .clone()
      .select('alert.clientId', 'client_id')
      .addSelect('COUNT(*)::int', 'alerts')
      .addSelect('MAX(alert.openedAt)', 'last_alert_at')
      .where('alert.clientId IS NOT NULL')
      .groupBy('alert.clientId')
      .having('COUNT(*) >= :minimum', { minimum: 2 })
      .orderBy('alerts', 'DESC')
      .limit(50)
      .getRawMany<{ client_id: string; alerts: number; last_alert_at: Date }>();

    const repeatInputs = await scoped
      .clone()
      .select(['alert.clientId', 'alert.reference', 'alert.type', 'alert.openedAt'])
      .andWhere('alert.clientId IN (:...clientIds)', {
        clientIds: clientRows.map((row) => row.client_id),
      })
      .getMany()
      .then((alerts) =>
        alerts.map((alert) => ({
          clientId: alert.clientId as string,
          reference: alert.reference,
          type: alert.type,
          openedAt: alert.openedAt,
        })),
      )
      .catch(() => []);

    // La repartition par niveau est calculee sur les zones qualifiees (et non
    // sur le seul top 5) : sans cela, le tableau de bord afficherait toujours
    // « 2 zones critiques » alors que le pays en compte davantage.
    const zoneReport = await this.zones(actor, { ...query, days, limit: LEVEL_DISTRIBUTION_LIMIT });
    const byLevel = zoneReport.zones.reduce<Record<string, number>>((accumulator, zone) => {
      accumulator[zone.level] = (accumulator[zone.level] ?? 0) + 1;
      return accumulator;
    }, {});

    const total = Number(totals?.total ?? 0);
    const confirmed = Number(totals?.confirmed ?? 0);

    return {
      windowDays: days,
      total,
      confirmed,
      confirmationRate: total === 0 ? null : Math.round((confirmed / total) * 1000) / 10,
      byLevel,
      topZones: zoneReport.zones.slice(0, query.limit ?? 5),
      byCity: byCityRows.map((row) => ({ city: row.city, alerts: Number(row.alerts) })),
      repeatClients: findRepeatClients(repeatInputs, 3).map((entry) => ({
        clientId: entry.clientId,
        alerts: entry.alerts,
        lastAlertAt: entry.lastAlertAt,
        types: entry.types,
      })),
      thresholds: RISK_LEVEL_THRESHOLDS,
    };
  }

  /** Repartition par nature d'alerte d'une maille, pour justifier le score. */
  private async typeBreakdown(
    latitude: number,
    longitude: number,
    since: Date,
    scope: string[] | null,
  ): Promise<{ type: AlertType; count: number }[]> {
    const builder = this.alertRepository
      .createQueryBuilder('alert')
      .select('alert.type', 'type')
      .addSelect('COUNT(*)::int', 'count')
      .where('alert.openedAt >= :since', { since })
      .andWhere('alert.latitude = :latitude', { latitude })
      .andWhere('alert.longitude = :longitude', { longitude })
      .groupBy('alert.type')
      .orderBy('count', 'DESC');

    if (scope !== null) builder.andWhere('alert.organizationId IN (:...scope)', { scope });

    const rows = await builder.getRawMany<{ type: AlertType; count: number }>();
    return rows.map((row) => ({ type: row.type, count: Number(row.count) }));
  }

  /**
   * Villes du perimetre, pour proposer un filtre geographique dans la console.
   * Les organisations renseignent la ville de reference du registre.
   */
  async cities(actor: AuthenticatedUser): Promise<string[]> {
    const scope = await this.scopeService.getAccessibleOrganizationIds(actor);
    const builder = this.organizationRepository
      .createQueryBuilder('organization')
      .select('DISTINCT organization.city', 'city')
      .where('organization.city IS NOT NULL');

    if (scope !== null) {
      if (scope.length === 0) return [];
      builder.andWhere('organization.id IN (:...scope)', { scope });
    }

    const rows = await builder.getRawMany<{ city: string }>();
    return rows.map((row) => row.city).sort((left, right) => left.localeCompare(right));
  }
}

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(Math.max(Math.trunc(value), minimum), maximum);
