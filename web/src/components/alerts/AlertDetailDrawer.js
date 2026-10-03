import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, Ban, CheckCircle2, ChevronRight, Clock, Flame, HeartPulse, MapPin, MessageSquarePlus, Phone, PhoneCall, Radio, Send, ShieldAlert, Siren, TriangleAlert, X, } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, DataRow, DescriptionList } from '@/components/ui/Card';
import { EmptyState, ErrorState, InlineEmpty, Skeleton } from '@/components/ui/Feedback';
import { Field, Select, Textarea } from '@/components/ui/Field';
import { Drawer, Modal } from '@/components/ui/Modal';
import { Tabs } from '@/components/ui/Tabs';
import { useAlert, useAlertStations, useAlertTimeline, useAlertVoiceCalls } from '@/hooks/queries';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatCoordinates, formatDateTime, formatDuration, formatRelative, formatTime } from '@/lib/format';
import { ALERT_EVENT, ALERT_RESOLUTION, ALERT_SEVERITY, ALERT_SOURCE, ALERT_STATUS, ALERT_TYPE, ARM_MODE, DEVICE_STATUS, DISPATCH_STATUS, LANGUAGE, SUB_DEVICE_CODE, SUBSCRIPTION_STATUS, STATION_TYPE, VOICE_CALL_OUTCOME, VOICE_CALL_STATUS, describe, } from '@/lib/labels';
import { useAuthStore } from '@/store/auth';
import { useUiStore } from '@/store/ui';
const OPEN_STATUSES = ['NEW', 'ACKNOWLEDGED', 'ASSIGNED', 'IN_PROGRESS'];
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
const RESOLUTIONS = [
    'CLIENT_CONFIRMED',
    'HANDLED_BY_TEAM',
    'NO_ACTION_REQUIRED',
    'TECHNICAL_ISSUE',
    'MAINTENANCE_TEST',
];
const TypeGlyph = ({ type }) => {
    const className = 'h-5 w-5';
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
export const AlertDetailDrawer = ({ alertId, onClose }) => {
    const queryClient = useQueryClient();
    const pushToast = useUiStore((state) => state.pushToast);
    const hasRole = useAuthStore((state) => state.hasRole);
    const canOperate = hasRole(...OPERATOR_ROLES);
    const [tab, setTab] = useState('dossier');
    const [noteDraft, setNoteDraft] = useState('');
    const [resolveOpen, setResolveOpen] = useState(false);
    const [dispatchOpen, setDispatchOpen] = useState(false);
    const [resolution, setResolution] = useState('HANDLED_BY_TEAM');
    const [resolutionNote, setResolutionNote] = useState('');
    const [selectedStations, setSelectedStations] = useState([]);
    const alertQuery = useAlert(alertId ?? undefined);
    const timelineQuery = useAlertTimeline(alertId ?? undefined);
    const callsQuery = useAlertVoiceCalls(alertId ?? undefined);
    const alert = alertQuery.data;
    const stationsQuery = useAlertStations(dispatchOpen ? alert?.organizationId : null);
    const invalidate = () => {
        void queryClient.invalidateQueries({ queryKey: ['alerts'] });
    };
    const reportError = (message) => pushToast({ tone: 'danger', title: 'Action refusée', description: message });
    const action = useMutation({
        mutationFn: async (input) => api.post(`/alerts/${alertId}/${input.path}`, input.body ?? {}),
        onSuccess: (_data, variables) => {
            invalidate();
            const labels = {
                acknowledge: 'Alerte prise en charge',
                escalate: 'Escalade transmise',
                cancel: "Alerte annulée",
                'false-alarm': 'Classée en faux positif',
                notes: 'Note ajoutée au dossier',
            };
            pushToast({ tone: 'success', title: labels[variables.path] ?? 'Action enregistrée' });
        },
        onError: (error) => reportError(error.message),
    });
    const dispatch = useMutation({
        mutationFn: async (stationIds) => api.post(`/alerts/${alertId}/dispatch`, stationIds.length ? { stationIds } : {}),
        onSuccess: () => {
            invalidate();
            setDispatchOpen(false);
            setSelectedStations([]);
            pushToast({
                tone: 'brand',
                title: 'Mission transmise',
                description: 'Les stations selectionnees ont ete notifiées.',
            });
        },
        onError: (error) => reportError(error.message),
    });
    const resolve = useMutation({
        mutationFn: async () => api.post(`/alerts/${alertId}/resolve`, { resolution, note: resolutionNote || undefined }),
        onSuccess: () => {
            invalidate();
            setResolveOpen(false);
            setResolutionNote('');
            pushToast({ tone: 'success', title: 'Alerte clôturée', description: 'Le compte rendu a été enregistre.' });
        },
        onError: (error) => reportError(error.message),
    });
    const updateDispatch = useMutation({
        mutationFn: async (input) => api.patch(`/alerts/${alertId}/dispatches/${input.dispatchId}`, { status: input.status }),
        onSuccess: () => {
            invalidate();
            pushToast({ tone: 'success', title: 'Statut de mission mis a jour' });
        },
        onError: (error) => reportError(error.message),
    });
    const isOpen = alert ? OPEN_STATUSES.includes(alert.status) : false;
    return (_jsxs(_Fragment, { children: [_jsx(Drawer, { open: Boolean(alertId), onClose: onClose, width: "lg", children: alertQuery.isLoading ? (_jsxs("div", { className: "space-y-3 p-6", children: [_jsx(Skeleton, { className: "h-6 w-40" }), _jsx(Skeleton, { className: "h-24 w-full" }), _jsx(Skeleton, { className: "h-40 w-full" })] })) : alertQuery.isError || !alert ? (_jsx("div", { className: "p-6", children: _jsx(ErrorState, { message: "Cette alerte est introuvable ou hors de votre p\u00E9rim\u00E8tre.", onRetry: () => void alertQuery.refetch() }) })) : (_jsxs(_Fragment, { children: [_jsxs("header", { className: "border-b border-slate-200 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-900", children: [_jsxs("div", { className: "flex items-start justify-between gap-4", children: [_jsxs("div", { className: "flex min-w-0 items-start gap-3", children: [_jsx("span", { className: "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800", children: _jsx(TypeGlyph, { type: alert.type }) }), _jsxs("div", { className: "min-w-0", children: [_jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [_jsx("h2", { className: "font-mono text-sm font-semibold text-slate-900 dark:text-white", children: alert.reference }), _jsx(Badge, { tone: describe(ALERT_SEVERITY, alert.severity).tone, children: describe(ALERT_SEVERITY, alert.severity).label }), _jsx(Badge, { tone: describe(ALERT_STATUS, alert.status).tone, dot: true, children: describe(ALERT_STATUS, alert.status).label }), alert.occurrenceCount > 1 ? _jsxs(Badge, { tone: "warning", children: ["\u00D7", alert.occurrenceCount, " d\u00E9clenchements"] }) : null] }), _jsxs("p", { className: "mt-1 truncate text-sm text-slate-600 dark:text-slate-300", children: [describe(ALERT_TYPE, alert.type).label, " \u00B7 ", alert.client?.fullName ?? 'Client non rattaché'] }), _jsxs("p", { className: "mt-0.5 text-xs text-slate-500 dark:text-slate-400", children: ["D\u00E9clench\u00E9e ", formatRelative(alert.openedAt), " (", formatDateTime(alert.openedAt), ") \u00B7", ' ', describe(ALERT_SOURCE, alert.source).label] })] })] }), _jsx(Button, { variant: "ghost", size: "icon", onClick: onClose, "aria-label": "Fermer", children: _jsx(X, { className: "h-4 w-4" }) })] }), canOperate ? (_jsxs("div", { className: "mt-4 flex flex-wrap gap-2", children: [_jsx(Button, { size: "sm", variant: "secondary", icon: _jsx(BadgeCheck, { className: "h-3.5 w-3.5" }), disabled: !isOpen || alert.status !== 'NEW' || action.isPending, onClick: () => action.mutate({ path: 'acknowledge' }), children: "Prendre en charge" }), _jsx(Button, { size: "sm", icon: _jsx(Send, { className: "h-3.5 w-3.5" }), disabled: !isOpen, onClick: () => setDispatchOpen(true), children: "Engager les secours" }), _jsx(Button, { size: "sm", variant: "outline", icon: _jsx(Radio, { className: "h-3.5 w-3.5" }), disabled: !isOpen || action.isPending, onClick: () => action.mutate({ path: 'escalate', body: { reason: 'Escalade manuelle depuis la console.' } }), children: "Escalader" }), _jsx(Button, { size: "sm", variant: "success", icon: _jsx(CheckCircle2, { className: "h-3.5 w-3.5" }), disabled: !isOpen, onClick: () => setResolveOpen(true), children: "Cl\u00F4turer" }), _jsx(Button, { size: "sm", variant: "ghost", icon: _jsx(Ban, { className: "h-3.5 w-3.5" }), disabled: !isOpen || action.isPending, onClick: () => action.mutate({ path: 'false-alarm', body: { resolution: 'TECHNICAL_ISSUE' } }), children: "Faux positif" })] })) : null] }), _jsx("div", { className: "px-5 pt-3", children: _jsx(Tabs, { items: [
                                    { id: 'dossier', label: 'Dossier' },
                                    { id: 'chronologie', label: 'Chronologie', count: timelineQuery.data?.length },
                                    { id: 'appels', label: 'Appels IA', count: callsQuery.data?.length },
                                ], value: tab, onChange: setTab }) }), _jsxs("div", { className: "min-h-0 flex-1 overflow-y-auto px-5 py-4", children: [tab === 'dossier' ? (_jsxs("div", { className: "space-y-4", children: [_jsxs(Card, { children: [_jsx(CardHeader, { title: "\u00C9quipes engagees", description: "Stations du point de distribution notifi\u00E9es", icon: _jsx(Siren, { className: "h-4 w-4" }) }), alert.dispatches?.length ? (_jsx(CardBody, { className: "space-y-2 pt-3", children: alert.dispatches.map((item) => (_jsxs("div", { className: "rounded-xl border border-slate-200 p-3 dark:border-slate-800", children: [_jsxs("div", { className: "flex flex-wrap items-center justify-between gap-2", children: [_jsxs("div", { className: "min-w-0", children: [_jsxs("p", { className: "truncate text-sm font-medium text-slate-800 dark:text-slate-100", children: [item.station?.name ?? 'Station', item.isEscalation ? (_jsx("span", { className: "ml-2 align-middle", children: _jsx(Badge, { tone: "critical", children: "Escalade" }) })) : null] }), _jsxs("p", { className: "mt-0.5 text-xs text-slate-500 dark:text-slate-400", children: ["Notifi\u00E9e ", formatRelative(item.notifiedAt), item.respondedAt ? ` · réponse ${formatRelative(item.respondedAt)}` : ''] })] }), _jsx(Badge, { tone: describe(DISPATCH_STATUS, item.status).tone, children: describe(DISPATCH_STATUS, item.status).label })] }), canOperate && isOpen && item.status !== 'COMPLETED' && item.status !== 'DECLINED' ? (_jsx("div", { className: "mt-3 flex flex-wrap gap-1.5", children: ['ACKNOWLEDGED', 'ARRIVED', 'COMPLETED', 'DECLINED'].map((status) => (_jsx(Button, { size: "sm", variant: "outline", disabled: updateDispatch.isPending, onClick: () => updateDispatch.mutate({ dispatchId: item.id, status }), children: describe(DISPATCH_STATUS, status).label }, status))) })) : null] }, item.id))) })) : (_jsx(InlineEmpty, { children: "Aucune \u00E9quipe engag\u00E9e pour l'instant." }))] }), _jsxs("div", { className: "grid gap-4 sm:grid-cols-2", children: [_jsxs(Card, { children: [_jsx(CardHeader, { title: "Client", icon: _jsx(Phone, { className: "h-4 w-4" }) }), _jsx(CardBody, { className: "pt-2", children: _jsxs(DescriptionList, { children: [_jsx(DataRow, { label: "Titulaire", value: alert.client ? (_jsxs(Link, { to: `/clients/${alert.client.id}`, className: "inline-flex items-center gap-1 text-brand-600 hover:underline dark:text-brand-400", children: [alert.client.fullName, _jsx(ChevronRight, { className: "h-3.5 w-3.5" })] })) : ('—') }), _jsx(DataRow, { label: "ID Zengo", value: _jsx("span", { className: "font-mono", children: alert.client?.zengoId ?? '—' }) }), _jsx(DataRow, { label: "T\u00E9l\u00E9phone", value: alert.client?.primaryPhone ?? '—' }), _jsx(DataRow, { label: "Langue", value: LANGUAGE[alert.client?.preferredLanguage ?? 'fr'] ?? '—' }), _jsx(DataRow, { label: "Abonnement", value: alert.client ? (_jsx(Badge, { tone: describe(SUBSCRIPTION_STATUS, alert.client.subscriptionStatus).tone, children: describe(SUBSCRIPTION_STATUS, alert.client.subscriptionStatus).label })) : ('—') })] }) })] }), _jsxs(Card, { children: [_jsx(CardHeader, { title: "Localisation & equipement", icon: _jsx(MapPin, { className: "h-4 w-4" }) }), _jsx(CardBody, { className: "pt-2", children: _jsxs(DescriptionList, { children: [_jsx(DataRow, { label: "Adresse", value: alert.address ?? alert.client?.address ?? '—' }), _jsx(DataRow, { label: "Ville", value: alert.city ?? alert.client?.city ?? '—' }), _jsx(DataRow, { label: "Coordonnees", value: _jsx("span", { className: "font-mono text-xs", children: formatCoordinates(alert.latitude ?? alert.client?.latitude, alert.longitude ?? alert.client?.longitude) }) }), _jsx(DataRow, { label: "Centrale", value: alert.device ? _jsx("span", { className: "font-mono", children: alert.device.serialNumber }) : '—' }), _jsx(DataRow, { label: "\u00C9tat", value: alert.device ? (_jsxs("span", { className: "flex items-center justify-end gap-1.5", children: [_jsx(Badge, { tone: describe(DEVICE_STATUS, alert.device.status).tone, children: describe(DEVICE_STATUS, alert.device.status).label }), _jsx(Badge, { tone: describe(ARM_MODE, alert.device.armMode).tone, children: describe(ARM_MODE, alert.device.armMode).label })] })) : ('—') }), _jsx(DataRow, { label: "Sous-appareil", value: alert.subDeviceCode
                                                                            ? `${describe(SUB_DEVICE_CODE, alert.subDeviceCode).label} (${alert.subDeviceCode})`
                                                                            : (alert.rawType ?? '—') })] }) })] })] }), _jsxs(Card, { children: [_jsx(CardHeader, { title: "Contexte de l'alerte", icon: _jsx(MessageSquarePlus, { className: "h-4 w-4" }) }), _jsxs(CardBody, { className: "space-y-3 pt-3", children: [_jsx("p", { className: "rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:bg-slate-800/60 dark:text-slate-200", children: alert.triggerMessage ?? 'Aucun message transmis par le dispositif.' }), alert.resolutionNote ? (_jsxs("p", { className: "rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200", children: [_jsx("strong", { className: "font-semibold", children: "Compte rendu :" }), " ", alert.resolutionNote] })) : null, alert.resolution ? (_jsx(DataRow, { label: "Classement", value: describe(ALERT_RESOLUTION, alert.resolution).label })) : null, _jsx(DataRow, { label: "Confirmation client", value: alert.clientConfirmed ? 'Confirmée' : 'Non confirmée' }), _jsx(DataRow, { label: "Appel vocal", value: describe(VOICE_CALL_OUTCOME, alert.voiceCallOutcome).label }), canOperate ? (_jsxs("div", { className: "space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800", children: [_jsx(Textarea, { rows: 2, value: noteDraft, onChange: (event) => setNoteDraft(event.target.value), placeholder: "Ajouter une note au dossier d'intervention (visite, contact, contrainte terrain...)" }), _jsx("div", { className: "flex justify-end", children: _jsx(Button, { size: "sm", variant: "secondary", icon: _jsx(MessageSquarePlus, { className: "h-3.5 w-3.5" }), disabled: noteDraft.trim().length === 0 || action.isPending, onClick: () => {
                                                                            action.mutate({ path: 'notes', body: { note: noteDraft.trim() } });
                                                                            setNoteDraft('');
                                                                        }, children: "Enregistrer la note" }) })] })) : null] })] })] })) : null, tab === 'chronologie' ? (timelineQuery.isLoading ? (_jsx(Skeleton, { className: "h-40 w-full" })) : (timelineQuery.data?.length ?? 0) === 0 ? (_jsx(EmptyState, { title: "Aucun \u00E9v\u00E9nement", icon: _jsx(Clock, { className: "h-5 w-5" }) })) : (_jsx("ol", { className: "relative space-y-4 border-l border-slate-200 pl-5 dark:border-slate-800", children: timelineQuery.data?.map((event) => {
                                        const meta = describe(ALERT_EVENT, event.type);
                                        return (_jsxs("li", { className: "relative", children: [_jsx("span", { className: cn('absolute top-1.5 -left-[27px] h-3 w-3 rounded-full ring-4 ring-slate-50 dark:ring-slate-950', meta.tone === 'critical'
                                                        ? 'bg-red-600'
                                                        : meta.tone === 'success'
                                                            ? 'bg-emerald-500'
                                                            : meta.tone === 'brand'
                                                                ? 'bg-brand-500'
                                                                : 'bg-slate-400') }), _jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [_jsx(Badge, { tone: meta.tone, children: meta.label }), _jsx("span", { className: "text-xs text-slate-400", children: formatDateTime(event.createdAt) })] }), event.message ? (_jsx("p", { className: "mt-1 text-sm text-slate-700 dark:text-slate-200", children: event.message })) : null, _jsx("p", { className: "mt-0.5 text-xs text-slate-500 dark:text-slate-400", children: event.actorLabel ?? 'Système automatique' })] }, event.id));
                                    }) }))) : null, tab === 'appels' ? (callsQuery.isLoading ? (_jsx(Skeleton, { className: "h-32 w-full" })) : (callsQuery.data?.length ?? 0) === 0 ? (_jsx(EmptyState, { title: "Aucun appel vocal", description: "L appel IA n'a pas ete d\u00E9clenche pour cette alerte.", icon: _jsx(PhoneCall, { className: "h-5 w-5" }) })) : (_jsx("div", { className: "space-y-3", children: callsQuery.data?.map((call) => (_jsx(Card, { children: _jsxs(CardBody, { className: "space-y-2", children: [_jsxs("div", { className: "flex flex-wrap items-center justify-between gap-2", children: [_jsxs("div", { children: [_jsxs("p", { className: "text-sm font-medium text-slate-800 dark:text-slate-100", children: [call.toNumber, _jsxs("span", { className: "ml-2 text-xs font-normal text-slate-500 dark:text-slate-400", children: ["tentative ", call.attemptNumber, " \u00B7 ", LANGUAGE[call.language] ?? call.language] })] }), _jsxs("p", { className: "mt-0.5 text-xs text-slate-500 dark:text-slate-400", children: [call.provider, " \u00B7 lance ", formatRelative(call.startedAt ?? call.createdAt), call.durationSeconds ? ` · ${formatDuration(call.durationSeconds)}` : ''] })] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx(Badge, { tone: describe(VOICE_CALL_STATUS, call.status).tone, children: describe(VOICE_CALL_STATUS, call.status).label }), _jsx(Badge, { tone: describe(VOICE_CALL_OUTCOME, call.outcome).tone, children: describe(VOICE_CALL_OUTCOME, call.outcome).label })] })] }), _jsxs("div", { className: "grid gap-1 text-xs text-slate-600 dark:text-slate-300 sm:grid-cols-3", children: [_jsxs("span", { children: ["Touche DTMF : ", _jsx("strong", { className: "font-mono", children: call.dtmfDigit ?? '—' })] }), _jsxs("span", { children: ["Intention d\u00E9tect\u00E9e : ", _jsx("strong", { children: call.detectedIntent ?? '—' })] }), _jsxs("span", { children: ["Fin : ", _jsx("strong", { children: call.endedAt ? formatTime(call.endedAt) : '—' })] })] }), call.transcript ? (_jsxs("p", { className: "rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 italic dark:bg-slate-800/60 dark:text-slate-300", children: ["\u00AB ", call.transcript, " \u00BB"] })) : null, call.errorMessage ? (_jsx("p", { className: "text-xs text-rose-600 dark:text-rose-400", children: call.errorMessage })) : null] }) }, call.id))) }))) : null] })] })) }), _jsx(Modal, { open: dispatchOpen, onClose: () => setDispatchOpen(false), title: "Engager les secours", description: "S\u00E9lectionnez les stations a notifier. Sans s\u00E9lection, le syst\u00E8me applique la r\u00E8gle de dispatch automatique du type d'alerte.", footer: _jsxs(_Fragment, { children: [_jsx(Button, { variant: "ghost", onClick: () => setDispatchOpen(false), children: "Annuler" }), _jsx(Button, { icon: _jsx(Send, { className: "h-4 w-4" }), loading: dispatch.isPending, onClick: () => dispatch.mutate(selectedStations), children: selectedStations.length ? `Notifier ${selectedStations.length} station(s)` : 'Dispatch automatique' })] }), children: stationsQuery.isLoading ? (_jsx(Skeleton, { className: "h-24 w-full" })) : (stationsQuery.data?.length ?? 0) === 0 ? (_jsx(EmptyState, { title: "Aucune station disponible", description: "L'agence de rattachement du client ne poss\u00E8de pas encore de station d'intervention." })) : (_jsx("div", { className: "space-y-2", children: stationsQuery.data?.map((station) => {
                        const checked = selectedStations.includes(station.id);
                        return (_jsxs("label", { className: cn('flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-3 py-2.5 transition-colors', checked
                                ? 'border-brand-300 bg-brand-50 dark:border-brand-500/40 dark:bg-brand-500/10'
                                : 'border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50'), children: [_jsxs("div", { className: "min-w-0", children: [_jsx("p", { className: "truncate text-sm font-medium text-slate-800 dark:text-slate-100", children: station.name }), _jsxs("p", { className: "text-xs text-slate-500 dark:text-slate-400", children: [station.stationType ? describe(STATION_TYPE, station.stationType).label : 'Station', station.city ? ` · ${station.city}` : ''] })] }), _jsx("input", { type: "checkbox", className: "h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500", checked: checked, onChange: () => setSelectedStations((current) => current.includes(station.id)
                                        ? current.filter((id) => id !== station.id)
                                        : [...current, station.id]) })] }, station.id));
                    }) })) }), _jsx(Modal, { open: resolveOpen, onClose: () => setResolveOpen(false), title: "Cl\u00F4turer l'alerte", size: "sm", footer: _jsxs(_Fragment, { children: [_jsx(Button, { variant: "ghost", onClick: () => setResolveOpen(false), children: "Annuler" }), _jsx(Button, { variant: "success", loading: resolve.isPending, onClick: () => resolve.mutate(), children: "Cl\u00F4turer le dossier" })] }), children: _jsxs("div", { className: "space-y-4", children: [_jsx(Field, { label: "Classement", required: true, children: _jsx(Select, { value: resolution, onChange: (event) => setResolution(event.target.value), children: RESOLUTIONS.map((value) => (_jsx("option", { value: value, children: describe(ALERT_RESOLUTION, value).label }, value))) }) }), _jsx(Field, { label: "Compte rendu", hint: "Visible par le controle qualit\u00E9 et le client.", children: _jsx(Textarea, { rows: 4, value: resolutionNote, onChange: (event) => setResolutionNote(event.target.value), placeholder: "Intervention r\u00E9alis\u00E9e, observations, mat\u00E9riel utilis\u00E9..." }) })] }) })] }));
};
