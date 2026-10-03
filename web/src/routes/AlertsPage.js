import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BellRing, Filter, Flame, HeartPulse, PhoneCall, RotateCcw, Search, ShieldAlert, Siren, TriangleAlert, } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AlertDetailDrawer } from '@/components/alerts/AlertDetailDrawer';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/Feedback';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Pagination, TBody, TD, TH, THead, TR, TableWrap } from '@/components/ui/Table';
import { useAlerts, useAlertStats, useClients } from '@/hooks/queries';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatRelative } from '@/lib/format';
import { ALERT_SEVERITY, ALERT_SOURCE, ALERT_STATUS, ALERT_TYPE, DISPATCH_STATUS, VOICE_CALL_OUTCOME, describe, } from '@/lib/labels';
import { useAuthStore } from '@/store/auth';
import { useUiStore } from '@/store/ui';
const ALERT_TYPES = ['INTRUSION', 'FIRE', 'MEDICAL', 'SABOTAGE', 'PANIC', 'GAS_LEAK', 'WATER_LEAK', 'SYSTEM'];
const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const STATUSES = ['NEW', 'ACKNOWLEDGED', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'FALSE_ALARM', 'CANCELLED'];
const OPERATOR_ROLES = [
    'SUPER_ADMIN',
    'NATIONAL_DIRECTOR',
    'TECHNICAL_DIRECTOR',
    'PLATFORM_MANAGER',
    'REGION_MANAGER',
    'AGENCY_MANAGER',
    'OPERATOR',
    'SUPERVISOR',
    'STATION_AGENT',
];
const TypeIcon = ({ type }) => {
    const className = 'h-4 w-4';
    if (type === 'FIRE')
        return _jsx(Flame, { className: cn(className, 'text-red-500') });
    if (type === 'MEDICAL')
        return _jsx(HeartPulse, { className: cn(className, 'text-rose-500') });
    if (type === 'GAS_LEAK' || type === 'WATER_LEAK')
        return _jsx(TriangleAlert, { className: cn(className, 'text-orange-500') });
    if (type === 'PANIC')
        return _jsx(Siren, { className: cn(className, 'text-red-600') });
    return _jsx(ShieldAlert, { className: cn(className, 'text-amber-500') });
};
export const AlertsPage = () => {
    const navigate = useNavigate();
    const { alertId } = useParams();
    const [searchParams, setSearchParams] = useSearchParams();
    const queryClient = useQueryClient();
    const pushToast = useUiStore((state) => state.pushToast);
    const hasRole = useAuthStore((state) => state.hasRole);
    const [page, setPage] = useState(1);
    const [searchDraft, setSearchDraft] = useState('');
    const [search, setSearch] = useState('');
    const [manualOpen, setManualOpen] = useState(false);
    const [manualClientId, setManualClientId] = useState('');
    const [manualType, setManualType] = useState('INTRUSION');
    const [manualNote, setManualNote] = useState('');
    const [manualSeverity, setManualSeverity] = useState('');
    const openOnly = searchParams.get('openOnly') === 'true';
    const status = searchParams.get('status') ?? '';
    const type = searchParams.get('type') ?? '';
    const severity = searchParams.get('severity') ?? '';
    const setFilter = useCallback((key, value) => {
        const next = new URLSearchParams(searchParams);
        if (value)
            next.set(key, value);
        else
            next.delete(key);
        setSearchParams(next, { replace: true });
        setPage(1);
    }, [searchParams, setSearchParams]);
    const params = useMemo(() => ({
        page,
        limit: 20,
        order: 'desc',
        ...(openOnly ? { openOnly: 'true' } : {}),
        ...(status ? { status } : {}),
        ...(type ? { type } : {}),
        ...(severity ? { severity } : {}),
        ...(search ? { search } : {}),
    }), [page, openOnly, status, type, severity, search]);
    const alertsQuery = useAlerts(params);
    const statsQuery = useAlertStats();
    const clientsQuery = useClients({ limit: 100, status: 'ACTIVE' });
    const trigger = useMutation({
        mutationFn: async () => api.post('/alerts', {
            type: manualType,
            clientId: manualClientId,
            note: manualNote || undefined,
            ...(manualSeverity ? { severity: manualSeverity } : {}),
        }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['alerts'] });
            setManualOpen(false);
            setManualNote('');
            pushToast({ tone: 'warning', title: 'Alerte déclenchée', description: 'Le protocole de qualification a demarre.' });
        },
        onError: (error) => pushToast({ tone: 'danger', title: 'Déclenchement refusé', description: error.message }),
    });
    const hasFilters = Boolean(openOnly || status || type || severity || search);
    const resetFilters = () => {
        setSearchParams(new URLSearchParams(), { replace: true });
        setSearchDraft('');
        setSearch('');
        setPage(1);
    };
    return (_jsxs("div", { className: "space-y-5", children: [_jsx("div", { className: "grid gap-3 sm:grid-cols-3 xl:grid-cols-5", children: [
                    { label: 'Ouvertes', value: statsQuery.data?.open ?? 0, tone: 'critical' },
                    { label: 'Nouvelles', value: statsQuery.data?.byStatus.find((row) => row.status === 'NEW')?.count ?? 0, tone: 'danger' },
                    { label: 'En intervention', value: statsQuery.data?.byStatus.find((row) => row.status === 'IN_PROGRESS')?.count ?? 0, tone: 'warning' },
                    { label: 'Cloturees', value: statsQuery.data?.byStatus.find((row) => row.status === 'RESOLVED')?.count ?? 0, tone: 'success' },
                    { label: 'Dernières 24 h', value: statsQuery.data?.last24h ?? 0, tone: 'info' },
                ].map((item) => (_jsxs(Card, { className: "p-3", children: [_jsx("p", { className: "text-[11px] font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400", children: item.label }), _jsxs("div", { className: "mt-1 flex items-center gap-2", children: [_jsx("span", { className: "text-xl font-semibold text-slate-900 tabular-nums dark:text-white", children: item.value }), _jsx(Badge, { tone: item.tone, dot: item.tone === 'critical' })] })] }, item.label))) }), _jsx(Card, { children: _jsxs(CardBody, { className: "space-y-3 pt-4", children: [_jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [_jsxs("form", { className: "relative min-w-[220px] flex-1", onSubmit: (event) => {
                                        event.preventDefault();
                                        setSearch(searchDraft.trim());
                                        setPage(1);
                                    }, children: [_jsx(Search, { className: "pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-slate-400" }), _jsx(Input, { value: searchDraft, onChange: (event) => setSearchDraft(event.target.value), placeholder: "R\u00E9f\u00E9rence, client, ID Zengo, ville, message...", className: "pl-9" })] }), _jsxs("button", { type: "button", onClick: () => setFilter('openOnly', openOnly ? '' : 'true'), className: cn('flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors', openOnly
                                        ? 'border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-500/40 dark:bg-brand-500/10 dark:text-brand-300'
                                        : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800/50'), children: [_jsx(Filter, { className: "h-3.5 w-3.5" }), "Uniquement les alertes ouvertes"] }), hasFilters ? (_jsx(Button, { variant: "ghost", size: "sm", icon: _jsx(RotateCcw, { className: "h-3.5 w-3.5" }), onClick: resetFilters, children: "R\u00E9initialiser" })) : null, hasRole(...OPERATOR_ROLES) ? (_jsx(Button, { icon: _jsx(BellRing, { className: "h-4 w-4" }), onClick: () => setManualOpen(true), children: "Declencher une alerte" })) : null] }), _jsxs("div", { className: "grid gap-2 sm:grid-cols-3", children: [_jsxs(Select, { value: status, onChange: (event) => setFilter('status', event.target.value), children: [_jsx("option", { value: "", children: "Tous les statuts" }), STATUSES.map((value) => (_jsx("option", { value: value, children: describe(ALERT_STATUS, value).label }, value)))] }), _jsxs(Select, { value: type, onChange: (event) => setFilter('type', event.target.value), children: [_jsx("option", { value: "", children: "Toutes les natures" }), ALERT_TYPES.map((value) => (_jsx("option", { value: value, children: describe(ALERT_TYPE, value).label }, value)))] }), _jsxs(Select, { value: severity, onChange: (event) => setFilter('severity', event.target.value), children: [_jsx("option", { value: "", children: "Toutes les gravites" }), SEVERITIES.map((value) => (_jsx("option", { value: value, children: describe(ALERT_SEVERITY, value).label }, value)))] })] })] }) }), _jsx(Card, { className: "overflow-hidden", children: alertsQuery.isLoading ? (_jsx(TableSkeleton, { rows: 8, columns: 6 })) : alertsQuery.isError ? (_jsx(ErrorState, { onRetry: () => void alertsQuery.refetch() })) : (alertsQuery.data?.items.length ?? 0) === 0 ? (_jsx(EmptyState, { title: "Aucune alerte ne correspond aux filtres", description: "Ajustez la p\u00E9riode ou reinitialisez les filtres pour elargir la recherche.", icon: _jsx(BellRing, { className: "h-5 w-5" }), action: hasFilters ? (_jsx(Button, { variant: "secondary", size: "sm", onClick: resetFilters, children: "R\u00E9initialiser les filtres" })) : undefined })) : (_jsxs(_Fragment, { children: [_jsxs(TableWrap, { children: [_jsxs(THead, { children: [_jsx(TH, { children: "R\u00E9f\u00E9rence" }), _jsx(TH, { children: "Nature" }), _jsx(TH, { children: "Gravit\u00E9" }), _jsx(TH, { children: "Statut" }), _jsx(TH, { children: "Client" }), _jsx(TH, { children: "Source" }), _jsx(TH, { children: "Engagement" }), _jsx(TH, { children: "Appel IA" }), _jsx(TH, { className: "text-right", children: "D\u00E9clench\u00E9e" })] }), _jsx(TBody, { children: alertsQuery.data?.items.map((alert) => (_jsxs(TR, { onClick: () => navigate(`/alertes/${alert.id}`), children: [_jsxs(TD, { className: "font-mono text-xs font-semibold text-slate-900 dark:text-white", children: [alert.reference, alert.occurrenceCount > 1 ? (_jsxs("span", { className: "ml-1.5 rounded bg-amber-100 px-1 text-[10px] text-amber-700 dark:bg-amber-500/20 dark:text-amber-300", children: ["\u00D7", alert.occurrenceCount] })) : null] }), _jsx(TD, { children: _jsxs("span", { className: "flex items-center gap-2 whitespace-nowrap", children: [_jsx(TypeIcon, { type: alert.type }), describe(ALERT_TYPE, alert.type).label] }) }), _jsx(TD, { children: _jsx(Badge, { tone: describe(ALERT_SEVERITY, alert.severity).tone, children: describe(ALERT_SEVERITY, alert.severity).label }) }), _jsx(TD, { children: _jsx(Badge, { tone: describe(ALERT_STATUS, alert.status).tone, dot: alert.status === 'NEW', children: describe(ALERT_STATUS, alert.status).label }) }), _jsxs(TD, { className: "max-w-[200px]", children: [_jsx("span", { className: "block truncate", children: alert.client?.fullName ?? '—' }), _jsx("span", { className: "block truncate font-mono text-[11px] text-slate-400", children: alert.city ?? alert.client?.zengoId ?? '' })] }), _jsx(TD, { className: "whitespace-nowrap text-xs", children: describe(ALERT_SOURCE, alert.source).label }), _jsx(TD, { children: alert.dispatches?.length ? (_jsxs("span", { className: "flex flex-wrap gap-1", children: [alert.dispatches.slice(0, 2).map((item) => (_jsx(Badge, { tone: describe(DISPATCH_STATUS, item.status).tone, children: item.station?.name ?? 'Station' }, item.id))), alert.dispatches.length > 2 ? (_jsxs(Badge, { tone: "neutral", children: ["+", alert.dispatches.length - 2] })) : null] })) : (_jsx("span", { className: "text-xs text-slate-400", children: "\u2014" })) }), _jsx(TD, { children: alert.voiceCallOutcome ? (_jsxs("span", { className: "flex items-center gap-1.5 whitespace-nowrap text-xs", children: [_jsx(PhoneCall, { className: "h-3.5 w-3.5 text-slate-400" }), describe(VOICE_CALL_OUTCOME, alert.voiceCallOutcome).label] })) : (_jsx("span", { className: "text-xs text-slate-400", children: "\u2014" })) }), _jsx(TD, { className: "text-right text-xs whitespace-nowrap text-slate-500 dark:text-slate-400", children: formatRelative(alert.openedAt) })] }, alert.id))) })] }), alertsQuery.data ? (_jsx(Pagination, { page: alertsQuery.data, onPageChange: setPage })) : null] })) }), _jsx(AlertDetailDrawer, { alertId: alertId ?? null, onClose: () => navigate('/alertes', { replace: true }) }), _jsx(Modal, { open: manualOpen, onClose: () => setManualOpen(false), title: "Declencher une alerte", description: "A utiliser lorsque le client signale un incident par t\u00E9l\u00E9phone ou lors d'une v\u00E9rification terrain.", size: "sm", footer: _jsxs(_Fragment, { children: [_jsx(Button, { variant: "ghost", onClick: () => setManualOpen(false), children: "Annuler" }), _jsx(Button, { variant: "danger", loading: trigger.isPending, disabled: !manualClientId, icon: _jsx(BellRing, { className: "h-4 w-4" }), onClick: () => trigger.mutate(), children: "Declencher" })] }), children: _jsxs("div", { className: "space-y-4", children: [_jsx(Field, { label: "Client concerne", required: true, children: _jsxs(Select, { value: manualClientId, onChange: (event) => setManualClientId(event.target.value), children: [_jsx("option", { value: "", children: "S\u00E9lectionner un compte client\u2026" }), clientsQuery.data?.items.map((client) => (_jsxs("option", { value: client.id, children: [client.fullName, " \u2014 ", client.zengoId, " (", client.city ?? 'ville inconnue', ")"] }, client.id)))] }) }), _jsxs("div", { className: "grid gap-4 sm:grid-cols-2", children: [_jsx(Field, { label: "Nature de l'alerte", required: true, children: _jsx(Select, { value: manualType, onChange: (event) => setManualType(event.target.value), children: ALERT_TYPES.map((value) => (_jsx("option", { value: value, children: describe(ALERT_TYPE, value).label }, value))) }) }), _jsx(Field, { label: "Gravit\u00E9", hint: "Laisser vide pour le calcul automatique", children: _jsxs(Select, { value: manualSeverity, onChange: (event) => setManualSeverity(event.target.value), children: [_jsx("option", { value: "", children: "Automatique" }), SEVERITIES.map((value) => (_jsx("option", { value: value, children: describe(ALERT_SEVERITY, value).label }, value)))] }) })] }), _jsx(Field, { label: "Commentaire", hint: "Contexte transmis aux \u00E9quipes d'intervention.", children: _jsx(Textarea, { rows: 3, value: manualNote, onChange: (event) => setManualNote(event.target.value), placeholder: "Appel du client : fum\u00E9e signal\u00E9e au niveau du d\u00E9p\u00F4t arri\u00E8re." }) }), _jsxs("p", { className: "flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-200", children: [_jsx(TriangleAlert, { className: "mt-0.5 h-3.5 w-3.5 shrink-0" }), "Un appel vocal de qualification peut etre d\u00E9clenche automatiquement apr\u00E8s cr\u00E9ation."] })] }) })] }));
};
