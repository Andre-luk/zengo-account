import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, Skeleton } from '@/components/ui/Feedback';
import { MapPinned } from 'lucide-react';
import { useRiskSummary } from '@/hooks/queries';
import { formatNumber } from '@/lib/format';
import { ALERT_TYPE, describe, RISK_LEVEL, RISK_TREND } from '@/lib/labels';
import { cn } from '@/lib/cn';

const TREND_ARROW: Record<string, string> = {
  EN_HAUSSE: '↑',
  STABLE: '→',
  EN_BAISSE: '↓',
};

/**
 * Zones à risque détectées par l'analyse prédictive.
 *
 * On affiche toujours les chiffres qui ont produit le score (volume, part
 * confirmée, tendance) : un indice opaque ne se discute pas avec un client ni
 * avec un chef d'agence.
 */
export const RiskZonesCard = ({ days = 90 }: { days?: number }) => {
  const { data, isLoading } = useRiskSummary({ days, limit: 5 });

  return (
    <Card>
      <CardHeader
        title="Zones à risque"
        description={
          data
            ? `${formatNumber(data.total)} alerte(s) sur ${data.windowDays} jours · ${data.confirmationRate ?? 0}% confirmées`
            : 'Analyse des déclenchements par zone géographique'
        }
        icon={<MapPinned className="h-4 w-4" />}
      />
      <CardBody className="space-y-3 pt-2">
        {isLoading ? <Skeleton className="h-32 w-full" /> : null}

        {!isLoading && (data?.topZones.length ?? 0) === 0 ? (
          <EmptyState
            title="Aucune zone à signaler"
            description="Pas assez de déclenchements géolocalisés sur la période pour qualifier une zone."
            icon={<MapPinned className="h-5 w-5" />}
          />
        ) : null}

        {data?.topZones.map((zone) => {
          const level = describe(RISK_LEVEL, zone.level);
          const trend = describe(RISK_TREND, zone.trend);
          const dominant = [...zone.byType].sort((left, right) => right.count - left.count)[0];

          return (
            <div
              key={zone.cell}
              className="rounded-xl border border-slate-200 p-3 dark:border-slate-800"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                    {zone.city ?? 'Zone non nommée'}
                    <span className="ml-2 font-mono text-xs font-normal text-slate-500 dark:text-slate-400">
                      {zone.cell}
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {formatNumber(zone.alerts)} alerte(s) · {formatNumber(zone.confirmed)} confirmée(s) ·{' '}
                    {dominant ? `${describe(ALERT_TYPE, dominant.type).label} en tête` : 'nature non déterminée'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone={level.tone}>{level.label}</Badge>
                  <span
                    className={cn(
                      'text-xs font-medium',
                      zone.trend === 'EN_HAUSSE'
                        ? 'text-rose-600 dark:text-rose-400'
                        : zone.trend === 'EN_BAISSE'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-slate-500 dark:text-slate-400',
                    )}
                  >
                    {TREND_ARROW[zone.trend]} {trend.label}
                  </span>
                </div>
              </div>

              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className={cn(
                    'h-full rounded-full',
                    zone.level === 'CRITIQUE'
                      ? 'bg-rose-500'
                      : zone.level === 'ELEVE'
                        ? 'bg-orange-500'
                        : zone.level === 'MODERE'
                          ? 'bg-amber-400'
                          : 'bg-emerald-500',
                  )}
                  style={{ width: `${Math.max(4, Math.min(100, zone.score))}%` }}
                />
              </div>
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                Score {zone.score}/100 · {formatNumber(zone.recentAlerts)} alerte(s) ces 7 derniers jours
              </p>
            </div>
          );
        })}

        {data && data.repeatClients.length > 0 ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-100">
            {data.repeatClients.length} client(s) ont déclenché au moins 3 alertes sur la période : une visite de
            contrôle du capteur est conseillée.
          </p>
        ) : null}
      </CardBody>
    </Card>
  );
};
