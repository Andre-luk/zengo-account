import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, Factory, MapPin, Plus, Search, ShieldAlert, Warehouse } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/Feedback';
import { Field, Input, Select } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Pagination, TBody, TD, TH, THead, TR, TableWrap } from '@/components/ui/Table';
import { useOrganizations } from '@/hooks/queries';
import { api } from '@/lib/api';
import { ORGANIZATION_STATUS, ORGANIZATION_TYPE, STATION_TYPE, describe } from '@/lib/labels';
import { useAuthStore } from '@/store/auth';
import { useUiStore } from '@/store/ui';
const CREATE_ROLES = ['SUPER_ADMIN', 'NATIONAL_DIRECTOR', 'TECHNICAL_DIRECTOR'];
const STATUS_ROLES = ['SUPER_ADMIN', 'NATIONAL_DIRECTOR', 'TECHNICAL_DIRECTOR'];
const TYPES = ['NATIONAL', 'REGION', 'AGENCY', 'STATION', 'ENTERPRISE'];
const STATUSES = ['ACTIVE', 'SUSPENDED', 'ARCHIVED'];
const STATION_TYPES = ['FIRE', 'MEDICAL', 'INTRUSION', 'MIXED'];
const emptyForm = {
    name: '',
    code: '',
    type: 'AGENCY',
    stationType: '',
    parentId: '',
    address: '',
    city: '',
    contactPhone: '',
    contactEmail: '',
};
const TypeIcon = ({ type }) => {
    const className = 'h-4 w-4';
    if (type === 'NATIONAL')
        return _jsx(Building2, { className: className });
    if (type === 'REGION')
        return _jsx(MapPin, { className: className });
    if (type === 'STATION')
        return _jsx(ShieldAlert, { className: className });
    if (type === 'ENTERPRISE')
        return _jsx(Factory, { className: className });
    return _jsx(Warehouse, { className: className });
};
export const OrganizationsPage = () => {
    const queryClient = useQueryClient();
    const pushToast = useUiStore((state) => state.pushToast);
    const hasRole = useAuthStore((state) => state.hasRole);
    const canCreate = hasRole(...CREATE_ROLES);
    const canChangeStatus = hasRole(...STATUS_ROLES);
    const [page, setPage] = useState(1);
    const [searchDraft, setSearchDraft] = useState('');
    const [search, setSearch] = useState('');
    const [type, setType] = useState('');
    const [status, setStatus] = useState('');
    const [formOpen, setFormOpen] = useState(false);
    const [form, setForm] = useState(emptyForm);
    const params = useMemo(() => ({
        page,
        limit: 25,
        order: 'asc',
        ...(search ? { search } : {}),
        ...(type ? { type } : {}),
        ...(status ? { status } : {}),
    }), [page, search, type, status]);
    const organizationsQuery = useOrganizations(params);
    const parentsQuery = useOrganizations({ limit: 100 });
    const create = useMutation({
        mutationFn: async () => api.post('/organizations', {
            name: form.name.trim(),
            code: form.code.trim().toUpperCase(),
            type: form.type,
            ...(form.type === 'STATION' && form.stationType ? { stationType: form.stationType } : {}),
            ...(form.parentId ? { parentId: form.parentId } : {}),
            ...(form.address ? { address: form.address.trim() } : {}),
            ...(form.city ? { city: form.city.trim() } : {}),
            ...(form.contactPhone ? { contactPhone: form.contactPhone.trim() } : {}),
            ...(form.contactEmail ? { contactEmail: form.contactEmail.trim() } : {}),
        }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['organizations'] });
            setFormOpen(false);
            setForm(emptyForm);
            pushToast({ tone: 'success', title: 'Organisation créée' });
        },
        onError: (error) => pushToast({ tone: 'danger', title: 'Création impossible', description: error.message }),
    });
    const changeStatus = useMutation({
        mutationFn: async (input) => api.patch(`/organizations/${input.id}/status`, { status: input.status }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['organizations'] });
            pushToast({ tone: 'success', title: 'Statut mis a jour' });
        },
        onError: (error) => pushToast({ tone: 'danger', title: 'Modification refusée', description: error.message }),
    });
    return (_jsxs("div", { className: "space-y-5", children: [_jsx(Card, { children: _jsxs(CardBody, { className: "space-y-3 pt-4", children: [_jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [_jsxs("form", { className: "relative min-w-[240px] flex-1", onSubmit: (event) => {
                                        event.preventDefault();
                                        setSearch(searchDraft.trim());
                                        setPage(1);
                                    }, children: [_jsx(Search, { className: "pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-slate-400" }), _jsx(Input, { value: searchDraft, onChange: (event) => setSearchDraft(event.target.value), placeholder: "Nom, code, ville...", className: "pl-9" })] }), canCreate ? (_jsx(Button, { icon: _jsx(Plus, { className: "h-4 w-4" }), onClick: () => setFormOpen(true), children: "Nouvelle organisation" })) : null] }), _jsxs("div", { className: "grid gap-2 sm:grid-cols-2", children: [_jsxs(Select, { value: type, onChange: (event) => {
                                        setType(event.target.value);
                                        setPage(1);
                                    }, children: [_jsx("option", { value: "", children: "Tous les niveaux" }), TYPES.map((value) => (_jsx("option", { value: value, children: describe(ORGANIZATION_TYPE, value).label }, value)))] }), _jsxs(Select, { value: status, onChange: (event) => {
                                        setStatus(event.target.value);
                                        setPage(1);
                                    }, children: [_jsx("option", { value: "", children: "Tous les statuts" }), STATUSES.map((value) => (_jsx("option", { value: value, children: describe(ORGANIZATION_STATUS, value).label }, value)))] })] })] }) }), _jsx(Card, { className: "overflow-hidden", children: organizationsQuery.isLoading ? (_jsx(TableSkeleton, { rows: 8, columns: 5 })) : organizationsQuery.isError ? (_jsx(ErrorState, { onRetry: () => void organizationsQuery.refetch() })) : (organizationsQuery.data?.items.length ?? 0) === 0 ? (_jsx(EmptyState, { title: "Aucune organisation", description: "La hi\u00E9rarchie nationale, les zones et les agences structurent le p\u00E9rim\u00E8tre de s\u00E9curit\u00E9.", icon: _jsx(Building2, { className: "h-5 w-5" }) })) : (_jsxs(_Fragment, { children: [_jsxs(TableWrap, { children: [_jsxs(THead, { children: [_jsx(TH, { children: "Code" }), _jsx(TH, { children: "Nom" }), _jsx(TH, { children: "Niveau" }), _jsx(TH, { children: "Ville" }), _jsx(TH, { children: "Contact" }), _jsx(TH, { children: "Profondeur" }), _jsx(TH, { children: "Statut" }), canChangeStatus ? _jsx(TH, { className: "text-right", children: "Actions" }) : null] }), _jsx(TBody, { children: organizationsQuery.data?.items.map((organization) => (_jsxs(TR, { children: [_jsx(TD, { className: "font-mono text-xs font-semibold text-slate-900 dark:text-white", children: organization.code }), _jsx(TD, { children: _jsxs("span", { className: "flex items-center gap-2", children: [_jsx(TypeIcon, { type: organization.type }), _jsx("span", { className: "truncate", children: organization.name })] }) }), _jsxs(TD, { className: "whitespace-nowrap text-xs", children: [describe(ORGANIZATION_TYPE, organization.type).label, organization.stationType ? (_jsx(Badge, { tone: describe(STATION_TYPE, organization.stationType).tone, className: "ml-2", children: describe(STATION_TYPE, organization.stationType).label })) : null] }), _jsx(TD, { className: "text-xs", children: organization.city ?? '—' }), _jsxs(TD, { className: "text-xs", children: [organization.contactPhone ?? '—', organization.contactEmail ? (_jsx("span", { className: "block text-slate-400", children: organization.contactEmail })) : null] }), _jsxs(TD, { className: "text-xs tabular-nums text-slate-500 dark:text-slate-400", children: ["niveau ", organization.depth] }), _jsx(TD, { children: _jsx(Badge, { tone: describe(ORGANIZATION_STATUS, organization.status).tone, children: describe(ORGANIZATION_STATUS, organization.status).label }) }), canChangeStatus ? (_jsx(TD, { className: "text-right", children: _jsx(Button, { size: "sm", variant: organization.status === 'SUSPENDED' ? 'secondary' : 'ghost', loading: changeStatus.isPending, onClick: () => changeStatus.mutate({
                                                        id: organization.id,
                                                        status: organization.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED',
                                                    }), children: organization.status === 'SUSPENDED' ? 'Réactiver' : 'Suspendre' }) })) : null] }, organization.id))) })] }), organizationsQuery.data ? _jsx(Pagination, { page: organizationsQuery.data, onPageChange: setPage }) : null] })) }), _jsx(Modal, { open: formOpen, onClose: () => setFormOpen(false), title: "Nouvelle organisation", description: "Une station d'intervention est rattach\u00E9e a une agence (point de distribution) pour recevoir les missions.", footer: _jsxs(_Fragment, { children: [_jsx(Button, { variant: "ghost", onClick: () => setFormOpen(false), children: "Annuler" }), _jsx(Button, { loading: create.isPending, disabled: !form.name.trim() || !form.code.trim() || (form.type !== 'NATIONAL' && !form.parentId), onClick: () => create.mutate(), children: "Cr\u00E9er" })] }), children: _jsxs("div", { className: "grid gap-4 sm:grid-cols-2", children: [_jsx(Field, { label: "Nom", required: true, children: _jsx(Input, { value: form.name, onChange: (event) => setForm({ ...form, name: event.target.value }), placeholder: "Agence Kinshasa Centre" }) }), _jsx(Field, { label: "Code court", hint: "Majuscules, chiffres et tirets", required: true, children: _jsx(Input, { value: form.code, onChange: (event) => setForm({ ...form, code: event.target.value.toUpperCase() }), placeholder: "KIN-C", className: "font-mono" }) }), _jsx(Field, { label: "Niveau", required: true, children: _jsx(Select, { value: form.type, onChange: (event) => setForm({ ...form, type: event.target.value }), children: TYPES.map((value) => (_jsx("option", { value: value, children: describe(ORGANIZATION_TYPE, value).label }, value))) }) }), form.type === 'STATION' ? (_jsx(Field, { label: "Famille de mission", required: true, children: _jsxs(Select, { value: form.stationType, onChange: (event) => setForm({ ...form, stationType: event.target.value }), children: [_jsx("option", { value: "", children: "S\u00E9lectionner\u2026" }), STATION_TYPES.map((value) => (_jsx("option", { value: value, children: describe(STATION_TYPE, value).label }, value)))] }) })) : null, _jsx(Field, { label: "Rattachement", hint: "Zone pour une agence, agence pour une station", required: form.type !== 'NATIONAL', children: _jsxs(Select, { value: form.parentId, onChange: (event) => setForm({ ...form, parentId: event.target.value }), children: [_jsx("option", { value: "", children: "Aucun (niveau national)" }), parentsQuery.data?.items.map((organization) => (_jsxs("option", { value: organization.id, children: [describe(ORGANIZATION_TYPE, organization.type).label, " \u2014 ", organization.name] }, organization.id)))] }) }), _jsx(Field, { label: "Ville", children: _jsx(Input, { value: form.city, onChange: (event) => setForm({ ...form, city: event.target.value }) }) }), _jsx(Field, { label: "Adresse", className: "sm:col-span-2", children: _jsx(Input, { value: form.address, onChange: (event) => setForm({ ...form, address: event.target.value }) }) }), _jsx(Field, { label: "T\u00E9l\u00E9phone", children: _jsx(Input, { value: form.contactPhone, onChange: (event) => setForm({ ...form, contactPhone: event.target.value }) }) }), _jsx(Field, { label: "Email", children: _jsx(Input, { type: "email", value: form.contactEmail, onChange: (event) => setForm({ ...form, contactEmail: event.target.value }) }) })] }) })] }));
};
