import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Activity, BellRing, Flame, HeartPulse, Radio, ShieldAlert, Timer, Wifi, WifiOff, } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, } from 'recharts';
import { Badge } from '@/components/ui/Badge';
import { Card, CardBody, CardHeader, DataRow, StatCard } from '@/components/ui/Card';
import { EmptyState, ErrorState, Skeleton, TableSkeleton } from '@/components/ui/Feedback';
import { THead, TH, TBody, TR, TD, TableWrap } from '@/components/ui/Table';
import { useAlertStats, useAlerts, useDevices } from '@/hooks/queries';
import { formatDuration, formatNumber, formatRelative } from '@/lib/format';
import { ALERT_SEVERITY, ALERT_STATUS, ALERT_TYPE, describe, SUB_DEVICE_CODE } from '@/lib/labels';
import { useRealtimeStore } from '@/store/realtime';
const PERIODS = [
    { id: '24h', label: '24 heures', hours: 24 },
    { id: '7d', label: '7 jours', hours: 24 * 7 },
    { id: '30d', label: '30 jours', hours: 24 * 30 },
];
const TYPE_COLORS = {
    FIRE: '#dc2626',
    MEDICAL: '#e11d48',
    INTRUSION: '#f59e0b',
    SABOTAGE: '#9333ea',
    PANIC: '#f43f5e',
    GAS_LEAK: '#ea580c',
    WATER_LEAK: '#0ea5e9',
    SYSTEM: '#64748b',
};
const SEVERITY_CARD_TONE = {
    LOW: 'neutral',
    MEDIUM: 'info',
    HIGH: 'warning',
    CRITICAL: 'critical',
};
/** Icone associée a la nature d'une alerte. */
const TypeIcon = ({ type }) => {
    if (type === 'FIRE')
        return _jsx(Flame, { className: "h-4 w-4 text-red-500" });
    if (type === 'MEDICAL')
        return _jsx(HeartPulse, { className: "h-4 w-4 text-rose-500" });
    if (type === 'INTRUSION' || type === 'SABOTAGE')
        return _jsx(ShieldAlert, { className: "h-4 w-4 text-amber-500" });
    return _jsx(BellRing, { className: "h-4 w-4 text-slate-400" });
};
export const DashboardPage = () => {
    const navigate = useNavigate();
    const [period, setPeriod] = useState('24h');
    const recentEvents = useRealtimeStore((state) => state.recentEvents);
    const connected = useRealtimeStore((state) => state.connected);
    const from = useMemo(() => new Date(Date.now() - (PERIODS.find((item) => item.id === period)?.hours ?? 24) * 3600 * 1000).toISOString(), [period]);
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
    const byTypeData = useMemo(() => (stats?.byType ?? []).map((row) => ({
        type: row.type,
        label: describe(ALERT_TYPE, row.type).label,
        count: row.count,
        fill: TYPE_COLORS[row.type] ?? '#64748b',
    })), [stats]);
    const statusData = useMemo(() => (stats?.byStatus ?? []).map((row) => ({
        status: row.status,
        label: describe(ALERT_STATUS, row.status).label,
        count: row.count,
    })), [stats]);
    return (_jsxs("div", { className: "space-y-5", children: [_jsxs("div", { className: "flex flex-wrap items-center justify-between gap-3", children: [_jsxs("div", { className: "flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400", children: [_jsx("span", { className: connected ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400', children: connected ? _jsx(Radio, { className: "inline h-3.5 w-3.5" }) : _jsx(WifiOff, { className: "inline h-3.5 w-3.5" }) }), connected ? 'Canal temps réel connecté' : 'Hors ligne : les données sont rafraichies par sondage'] }), _jsx("div", { className: "inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-card dark:border-slate-800 dark:bg-slate-900", children: PERIODS.map((item) => (_jsx("button", { type: "button", onClick: () => setPeriod(item.id), className: period === item.id
                                ? 'rounded-md bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white'
                                : 'rounded-md px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200', children: item.label }, item.id))) })] }), _jsxs("div", { className: "grid gap-4 sm:grid-cols-2 xl:grid-cols-4", children: [_jsx(StatCard, { label: "Alertes ouvertes", value: stats ? formatNumber(stats.open) : '—', hint: "En attente de traitement", tone: stats && stats.open > 0 ? 'critical' : 'success', icon: _jsx(BellRing, { className: "h-4 w-4" }), onClick: () => navigate('/alertes?openOnly=true') }), _jsx(StatCard, { label: `Alertes sur ${PERIODS.find((item) => item.id === period)?.label.toLowerCase()}`, value: period === '24h' ? formatNumber(stats?.last24h) : formatNumber(periodAlerts.data?.total), hint: "Toutes sources confondues", tone: "info", icon: _jsx(Activity, { className: "h-4 w-4" }) }), _jsx(StatCard, { label: "Prise en charge moyenne", value: formatDuration(stats?.averageAcknowledgeSeconds ?? null), hint: "Entre le d\u00E9clenchement et l'accus\u00E9 op\u00E9rateur", tone: "brand", icon: _jsx(Timer, { className: "h-4 w-4" }) }), _jsx(StatCard, { label: "Parc en ligne", value: `${formatNumber(fleet.online)} / ${formatNumber(fleet.total)}`, hint: `${fleet.offline} centrale(s) hors ligne`, tone: fleet.total > 0 && fleet.ratio < 0.8 ? 'warning' : 'success', icon: _jsx(Wifi, { className: "h-4 w-4" }), onClick: () => navigate('/dispositifs') })] }), _jsxs("div", { className: "grid gap-4 xl:grid-cols-3", children: [_jsxs(Card, { className: "xl:col-span-2", children: [_jsx(CardHeader, { title: "Alertes ouvertes par nature", description: "R\u00E9partition en temps r\u00E9el de la file d'attente du ZMC", icon: _jsx(ShieldAlert, { className: "h-4 w-4" }) }), _jsx(CardBody, { className: "pt-2", children: statsQuery.isLoading ? (_jsx(Skeleton, { className: "h-64 w-full" })) : statsQuery.isError ? (_jsx(ErrorState, { onRetry: () => void statsQuery.refetch() })) : byTypeData.length === 0 ? (_jsx(EmptyState, { title: "Aucune alerte ouverte", description: "Le parc est calme sur le p\u00E9rim\u00E8tre surveille." })) : (_jsx("div", { className: "h-64 w-full", children: _jsx(ResponsiveContainer, { width: "100%", height: "100%", children: _jsxs(BarChart, { data: byTypeData, margin: { top: 8, right: 8, left: -18, bottom: 0 }, children: [_jsx(XAxis, { dataKey: "label", tick: { fontSize: 11, fill: 'currentColor' }, className: "text-slate-500 dark:text-slate-400", axisLine: false, tickLine: false }), _jsx(YAxis, { allowDecimals: false, tick: { fontSize: 11, fill: 'currentColor' }, className: "text-slate-500 dark:text-slate-400", axisLine: false, tickLine: false }), _jsx(Tooltip, { cursor: { fill: 'rgba(148,163,184,0.12)' }, contentStyle: {
                                                        borderRadius: 12,
                                                        border: '1px solid #e2e8f0',
                                                        fontSize: 12,
                                                        boxShadow: '0 12px 32px -12px rgba(15,23,42,0.24)',
                                                    }, formatter: (value) => [`${value} alerte(s)`, 'Ouvertes'] }), _jsx(Bar, { dataKey: "count", radius: [6, 6, 0, 0], maxBarSize: 64, children: byTypeData.map((entry) => (_jsx(Cell, { fill: entry.fill }, entry.type))) })] }) }) })) })] }), _jsxs(Card, { children: [_jsx(CardHeader, { title: "Cycle de vie", description: "Toutes p\u00E9riodes confondues" }), _jsx(CardBody, { className: "pt-2", children: statsQuery.isLoading ? (_jsx(Skeleton, { className: "h-48 w-full" })) : statusData.length === 0 ? (_jsx(EmptyState, { title: "Aucune donn\u00E9e" })) : (_jsxs(_Fragment, { children: [_jsx("div", { className: "h-40 w-full", children: _jsx(ResponsiveContainer, { width: "100%", height: "100%", children: _jsxs(PieChart, { children: [_jsx(Pie, { data: statusData, dataKey: "count", nameKey: "label", innerRadius: 42, outerRadius: 64, paddingAngle: 2, stroke: "none", children: statusData.map((entry) => {
                                                                const tone = describe(ALERT_STATUS, entry.status).tone;
                                                                const colors = {
                                                                    critical: '#dc2626',
                                                                    danger: '#e11d48',
                                                                    warning: '#f59e0b',
                                                                    info: '#0ea5e9',
                                                                    brand: '#4f46e5',
                                                                    success: '#10b981',
                                                                    neutral: '#94a3b8',
                                                                };
                                                                return _jsx(Cell, { fill: colors[tone] ?? '#94a3b8' }, entry.status);
                                                            }) }), _jsx(Tooltip, { contentStyle: { borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }, formatter: (value) => [`${value} alerte(s)`, ''] })] }) }) }), _jsx(DescriptionListCompact, { items: statusData.map((item) => [item.label, formatNumber(item.count)]) })] })) })] })] }), _jsxs("div", { className: "grid gap-4 xl:grid-cols-3", children: [_jsxs(Card, { className: "xl:col-span-2", children: [_jsx(CardHeader, { title: "File d'attente prioritaire", description: "Alertes ouvertes les plus anciennes", actions: _jsx(Link, { to: "/alertes?openOnly=true", className: "text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400", children: "Ouvrir la console" }) }), openAlertsQuery.isLoading ? (_jsx(TableSkeleton, { rows: 5, columns: 4 })) : openAlertsQuery.isError ? (_jsx(ErrorState, { onRetry: () => void openAlertsQuery.refetch() })) : (openAlertsQuery.data?.items.length ?? 0) === 0 ? (_jsx(EmptyState, { title: "Aucune alerte en attente", description: "Toutes les alertes du p\u00E9rim\u00E8tre ont ete traitees.", icon: _jsx(BellRing, { className: "h-5 w-5" }) })) : (_jsxs(TableWrap, { children: [_jsxs(THead, { children: [_jsx(TH, { children: "R\u00E9f\u00E9rence" }), _jsx(TH, { children: "Nature" }), _jsx(TH, { children: "Client / lieu" }), _jsx(TH, { children: "D\u00E9clench\u00E9e" }), _jsx(TH, { children: "Gravit\u00E9" })] }), _jsx(TBody, { children: openAlertsQuery.data?.items.map((alert) => (_jsxs(TR, { onClick: () => navigate(`/alertes/${alert.id}`), children: [_jsxs(TD, { className: "font-mono text-xs font-semibold text-slate-900 dark:text-white", children: [alert.reference, alert.occurrenceCount > 1 ? (_jsxs("span", { className: "ml-1.5 rounded bg-amber-100 px-1 text-[10px] text-amber-700 dark:bg-amber-500/20 dark:text-amber-300", children: ["\u00D7", alert.occurrenceCount] })) : null] }), _jsx(TD, { children: _jsxs("span", { className: "flex items-center gap-2", children: [_jsx(TypeIcon, { type: alert.type }), describe(ALERT_TYPE, alert.type).label] }) }), _jsxs(TD, { className: "max-w-[220px] truncate", children: [alert.client?.fullName ?? alert.metadata?.clientName?.toString() ?? '—', _jsx("span", { className: "ml-1 text-xs text-slate-400", children: alert.city ?? '' })] }), _jsx(TD, { className: "text-xs text-slate-500 dark:text-slate-400", children: formatRelative(alert.openedAt) }), _jsx(TD, { children: _jsx(Badge, { tone: describe(ALERT_SEVERITY, alert.severity).tone, children: describe(ALERT_SEVERITY, alert.severity).label }) })] }, alert.id))) })] }))] }), _jsxs(Card, { children: [_jsx(CardHeader, { title: "Flux temps r\u00E9el", description: "Derniers \u00E9v\u00E9nements re\u00E7us du parc", actions: _jsx(Badge, { tone: connected ? 'success' : 'neutral', dot: true, children: connected ? 'Live' : 'Pause' }) }), _jsx(CardBody, { className: "pt-2", children: recentEvents.length === 0 ? (_jsx(EmptyState, { title: "En attente d'\u00E9v\u00E9nements", description: "Les alertes, appels vocaux et affectations s'afficheront ici.", icon: _jsx(Radio, { className: "h-5 w-5" }) })) : (_jsx("ol", { className: "space-y-3", children: recentEvents.slice(0, 8).map((event, index) => (_jsxs("li", { className: "flex gap-3", children: [_jsx("span", { className: "mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500 pulse-ring" }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsxs("p", { className: "truncate text-xs font-semibold text-slate-800 dark:text-slate-100", children: [event.type.replace('alert.', '').replace('_', ' '), " \u2014 ", event.reference] }), _jsxs("p", { className: "truncate text-[11px] text-slate-500 dark:text-slate-400", children: [describe(ALERT_TYPE, event.alertType).label, " \u00B7 ", describe(ALERT_SEVERITY, event.severity).label, " \u00B7", ' ', formatRelative(event.occurredAt)] })] }), _jsx(Badge, { tone: SEVERITY_CARD_TONE[event.severity], children: describe(ALERT_STATUS, event.status).label })] }, `${event.alertId}-${index}`))) })) })] })] }), _jsxs(Card, { children: [_jsx(CardHeader, { title: "Sant\u00E9 du parc", description: "Centrales SafAlert Solar G1 rattachees a votre p\u00E9rim\u00E8tre", icon: _jsx(Wifi, { className: "h-4 w-4" }) }), _jsxs(CardBody, { className: "grid gap-3 sm:grid-cols-3", children: [_jsxs("div", { className: "rounded-xl border border-slate-200 p-3 dark:border-slate-800", children: [_jsx("p", { className: "text-xs text-slate-500 dark:text-slate-400", children: "Centrales actives" }), _jsx("p", { className: "mt-1 text-xl font-semibold text-emerald-600 dark:text-emerald-400", children: formatNumber(fleet.online) })] }), _jsxs("div", { className: "rounded-xl border border-slate-200 p-3 dark:border-slate-800", children: [_jsx("p", { className: "text-xs text-slate-500 dark:text-slate-400", children: "Hors ligne" }), _jsx("p", { className: "mt-1 text-xl font-semibold text-amber-600 dark:text-amber-400", children: formatNumber(fleet.offline) })] }), _jsxs("div", { className: "rounded-xl border border-slate-200 p-3 dark:border-slate-800", children: [_jsx("p", { className: "text-xs text-slate-500 dark:text-slate-400", children: "Codes sous-appareils suivis" }), _jsx("p", { className: "mt-1 text-xl font-semibold text-slate-900 dark:text-white", children: formatNumber(Object.keys(SUB_DEVICE_CODE).length) })] })] })] })] }));
};
/** Petite liste de paires libelle / valeur. */
const DescriptionListCompact = ({ items }) => (_jsx("div", { className: "mt-3 space-y-1 border-t border-slate-100 pt-3 dark:border-slate-800", children: items.map(([label, value]) => (_jsx(DataRow, { label: label, value: value }, label))) }));
