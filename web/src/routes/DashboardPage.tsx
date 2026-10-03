import {
  Activity,
  BellRing,
  Flame,
  HeartPulse,
  Radio,
  ShieldAlert,
  Timer,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Badge } from '@/components/ui/Badge';
import { RiskZonesCard } from '@/components/dashboard/RiskZonesCard';
import { Card, CardBody, CardHeader, DataRow, StatCard } from '@/components/ui/Card';
import { EmptyState, ErrorState, Skeleton, TableSkeleton } from '@/components/ui/Feedback';
import { THead, TH, TBody, TR, TD, TableWrap } from '@/components/ui/Table';
import { useAlertStats, useAlerts, useDevices } from '@/hooks/queries';
import { formatDuration, formatNumber, formatRelative } from '@/lib/format';
import { ALERT_SEVERITY, ALERT_STATUS, ALERT_TYPE, describe, SUB_DEVICE_CODE } from '@/lib/labels';
import { useRealtimeStore } from '@/store/realtime';
import type { AlertSeverity, AlertType } from '@/types/api';

const PERIODS = [
  { id: '24h', label: '24 heures', hours: 24 },
  { id: '7d', label: '7 jours', hours: 24 * 7 },
  { id: '30d', label: '30 jours', hours: 24 * 30 },
] as const;

const TYPE_COLORS: Record<string, string> = {
  FIRE: '#dc2626',
  MEDICAL: '#e11d48',
  INTRUSION: '#f59e0b',
  SABOTAGE: '#9333ea',
  PANIC: '#f43f5e',
  GAS_LEAK: '#ea580c',
  WATER_LEAK: '#0ea5e9',
  SYSTEM: '#64748b',
};

const SEVERITY_CARD_TONE: Record<AlertSeverity, 'neutral' | 'info' | 'warning' | 'critical'> = {
  LOW: 'neutral',
  MEDIUM: 'info',
  HIGH: 'warning',
  CRITICAL: 'critical',
};

/** Icone associée à la nature d'une alerte. */
const TypeIcon = ({ type }: { type: AlertType }) => {
  if (type === 'FIRE') return <Flame className="h-4 w-4 text-red-500" />;
  if (type === 'MEDICAL') return <HeartPulse className="h-4 w-4 text-rose-500" />;
  if (type === 'INTRUSION' || type === 'SABOTAGE') return <ShieldAlert className="h-4 w-4 text-amber-500" />;
  return <BellRing className="h-4 w-4 text-slate-400" />;
};

