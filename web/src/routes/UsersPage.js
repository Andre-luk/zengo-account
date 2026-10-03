import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy, KeyRound, Plus, Search, ShieldCheck, UserCog, UserPlus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/Feedback';
import { Field, Input, Select } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Pagination, TBody, TD, TH, THead, TR, TableWrap } from '@/components/ui/Table';
import { useOrganizations, useUsers } from '@/hooks/queries';
import { api } from '@/lib/api';
import { formatDateTime, formatRelative, initials } from '@/lib/format';
import { LANGUAGE, ROLE, USER_STATUS, describe } from '@/lib/labels';
import { useAuthStore } from '@/store/auth';
import { useUiStore } from '@/store/ui';
const MANAGER_ROLES = [
    'SUPER_ADMIN',
    'NATIONAL_DIRECTOR',
    'TECHNICAL_DIRECTOR',
    'PLATFORM_MANAGER',
    'REGION_MANAGER',
    'AGENCY_MANAGER',
];
const STATUSES = ['PENDING', 'ACTIVE', 'SUSPENDED', 'DISABLED'];
const ROLES = [
    'SUPER_ADMIN',
    'NATIONAL_DIRECTOR',
    'TECHNICAL_DIRECTOR',
    'PLATFORM_MANAGER',
    'DAF',
    'ACCOUNTANT',
    'QUALITY_DIRECTOR',
    'REGION_MANAGER',
    'AGENCY_MANAGER',
    'TECHNICIAN',
    'OPERATOR',
    'SUPERVISOR',
    'STATION_AGENT',
    'FIELD_AGENT',
    'HEALTH_STAFF',
    'CLIENT_ADMIN',
    'CLIENT',
];
const emptyForm = {
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    preferredLanguage: 'fr',
    status: 'ACTIVE',
    organizationId: '',
    role: 'OPERATOR',
};
export const UsersPage = () => {
    const queryClient = useQueryClient();
    const pushToast = useUiStore((state) => state.pushToast);
    const hasRole = useAuthStore((state) => state.hasRole);
    const canManage = hasRole(...MANAGER_ROLES);
    const [page, setPage] = useState(1);
    const [searchDraft, setSearchDraft] = useState('');
    const [search, setSearch] = useState('');
    const [role, setRole] = useState('');
    const [status, setStatus] = useState('');
    const [formOpen, setFormOpen] = useState(false);
    const [form, setForm] = useState(emptyForm);
    const [credentials, setCredentials] = useState(null);
    const [copied, setCopied] = useState(false);
    const params = useMemo(() => ({
        page,
        limit: 20,
        order: 'asc',
        ...(search ? { search } : {}),
        ...(role ? { role } : {}),
        ...(status ? { status } : {}),
    }), [page, search, role, status]);
    const usersQuery = useUsers(params);
    const organizationsQuery = useOrganizations({ limit: 100 });
    const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['users'] });
    const create = useMutation({
        mutationFn: async () => api.post('/users', {
            firstName: form.firstName.trim(),
            lastName: form.lastName.trim(),
            preferredLanguage: form.preferredLanguage,
            status: form.status,
            ...(form.email ? { email: form.email.trim() } : {}),
            ...(form.phone ? { phone: form.phone.trim() } : {}),
            ...(form.password ? { password: form.password } : {}),
            ...(form.organizationId
                ? { memberships: [{ organizationId: form.organizationId, role: form.role, isPrimary: true }] }
                : {}),
        }),
        onSuccess: (data) => {
            invalidate();
            setFormOpen(false);
            setForm(emptyForm);
            if (data.temporaryPassword) {
                setCredentials({ title: `Identifiants de ${data.user.firstName} ${data.user.lastName}`, password: data.temporaryPassword });
            }
            pushToast({ tone: 'success', title: 'Utilisateur créé' });
        },
        onError: (error) => pushToast({ tone: 'danger', title: 'Création impossible', description: error.message }),
    });
    const changeStatus = useMutation({
        mutationFn: async (input) => api.patch(`/users/${input.id}/status`, { status: input.status }),
        onSuccess: () => {
            invalidate();
            pushToast({ tone: 'success', title: 'Statut mis a jour' });
        },
        onError: (error) => pushToast({ tone: 'danger', title: 'Modification refusée', description: error.message }),
    });
    const resetPassword = useMutation({
        mutationFn: async (user) => ({ user, response: await api.post(`/users/${user.id}/reset-password`, {}) }),
        onSuccess: ({ user, response }) => {
            invalidate();
            if (response.temporaryPassword) {
                setCredentials({ title: `Nouveau mot de passe de ${user.firstName} ${user.lastName}`, password: response.temporaryPassword });
            }
            else {
                pushToast({ tone: 'success', title: 'Mot de passe réinitialisé' });
            }
        },
        onError: (error) => pushToast({ tone: 'danger', title: 'Réinitialisation refusée', description: error.message }),
    });
    return (_jsxs("div", { className: "space-y-5", children: [_jsx(Card, { children: _jsxs(CardBody, { className: "space-y-3 pt-4", children: [_jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [_jsxs("form", { className: "relative min-w-[240px] flex-1", onSubmit: (event) => {
                                        event.preventDefault();
                                        setSearch(searchDraft.trim());
                                        setPage(1);
                                    }, children: [_jsx(Search, { className: "pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-slate-400" }), _jsx(Input, { value: searchDraft, onChange: (event) => setSearchDraft(event.target.value), placeholder: "Nom, email, t\u00E9l\u00E9phone...", className: "pl-9" })] }), canManage ? (_jsx(Button, { icon: _jsx(UserPlus, { className: "h-4 w-4" }), onClick: () => setFormOpen(true), children: "Nouvel'utilisateur" })) : null] }), _jsxs("div", { className: "grid gap-2 sm:grid-cols-2", children: [_jsxs(Select, { value: role, onChange: (event) => {
                                        setRole(event.target.value);
                                        setPage(1);
                                    }, children: [_jsx("option", { value: "", children: "Tous les roles" }), ROLES.map((value) => (_jsx("option", { value: value, children: describe(ROLE, value).label }, value)))] }), _jsxs(Select, { value: status, onChange: (event) => {
                                        setStatus(event.target.value);
                                        setPage(1);
                                    }, children: [_jsx("option", { value: "", children: "Tous les statuts" }), STATUSES.map((value) => (_jsx("option", { value: value, children: describe(USER_STATUS, value).label }, value)))] })] })] }) }), _jsx(Card, { className: "overflow-hidden", children: usersQuery.isLoading ? (_jsx(TableSkeleton, { rows: 8, columns: 5 })) : usersQuery.isError ? (_jsx(ErrorState, { onRetry: () => void usersQuery.refetch() })) : (usersQuery.data?.items.length ?? 0) === 0 ? (_jsx(EmptyState, { title: "Aucun utilisateur", description: "Creez les comptes des operateurs du ZMC, techniciens et agents de station.", icon: _jsx(UserCog, { className: "h-5 w-5" }) })) : (_jsxs(_Fragment, { children: [_jsxs(TableWrap, { children: [_jsxs(THead, { children: [_jsx(TH, { children: "Utilisateur" }), _jsx(TH, { children: "Identifiants" }), _jsx(TH, { children: "Habilitations" }), _jsx(TH, { children: "Statut" }), _jsx(TH, { className: "text-right", children: "Derni\u00E8re connexion" }), canManage ? _jsx(TH, { className: "text-right", children: "Actions" }) : null] }), _jsx(TBody, { children: usersQuery.data?.items.map((user) => (_jsxs(TR, { children: [_jsx(TD, { children: _jsxs("span", { className: "flex items-center gap-2.5", children: [_jsx("span", { className: "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700 dark:bg-brand-500/10 dark:text-brand-300", children: initials(user.firstName, user.lastName) }), _jsxs("span", { className: "min-w-0", children: [_jsxs("span", { className: "block truncate font-medium text-slate-800 dark:text-slate-100", children: [user.firstName, " ", user.lastName] }), _jsx("span", { className: "block text-[11px] text-slate-400", children: LANGUAGE[user.preferredLanguage] ?? user.preferredLanguage })] })] }) }), _jsxs(TD, { className: "text-xs", children: [_jsx("span", { className: "block", children: user.email ?? '—' }), _jsx("span", { className: "block text-slate-400", children: user.phone ?? '' })] }), _jsx(TD, { children: _jsxs("span", { className: "flex flex-wrap gap-1", children: [user.isSuperAdmin ? _jsx(Badge, { tone: "critical", children: "Super administrateur" }) : null, user.memberships.slice(0, 2).map((membership, index) => (_jsx(Badge, { tone: describe(ROLE, membership.role).tone, children: describe(ROLE, membership.role).label }, `${membership.organizationId}-${index}`))), user.memberships.length > 2 ? _jsxs(Badge, { tone: "neutral", children: ["+", user.memberships.length - 2] }) : null] }) }), _jsxs(TD, { children: [_jsx(Badge, { tone: describe(USER_STATUS, user.status ?? 'ACTIVE').tone, dot: user.mustChangePassword, children: describe(USER_STATUS, user.status ?? 'ACTIVE').label }), user.twoFactorEnabled ? (_jsxs("span", { className: "mt-1 flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400", children: [_jsx(ShieldCheck, { className: "h-3 w-3" }), "2FA"] })) : null] }), _jsx(TD, { className: "text-right text-xs whitespace-nowrap text-slate-500 dark:text-slate-400", children: user.lastLoginAt ? formatRelative(user.lastLoginAt) : 'Jamais' }), canManage ? (_jsx(TD, { className: "text-right", children: _jsxs("span", { className: "inline-flex items-center gap-1", children: [_jsx(Button, { variant: "ghost", size: "icon", title: "R\u00E9initialiser le mot de passe", onClick: () => resetPassword.mutate(user), children: _jsx(KeyRound, { className: "h-3.5 w-3.5" }) }), _jsx(Select, { className: "w-auto py-1 text-xs", value: user.status ?? 'ACTIVE', onChange: (event) => changeStatus.mutate({ id: user.id, status: event.target.value }), children: STATUSES.map((value) => (_jsx("option", { value: value, children: describe(USER_STATUS, value).label }, value))) })] }) })) : null] }, user.id))) })] }), usersQuery.data ? _jsx(Pagination, { page: usersQuery.data, onPageChange: setPage }) : null] })) }), _jsx(Modal, { open: formOpen, onClose: () => setFormOpen(false), title: "Nouvel'utilisateur", description: "L appartenance determine le p\u00E9rim\u00E8tre de donn\u00E9es et les actions autorisees.", footer: _jsxs(_Fragment, { children: [_jsx(Button, { variant: "ghost", onClick: () => setFormOpen(false), children: "Annuler" }), _jsx(Button, { loading: create.isPending, disabled: !form.firstName.trim() || !form.lastName.trim() || (!form.email && !form.phone), onClick: () => create.mutate(), children: "Cr\u00E9er l'utilisateur" })] }), children: _jsxs("div", { className: "grid gap-4 sm:grid-cols-2", children: [_jsx(Field, { label: "Prenom", required: true, children: _jsx(Input, { value: form.firstName, onChange: (event) => setForm({ ...form, firstName: event.target.value }) }) }), _jsx(Field, { label: "Nom", required: true, children: _jsx(Input, { value: form.lastName, onChange: (event) => setForm({ ...form, lastName: event.target.value }) }) }), _jsx(Field, { label: "Email professionnel", hint: "Ou t\u00E9l\u00E9phone ci-dessous", children: _jsx(Input, { type: "email", value: form.email, onChange: (event) => setForm({ ...form, email: event.target.value }), placeholder: "prenom.nom@zengo.cd" }) }), _jsx(Field, { label: "T\u00E9l\u00E9phone", children: _jsx(Input, { value: form.phone, onChange: (event) => setForm({ ...form, phone: event.target.value }), placeholder: "+243970000000" }) }), _jsx(Field, { label: "Mot de passe initial", hint: "Laissez vide pour un mot de passe temporaire g\u00E9n\u00E9r\u00E9", children: _jsx(Input, { type: "password", value: form.password, onChange: (event) => setForm({ ...form, password: event.target.value }), placeholder: "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" }) }), _jsx(Field, { label: "Langue", children: _jsx(Select, { value: form.preferredLanguage, onChange: (event) => setForm({ ...form, preferredLanguage: event.target.value }), children: Object.entries(LANGUAGE).map(([code, label]) => (_jsx("option", { value: code, children: label }, code))) }) }), _jsx(Field, { label: "Organisation", hint: "P\u00E9rim\u00E8tre de l'utilisateur", children: _jsxs(Select, { value: form.organizationId, onChange: (event) => setForm({ ...form, organizationId: event.target.value }), children: [_jsx("option", { value: "", children: "Aucune (compte national)" }), organizationsQuery.data?.items.map((organization) => (_jsxs("option", { value: organization.id, children: [organization.name, " (", organization.code, ")"] }, organization.id)))] }) }), _jsx(Field, { label: "Role", children: _jsx(Select, { value: form.role, onChange: (event) => setForm({ ...form, role: event.target.value }), children: ROLES.map((value) => (_jsx("option", { value: value, children: describe(ROLE, value).label }, value))) }) }), _jsx(Field, { label: "Statut initial", children: _jsx(Select, { value: form.status, onChange: (event) => setForm({ ...form, status: event.target.value }), children: STATUSES.map((value) => (_jsx("option", { value: value, children: describe(USER_STATUS, value).label }, value))) }) })] }) }), _jsx(Modal, { open: Boolean(credentials), onClose: () => {
                    setCredentials(null);
                    setCopied(false);
                }, title: "Mot de passe temporaire", description: credentials?.title, size: "sm", footer: _jsxs(_Fragment, { children: [_jsx(Button, { variant: "secondary", icon: _jsx(Copy, { className: "h-4 w-4" }), onClick: async () => {
                                await navigator.clipboard.writeText(credentials?.password ?? '');
                                setCopied(true);
                            }, children: copied ? 'Copie' : 'Copier' }), _jsx(Button, { onClick: () => {
                                setCredentials(null);
                                setCopied(false);
                            }, children: "Terminer" })] }), children: _jsxs("div", { className: "space-y-3", children: [_jsx("code", { className: "block rounded-lg bg-slate-900 p-3 text-center font-mono text-lg text-emerald-300", children: credentials?.password }), _jsxs("p", { className: "text-xs text-slate-500 dark:text-slate-400", children: ["Ce mot de passe ne sera plus affiche. L utilisateur devra le changer \u00E0 sa premi\u00E8re connexion", ` (généré le ${formatDateTime(new Date().toISOString())}).`] })] }) }), _jsxs("p", { className: "flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400", children: [_jsx(Plus, { className: "h-3.5 w-3.5" }), "Les appartenances suppl\u00E9mentaires (multi-sites) se gerent depuis l'API d'habilitations."] })] }));
};
