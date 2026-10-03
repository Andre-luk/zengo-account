import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { ScrollText, Search, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/Feedback';
import { Input, Select } from '@/components/ui/Field';
import { Pagination, TBody, TD, TH, THead, TR, TableWrap } from '@/components/ui/Table';
import { useAuditLogs } from '@/hooks/queries';
import { formatDateTime, formatRelative } from '@/lib/format';
import { AUDIT_ACTION, describe } from '@/lib/labels';
const ACTIONS = [
    'LOGIN',
    'LOGIN_FAILED',
    'LOGOUT',
    'TOKEN_REFRESH',
    'PASSWORD_CHANGED',
    'PASSWORD_RESET',
    'TWO_FACTOR_ENABLED',
    'TWO_FACTOR_DISABLED',
    'CREATE',
    'UPDATE',
    'DELETE',
    'STATUS_CHANGE',
    'DEVICE_ARM',
    'DEVICE_DISARM',
    'CLIENT_MUTATION',
    'SUBSCRIPTION_ACTIVATED',
    'PERMISSION_DENIED',
];
const STATUS_TONE = (status) => {
    if (!status)
        return 'neutral';
    if (status < 300)
        return 'success';
    if (status < 400)
        return 'info';
    if (status < 500)
        return 'warning';
    return 'danger';
};
const ENTITIES = [
    'User',
    'ClientProfile',
    'Device',
    'SubDevice',
    'Alert',
    'Organization',
    'UserOrganization',
    'TariffGroup',
];
export const AuditPage = () => {
    const [page, setPage] = useState(1);
    const [searchDraft, setSearchDraft] = useState('');
    const [search, setSearch] = useState('');
    const [action, setAction] = useState('');
    const [entityType, setEntityType] = useState('');
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const params = useMemo(() => ({
        page,
        limit: 25,
        order: 'desc',
        ...(search ? { search } : {}),
        ...(action ? { action } : {}),
        ...(entityType ? { entityType } : {}),
        ...(from ? { from: new Date(from).toISOString() } : {}),
        ...(to ? { to: new Date(`${to}T23:59:59`).toISOString() } : {}),
    }), [page, search, action, entityType, from, to]);
    const logsQuery = useAuditLogs(params);
    return (_jsxs("div", { className: "space-y-5", children: [_jsx(Card, { children: _jsxs(CardBody, { className: "space-y-3 pt-4", children: [_jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [_jsxs("form", { className: "relative min-w-[240px] flex-1", onSubmit: (event) => {
                                        event.preventDefault();
                                        setSearch(searchDraft.trim());
                                        setPage(1);
                                    }, children: [_jsx(Search, { className: "pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-slate-400" }), _jsx(Input, { value: searchDraft, onChange: (event) => setSearchDraft(event.target.value), placeholder: "Acteur, chemin, entite...", className: "pl-9" })] }), _jsx(Button, { variant: "ghost", size: "sm", onClick: () => {
                                        setSearch('');
                                        setSearchDraft('');
                                        setAction('');
                                        setEntityType('');
                                        setFrom('');
                                        setTo('');
                                        setPage(1);
                                    }, children: "R\u00E9initialiser" })] }), _jsxs("div", { className: "grid gap-2 sm:grid-cols-2 xl:grid-cols-4", children: [_jsxs(Select, { value: action, onChange: (event) => {
                                        setAction(event.target.value);
                                        setPage(1);
                                    }, children: [_jsx("option", { value: "", children: "Toutes les actions" }), ACTIONS.map((value) => (_jsx("option", { value: value, children: describe(AUDIT_ACTION, value).label }, value)))] }), _jsxs(Select, { value: entityType, onChange: (event) => {
                                        setEntityType(event.target.value);
                                        setPage(1);
                                    }, children: [_jsx("option", { value: "", children: "Toutes les entites" }), ENTITIES.map((value) => (_jsx("option", { value: value, children: value }, value)))] }), _jsx(Input, { type: "date", value: from, onChange: (event) => {
                                        setFrom(event.target.value);
                                        setPage(1);
                                    } }), _jsx(Input, { type: "date", value: to, onChange: (event) => {
                                        setTo(event.target.value);
                                        setPage(1);
                                    } })] })] }) }), _jsx(Card, { className: "overflow-hidden", children: logsQuery.isLoading ? (_jsx(TableSkeleton, { rows: 10, columns: 5 })) : logsQuery.isError ? (_jsx(ErrorState, { onRetry: () => void logsQuery.refetch() })) : (logsQuery.data?.items.length ?? 0) === 0 ? (_jsx(EmptyState, { title: "Aucune entr\u00E9e", description: "Le journal enregistre les actions sensibles : connexions, mutations clients, armements, habilitations.", icon: _jsx(ScrollText, { className: "h-5 w-5" }) })) : (_jsxs(_Fragment, { children: [_jsxs(TableWrap, { children: [_jsxs(THead, { children: [_jsx(TH, { children: "Horodatage" }), _jsx(TH, { children: "Acteur" }), _jsx(TH, { children: "Action" }), _jsx(TH, { children: "Entite" }), _jsx(TH, { children: "Requ\u00EAte" }), _jsx(TH, { children: "Adresse IP" })] }), _jsx(TBody, { children: logsQuery.data?.items.map((log) => (_jsxs(TR, { children: [_jsxs(TD, { className: "whitespace-nowrap text-xs", children: [_jsx("span", { className: "block", children: formatDateTime(log.createdAt) }), _jsx("span", { className: "block text-slate-400", children: formatRelative(log.createdAt) })] }), _jsxs(TD, { className: "text-xs", children: [_jsx("span", { className: "block font-medium text-slate-800 dark:text-slate-100", children: log.actorLabel ?? 'Système' }), log.actorUserId ? (_jsx("span", { className: "block font-mono text-[10px] text-slate-400", children: log.actorUserId.slice(0, 8) })) : null] }), _jsx(TD, { children: _jsx(Badge, { tone: describe(AUDIT_ACTION, log.action).tone, children: describe(AUDIT_ACTION, log.action).label }) }), _jsxs(TD, { className: "text-xs", children: [_jsx("span", { className: "block", children: log.entityType ?? '—' }), log.entityId ? (_jsx("span", { className: "block font-mono text-[10px] text-slate-400", children: log.entityId.slice(0, 8) })) : null] }), _jsxs(TD, { className: "max-w-[240px] text-xs", children: [_jsxs("span", { className: "flex items-center gap-2", children: [_jsx("span", { className: "font-mono text-[10px] text-slate-400", children: log.httpMethod ?? '—' }), _jsx("span", { className: "truncate", title: log.httpPath ?? '', children: log.httpPath ?? '—' })] }), log.httpStatus ? (_jsx(Badge, { tone: STATUS_TONE(log.httpStatus), className: "mt-0.5", children: log.httpStatus })) : null] }), _jsx(TD, { className: "font-mono text-[11px] text-slate-500 dark:text-slate-400", children: log.ipAddress ?? '—' })] }, log.id))) })] }), logsQuery.data ? _jsx(Pagination, { page: logsQuery.data, onPageChange: setPage }) : null] })) }), _jsxs("p", { className: "flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400", children: [_jsx(ShieldCheck, { className: "h-3.5 w-3.5" }), "Journal en lecture seule, conserve pour les besoins d'audit et de conformit\u00E9."] })] }));
};