export const DashboardPage = () => {
  const navigate = useNavigate();
  const [period, setPeriod] = useState<(typeof PERIODS)[number]['id']>('24h');
  const recentEvents = useRealtimeStore((state) => state.recentEvents);
  const connected = useRealtimeStore((state) => state.connected);

  const from = useMemo(
    () => new Date(Date.now() - (PERIODS.find((item) => item.id === period)?.hours ?? 24) * 3600 * 1000).toISOString(),
    [period],
  );

  const statsQuery = useAlertStats();
  const openAlertsQuery = useAlerts({ openOnly: true, limit: 8, order: 'asc' });
  const devicesQuery = useDevices({ limit: 100 });

  const fleet = useMemo(() => {
    const devices = devicesQuery.data?.items ?? [];
    const online = devices.filter((device) => device.status === 'ACTIVE').length;
    const offline = devices.filter((device) => device.status === 'OFFLINE').length;
    return { total: devices.length, online, offline, ratio: devices.length ? online / devices.length : 0 };
  }, [devicesQuery.data]);

  const periodAlerts = useAlerts({ from, limit: 1 });
  const stats = statsQuery.data;

  const byTypeData = useMemo(
    () =>
      (stats?.byType ?? []).map((row) => ({
        type: row.type,
        label: describe(ALERT_TYPE, row.type).label,
        count: row.count,
        fill: TYPE_COLORS[row.type] ?? '#64748b',
      })),
    [stats],
  );

  const statusData = useMemo(
    () =>
      (stats?.byStatus ?? []).map((row) => ({
        status: row.status,
        label: describe(ALERT_STATUS, row.status).label,
        count: row.count,
      })),
    [stats],
  );

  return (
    <div className="space-y-5">
      {/* Bandeau d'état + selecteur de période */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span className={connected ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>
            {connected ? <Radio className="inline h-3.5 w-3.5" /> : <WifiOff className="inline h-3.5 w-3.5" />}
          </span>
          {connected ? 'Canal temps réel connecté' : 'Hors ligne : les données sont rafraichies par sondage'}
        </div>
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-card dark:border-slate-800 dark:bg-slate-900">
          {PERIODS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setPeriod(item.id)}
              className={
                period === item.id
                  ? 'rounded-md bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white'
                  : 'rounded-md px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              }
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Indicateurs cles */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Alertes ouvertes"
          value={stats ? formatNumber(stats.open) : '—'}
          hint="En attente de traitement"
          tone={stats && stats.open > 0 ? 'critical' : 'success'}
          icon={<BellRing className="h-4 w-4" />}
          onClick={() => navigate('/alertes?openOnly=true')}
        />
        <StatCard
          label={`Alertes sur ${PERIODS.find((item) => item.id === period)?.label.toLowerCase()}`}
          value={period === '24h' ? formatNumber(stats?.last24h) : formatNumber(periodAlerts.data?.total)}
          hint="Toutes sources confondues"
          tone="info"
          icon={<Activity className="h-4 w-4" />}
        />
        <StatCard
          label="Prise en charge moyenne"
          value={formatDuration(stats?.averageAcknowledgeSeconds ?? null)}
          hint="Entre le déclenchement et l'accusé opérateur"
          tone="brand"
          icon={<Timer className="h-4 w-4" />}
        />
        <StatCard
          label="Parc en ligne"
          value={`${formatNumber(fleet.online)} / ${formatNumber(fleet.total)}`}
          hint={`${fleet.offline} centrale(s) hors ligne`}
          tone={fleet.total > 0 && fleet.ratio < 0.8 ? 'warning' : 'success'}
          icon={<Wifi className="h-4 w-4" />}
          onClick={() => navigate('/dispositifs')}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {/* Répartition par type */}
        <Card className="xl:col-span-2">
          <CardHeader
            title="Alertes ouvertes par nature"
            description="Répartition en temps réel de la file d'attente du ZMC"
            icon={<ShieldAlert className="h-4 w-4" />}
          />
          <CardBody className="pt-2">
            {statsQuery.isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : statsQuery.isError ? (
              <ErrorState onRetry={() => void statsQuery.refetch()} />
            ) : byTypeData.length === 0 ? (
              <EmptyState title="Aucune alerte ouverte" description="Le parc est calme sur le périmètre surveille." />
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={byTypeData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11, fill: 'currentColor' }}
                      className="text-slate-500 dark:text-slate-400"
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 11, fill: 'currentColor' }}
                      className="text-slate-500 dark:text-slate-400"
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      cursor={{ fill: 'rgba(148,163,184,0.12)' }}
                      contentStyle={{
                        borderRadius: 12,
                        border: '1px solid #e2e8f0',
                        fontSize: 12,
                        boxShadow: '0 12px 32px -12px rgba(15,23,42,0.24)',
                      }}
                      formatter={(value: number) => [`${value} alerte(s)`, 'Ouvertes']}
                    />
                    <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={64}>
                      {byTypeData.map((entry) => (
                        <Cell key={entry.type} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardBody>
        </Card>

        {/* Répartition par statut */}
        <Card>
          <CardHeader title="Cycle de vie" description="Toutes périodes confondues" />
          <CardBody className="pt-2">
            {statsQuery.isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : statusData.length === 0 ? (
              <EmptyState title="Aucune donnée" />
            ) : (
              <>
                <div className="h-40 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={statusData}
                        dataKey="count"
                        nameKey="label"
                        innerRadius={42}
                        outerRadius={64}
                        paddingAngle={2}
                        stroke="none"
                      >
                        {statusData.map((entry) => {
                          const tone = describe(ALERT_STATUS, entry.status).tone;
                          const colors: Record<string, string> = {
                            critical: '#dc2626',
                            danger: '#e11d48',
                            warning: '#f59e0b',
                            info: '#0ea5e9',
                            brand: '#4f46e5',
                            success: '#10b981',
                            neutral: '#94a3b8',
                          };
                          return <Cell key={entry.status} fill={colors[tone] ?? '#94a3b8'} />;
                        })}
                      </Pie>
                      <Tooltip
                        contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
                        formatter={(value: number) => [`${value} alerte(s)`, '']}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <DescriptionListCompact items={statusData.map((item) => [item.label, formatNumber(item.count)])} />
              </>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {/* File d'attente prioritaire */}
        <Card className="xl:col-span-2">
          <CardHeader
            title="File d'attente prioritaire"
            description="Alertes ouvertes les plus anciennes"
            actions={
              <Link
                to="/alertes?openOnly=true"
                className="text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400"
              >
                Ouvrir la console
              </Link>
            }
          />
          {openAlertsQuery.isLoading ? (
            <TableSkeleton rows={5} columns={4} />
          ) : openAlertsQuery.isError ? (
            <ErrorState onRetry={() => void openAlertsQuery.refetch()} />
          ) : (openAlertsQuery.data?.items.length ?? 0) === 0 ? (
            <EmptyState
              title="Aucune alerte en attente"
              description="Toutes les alertes du périmètre ont ete traitees."
              icon={<BellRing className="h-5 w-5" />}
            />
          ) : (
            <TableWrap>
              <THead>
                <TH>Référence</TH>
                <TH>Nature</TH>
                <TH>Client / lieu</TH>
                <TH>Déclenchée</TH>
                <TH>Gravité</TH>
              </THead>
              <TBody>
                {openAlertsQuery.data?.items.map((alert) => (
                  <TR key={alert.id} onClick={() => navigate(`/alertes/${alert.id}`)}>
                    <TD className="font-mono text-xs font-semibold text-slate-900 dark:text-white">
                      {alert.reference}
                      {alert.occurrenceCount > 1 ? (
                        <span className="ml-1.5 rounded bg-amber-100 px-1 text-[10px] text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                          ×{alert.occurrenceCount}
                        </span>
                      ) : null}
                    </TD>
                    <TD>
                      <span className="flex items-center gap-2">
                        <TypeIcon type={alert.type} />
                        {describe(ALERT_TYPE, alert.type).label}
                      </span>
                    </TD>
                    <TD className="max-w-[220px] truncate">
                      {alert.client?.fullName ?? alert.metadata?.clientName?.toString() ?? '—'}
                      <span className="ml-1 text-xs text-slate-400">{alert.city ?? ''}</span>
                    </TD>
                    <TD className="text-xs text-slate-500 dark:text-slate-400">{formatRelative(alert.openedAt)}</TD>
                    <TD>
                      <Badge tone={describe(ALERT_SEVERITY, alert.severity).tone}>
                        {describe(ALERT_SEVERITY, alert.severity).label}
                      </Badge>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </TableWrap>
          )}
        </Card>

        {/* Flux temps réel */}
        <Card>
          <CardHeader
            title="Flux temps réel"
            description="Derniers événements reçus du parc"
            actions={<Badge tone={connected ? 'success' : 'neutral'} dot>{connected ? 'Live' : 'Pause'}</Badge>}
          />
          <CardBody className="pt-2">
            {recentEvents.length === 0 ? (
              <EmptyState
                title="En attente d'événements"
                description="Les alertes, appels vocaux et affectations s'afficheront ici."
                icon={<Radio className="h-5 w-5" />}
              />
            ) : (
              <ol className="space-y-3">
                {recentEvents.slice(0, 8).map((event, index) => (
                  <li key={`${event.alertId ?? event.interventionId}-${index}`} className="flex gap-3">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500 pulse-ring" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100">
                        {event.type.replace(/^(alert|intervention|team)\./, '').replace(/_/g, ' ')} —{' '}
                        {event.reference ?? event.interventionReference ?? event.teamName ?? ''}
                      </p>
                      <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                        {describe(ALERT_TYPE, event.alertType).label} ·{' '}
                        {describe(ALERT_SEVERITY, event.severity).label} · {formatRelative(event.occurredAt)}
                      </p>
                    </div>
                    <Badge tone={event.severity ? SEVERITY_CARD_TONE[event.severity] : 'neutral'}>
                      {event.status ? describe(ALERT_STATUS, event.status).label : event.type.split('.')[0]}
                    </Badge>
                  </li>
                ))}
              </ol>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Analyse predictive : zones a risque du perimetre */}
      <RiskZonesCard days={90} />

      {/* Derniers sous-appareils en défaut remontée */}
      <Card>
        <CardHeader
          title="Santé du parc"
          description="Centrales SafAlert Solar G1 rattachées à votre périmètre"
          icon={<Wifi className="h-4 w-4" />}
        />        <CardBody className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
            <p className="text-xs text-slate-500 dark:text-slate-400">Centrales actives</p>
            <p className="mt-1 text-xl font-semibold text-emerald-600 dark:text-emerald-400">
              {formatNumber(fleet.online)}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
            <p className="text-xs text-slate-500 dark:text-slate-400">Hors ligne</p>
            <p className="mt-1 text-xl font-semibold text-amber-600 dark:text-amber-400">
              {formatNumber(fleet.offline)}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
            <p className="text-xs text-slate-500 dark:text-slate-400">Codes sous-appareils suivis</p>
            <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-white">
              {formatNumber(Object.keys(SUB_DEVICE_CODE).length)}
            </p>
          </div>
        </CardBody>
      </Card>
    </div>
  );
};

/** Petite liste de paires libellé / valeur. */
const DescriptionListCompact = ({ items }: { items: Array<[string, string]> }) => (
  <div className="mt-3 space-y-1 border-t border-slate-100 pt-3 dark:border-slate-800">
    {items.map(([label, value]) => (
      <DataRow key={label} label={label} value={value} />
    ))}
  </div>
);
