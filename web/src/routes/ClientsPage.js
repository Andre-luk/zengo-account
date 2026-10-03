import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { ChevronRight, MapPin, Phone, Search, UserPlus, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClientFormModal } from '@/components/clients/ClientFormModal';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/Feedback';
import { Input, Select } from '@/components/ui/Field';
import { Pagination, TBody, TD, TH, THead, TR, TableWrap } from '@/components/ui/Table';
import { useClients } from '@/hooks/queries';
import { formatDate, formatRelative } from '@/lib/format';
import { CLIENT_STATUS, LANGUAGE, OFFER_PACK, SUBSCRIPTION_STATUS, describe } from '@/lib/labels';
import { useAuthStore } from '@/store/auth';
const MANAGE_ROLES = [
    'SUPER_ADMIN',
    'NATIONAL_DIRECTOR',
    'TECHNICAL_DIRECTOR',
    'PLATFORM_MANAGER',
    'REGION_MANAGER',
    'AGENCY_MANAGER',
    'ACCOUNTANT',
];
const STATUSES = ['PENDING', 'ACTIVE', 'SUSPENDED', 'EXPIRED', 'ARCHIVED'];
const SUBSCRIPTIONS = ['PENDING', 'ACTIVE', 'EXPIRED', 'SUSPENDED'];
const PACKS = ['STANDARD', 'PREMIUM_SMALL', 'PREMIUM_INSTITUTION', 'CUSTOM'];
export const ClientsPage = () => {
    const navigate = useNavigate();
    const hasRole = useAuthStore((state) => state.hasRole);
    const [page, setPage] = useState(1);
    const [searchDraft, setSearchDraft] = useState('');
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState('');
    const [subscriptionStatus, setSubscriptionStatus] = useState('');
    const [offerPack, setOfferPack] = useState('');
    const [formOpen, setFormOpen] = useState(false);
    const params = useMemo(() => ({
        page,
        limit: 20,
        order: 'desc',
        ...(search ? { search } : {}),
        ...(status ? { status } : {}),
        ...(subscriptionStatus ? { subscriptionStatus } : {}),
        ...(offerPack ? { offerPack } : {}),
    }), [page, search, status, subscriptionStatus, offerPack]);
    const clientsQuery = useClients(params);
    const canManage = hasRole(...MANAGE_ROLES);
    return (_jsxs("div", { className: "space-y-5", children: [_jsx(Card, { children: _jsxs(CardBody, { className: "space-y-3 pt-4", children: [_jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [_jsxs("form", { className: "relative min-w-[240px] flex-1", onSubmit: (event) => {
                                        event.preventDefault();
                                        setSearch(searchDraft.trim());
                                        setPage(1);
                                    }, children: [_jsx(Search, { className: "pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-slate-400" }), _jsx(Input, { value: searchDraft, onChange: (event) => setSearchDraft(event.target.value), placeholder: "Nom, ID Zengo, t\u00E9l\u00E9phone, ville...", className: "pl-9" })] }), canManage ? (_jsx(Button, { icon: _jsx(UserPlus, { className: "h-4 w-4" }), onClick: () => setFormOpen(true), children: "Nouveau compte client" })) : null] }), _jsxs("div", { className: "grid gap-2 sm:grid-cols-3", children: [_jsxs(Select, { value: status, onChange: (event) => {
                                        setStatus(event.target.value);
                                        setPage(1);
                                    }, children: [_jsx("option", { value: "", children: "Tous les statuts de compte" }), STATUSES.map((value) => (_jsx("option", { value: value, children: describe(CLIENT_STATUS, value).label }, value)))] }), _jsxs(Select, { value: subscriptionStatus, onChange: (event) => {
                                        setSubscriptionStatus(event.target.value);
                                        setPage(1);
                                    }, children: [_jsx("option", { value: "", children: "Tous les abonnements" }), SUBSCRIPTIONS.map((value) => (_jsx("option", { value: value, children: describe(SUBSCRIPTION_STATUS, value).label }, value)))] }), _jsxs(Select, { value: offerPack, onChange: (event) => {
                                        setOfferPack(event.target.value);
                                        setPage(1);
                                    }, children: [_jsx("option", { value: "", children: "Tous les packs" }), PACKS.map((value) => (_jsx("option", { value: value, children: describe(OFFER_PACK, value).label }, value)))] })] })] }) }), _jsx(Card, { className: "overflow-hidden", children: clientsQuery.isLoading ? (_jsx(TableSkeleton, { rows: 8, columns: 6 })) : clientsQuery.isError ? (_jsx(ErrorState, { onRetry: () => void clientsQuery.refetch() })) : (clientsQuery.data?.items.length ?? 0) === 0 ? (_jsx(EmptyState, { title: "Aucun compte client", description: "Creez le premier compte client de votre p\u00E9rim\u00E8tre pour d\u00E9marrer l'installation du kit SafAlert.", icon: _jsx(Users, { className: "h-5 w-5" }), action: canManage ? (_jsx(Button, { size: "sm", icon: _jsx(UserPlus, { className: "h-3.5 w-3.5" }), onClick: () => setFormOpen(true), children: "Nouveau compte client" })) : undefined })) : (_jsxs(_Fragment, { children: [_jsxs(TableWrap, { children: [_jsxs(THead, { children: [_jsx(TH, { children: "ID Zengo" }), _jsx(TH, { children: "Client" }), _jsx(TH, { children: "Contact" }), _jsx(TH, { children: "Agence" }), _jsx(TH, { children: "Pack" }), _jsx(TH, { children: "Compte" }), _jsx(TH, { children: "Abonnement" }), _jsx(TH, { children: "Kit" }), _jsx(TH, { className: "text-right", children: "Cr\u00E9\u00E9" }), _jsx(TH, {})] }), _jsx(TBody, { children: clientsQuery.data?.items.map((client) => (_jsxs(TR, { onClick: () => navigate(`/clients/${client.id}`), children: [_jsx(TD, { className: "font-mono text-xs font-semibold text-slate-900 dark:text-white", children: client.zengoId }), _jsxs(TD, { className: "max-w-[220px]", children: [_jsx("span", { className: "block truncate font-medium text-slate-800 dark:text-slate-100", children: client.fullName }), client.companyName ? (_jsx("span", { className: "block truncate text-xs text-slate-500 dark:text-slate-400", children: client.companyName })) : null] }), _jsxs(TD, { className: "whitespace-nowrap", children: [_jsxs("span", { className: "flex items-center gap-1.5 text-xs", children: [_jsx(Phone, { className: "h-3 w-3 text-slate-400" }), client.primaryPhone] }), _jsxs("span", { className: "flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400", children: [_jsx(MapPin, { className: "h-3 w-3 text-slate-400" }), client.city ?? '—'] })] }), _jsx(TD, { className: "max-w-[180px] truncate text-xs", children: client.organization?.name ?? '—' }), _jsxs(TD, { className: "whitespace-nowrap text-xs", children: [describe(OFFER_PACK, client.offerPack).label, _jsx("span", { className: "ml-1 text-slate-400", children: LANGUAGE[client.preferredLanguage]?.slice(0, 2) })] }), _jsx(TD, { children: _jsx(Badge, { tone: describe(CLIENT_STATUS, client.status).tone, dot: client.status === 'PENDING', children: describe(CLIENT_STATUS, client.status).label }) }), _jsx(TD, { children: _jsx(Badge, { tone: describe(SUBSCRIPTION_STATUS, client.subscriptionStatus).tone, children: describe(SUBSCRIPTION_STATUS, client.subscriptionStatus).label }) }), _jsx(TD, { className: "font-mono text-xs text-slate-600 dark:text-slate-300", children: client.device?.serialNumber ?? _jsx("span", { className: "text-slate-400", children: "Non installe" }) }), _jsx(TD, { className: "text-right text-xs whitespace-nowrap text-slate-500 dark:text-slate-400", children: client.installationDate ? formatDate(client.installationDate) : formatRelative(client.createdAt) }), _jsx(TD, { className: "w-8 text-slate-300 dark:text-slate-600", children: _jsx(ChevronRight, { className: "h-4 w-4" }) })] }, client.id))) })] }), clientsQuery.data ? _jsx(Pagination, { page: clientsQuery.data, onPageChange: setPage }) : null] })) }), _jsx(ClientFormModal, { open: formOpen, onClose: () => setFormOpen(false) })] }));
};
