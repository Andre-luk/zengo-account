import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Cpu, Lock, LockOpen, Plus, Search, Wifi, WifiOff } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/Feedback';
import { Field, Input, Select } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Pagination, TBody, TD, TH, THead, TR, TableWrap } from '@/components/ui/Table';
import { useDevices, useOrganizations } from '@/hooks/queries';
import { api } from '@/lib/api';
import { formatRelative } from '@/lib/format';
import { ARM_MODE, DEVICE_STATUS, LANGUAGE, describe } from '@/lib/labels';
import { useAuthStore } from '@/store/auth';
import { useUiStore } from '@/store/ui';
const MANAGER_ROLES = [
    'SUPER_ADMIN',
    'NATIONAL_DIRECTOR',
    'TECHNICAL_DIRECTOR',
    'PLATFORM_MANAGER',
    'TECHNICIAN',
    'AGENCY_MANAGER',
];
const STATUSES = ['PROVISIONED', 'ACTIVE', 'OFFLINE', 'DISABLED'];
const ARM_MODES = [0, 1, 2];
const emptyDevice = {
    serialNumber: '',
    model: 'SafAlert Solar G1',
    imei: '',
    simNumber: '',
    alarmPhoneNumber: '',
    organizationId: '',
    language: 'fr',
};
export const DevicesPage = () => {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const pushToast = useUiStore((state) => state.pushToast);
    const hasRole = useAuthStore((state) => state.hasRole);
    const canManage = hasRole(...MANAGER_ROLES);
    const [page, setPage] = useState(1);
    const [searchDraft, setSearchDraft] = useState('');
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState('');
    const [armMode, setArmMode] = useState('');
    const [unassignedOnly, setUnassignedOnly] = useState(false);
    const [formOpen, setFormOpen] = useState(false);
    const [form, setForm] = useState(emptyDevice);
    const params = useMemo(() => ({
        page,
        limit: 20,
        order: 'desc',
        ...(search ? { search } : {}),
        ...(status ? { status } : {}),
        ...(armMode ? { armMode } : {}),
        ...(unassignedOnly ? { unassignedOnly: 'true' } : {}),
    }), [page, search, status, armMode, unassignedOnly]);
    const devicesQuery = useDevices(params);
    const agenciesQuery = useOrganizations({ limit: 100, type: 'AGENCY' });
    const provision = useMutation({
        mutationFn: async () => api.post('/devices', {
            serialNumber: form.serialNumber.trim(),
            model: form.model.trim() || undefined,
            language: form.language,
            ...(form.imei ? { imei: form.imei.trim() } : {}),
            ...(form.simNumber ? { simNumber: form.simNumber.trim() } : {}),
            ...(form.alarmPhoneNumber ? { alarmPhoneNumber: form.alarmPhoneNumber.trim() } : {}),
            ...(form.organizationId ? { organizationId: form.organizationId } : {}),
        }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['devices'] });
            setFormOpen(false);
            setForm(emptyDevice);
            pushToast({ tone: 'success', title: 'Dispositif provisionné', description: 'Il peut maintenant etre rattaché a un client.' });
        },
        onError: (error) => pushToast({ tone: 'danger', title: 'Provisionnement refusé', description: error.message }),
    });
    const setArm = useMutation({
        mutationFn: async (input) => api.post(`/devices/${input.deviceId}/arm-mode`, { mode: input.mode }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['devices'] });
            pushToast({ tone: 'brand', title: 'Commande transmise', description: 'La centrale appliquera le mode des reception.' });
        },
        onError: (error) => pushToast({ tone: 'danger', title: 'Commande refusée', description: error.message }),
    });
    return (_jsxs("div", { className: "space-y-5", children: [_jsx(Card, { children: _jsxs(CardBody, { className: "space-y-3 pt-4", children: [_jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [_jsxs("form", { className: "relative min-w-[240px] flex-1", onSubmit: (event) => {
                                        event.preventDefault();
                                        setSearch(searchDraft.trim());
                                        setPage(1);
                                    }, children: [_jsx(Search, { className: "pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-slate-400" }), _jsx(Input, { value: searchDraft, onChange: (event) => setSearchDraft(event.target.value), placeholder: "Num\u00E9ro de s\u00E9rie, IMEI, SIM, client...", className: "pl-9" })] }), _jsx("button", { type: "button", onClick: () => {
                                        setUnassignedOnly((current) => !current);
                                        setPage(1);
                                    }, className: unassignedOnly
                                        ? 'rounded-lg border border-brand-300 bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700 dark:border-brand-500/40 dark:bg-brand-500/10 dark:text-brand-300'
                                        : 'rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800/50', children: "Stock non installe" }), canManage ? (_jsx(Button, { icon: _jsx(Plus, { className: "h-4 w-4" }), onClick: () => setFormOpen(true), children: "Provisionner" })) : null] }), _jsxs("div", { className: "grid gap-2 sm:grid-cols-2", children: [_jsxs(Select, { value: status, onChange: (event) => {
                                        setStatus(event.target.value);
                                        setPage(1);
                                    }, children: [_jsx("option", { value: "", children: "Tous les \u00E9tats" }), STATUSES.map((value) => (_jsx("option", { value: value, children: describe(DEVICE_STATUS, value).label }, value)))] }), _jsxs(Select, { value: armMode, onChange: (event) => {
                                        setArmMode(event.target.value);
                                        setPage(1);
                                    }, children: [_jsx("option", { value: "", children: "Tous les modes" }), ARM_MODES.map((value) => (_jsx("option", { value: value, children: describe(ARM_MODE, value).label }, value)))] })] })] }) }), _jsx(Card, { className: "overflow-hidden", children: devicesQuery.isLoading ? (_jsx(TableSkeleton, { rows: 8, columns: 6 })) : devicesQuery.isError ? (_jsx(ErrorState, { onRetry: () => void devicesQuery.refetch() })) : (devicesQuery.data?.items.length ?? 0) === 0 ? (_jsx(EmptyState, { title: "Aucun dispositif", description: "Provisionnez les kits SafAlert Solar G1 avant de les rattacher aux comptes clients.", icon: _jsx(Cpu, { className: "h-5 w-5" }), action: canManage ? (_jsx(Button, { size: "sm", icon: _jsx(Plus, { className: "h-3.5 w-3.5" }), onClick: () => setFormOpen(true), children: "Provisionner un dispositif" })) : undefined })) : (_jsxs(_Fragment, { children: [_jsxs(TableWrap, { children: [_jsxs(THead, { children: [_jsx(TH, { children: "Num\u00E9ro de s\u00E9rie" }), _jsx(TH, { children: "Mod\u00E8le" }), _jsx(TH, { children: "Client" }), _jsx(TH, { children: "Agence" }), _jsx(TH, { children: "\u00C9tat" }), _jsx(TH, { children: "Armement" }), _jsx(TH, { children: "Firmware" }), _jsx(TH, { className: "text-right", children: "Dernier signe" }), _jsx(TH, { className: "text-right", children: "Actions" })] }), _jsx(TBody, { children: devicesQuery.data?.items.map((device) => (_jsxs(TR, { onClick: () => navigate(`/dispositifs/${device.id}`), children: [_jsx(TD, { className: "font-mono text-xs font-semibold text-slate-900 dark:text-white", children: _jsxs("span", { className: "flex items-center gap-2", children: [device.status === 'ACTIVE' ? (_jsx(Wifi, { className: "h-3.5 w-3.5 text-emerald-500" })) : (_jsx(WifiOff, { className: "h-3.5 w-3.5 text-slate-400" })), device.serialNumber] }) }), _jsx(TD, { className: "text-xs", children: device.model }), _jsx(TD, { className: "max-w-[180px] truncate text-xs", children: device.client?.fullName ?? _jsx("span", { className: "text-slate-400", children: "En stock" }) }), _jsx(TD, { className: "max-w-[160px] truncate text-xs", children: device.organization?.name ?? '—' }), _jsx(TD, { children: _jsx(Badge, { tone: describe(DEVICE_STATUS, device.status).tone, dot: device.status === 'OFFLINE', children: describe(DEVICE_STATUS, device.status).label }) }), _jsx(TD, { children: _jsx(Badge, { tone: describe(ARM_MODE, device.armMode).tone, children: describe(ARM_MODE, device.armMode).label }) }), _jsx(TD, { className: "text-xs tabular-nums", children: device.firmwareVersion ?? '—' }), _jsx(TD, { className: "text-right text-xs whitespace-nowrap text-slate-500 dark:text-slate-400", children: formatRelative(device.lastHeartbeatAt ?? device.lastSeenAt) }), _jsx(TD, { className: "text-right", children: canManage ? (_jsxs("span", { className: "inline-flex gap-1", onClick: (event) => event.stopPropagation(), children: [_jsx(Button, { variant: "ghost", size: "icon", title: "Armer", disabled: device.armMode === 1, onClick: () => setArm.mutate({ deviceId: device.id, mode: 1 }), children: _jsx(Lock, { className: "h-3.5 w-3.5" }) }), _jsx(Button, { variant: "ghost", size: "icon", title: "D\u00E9sarmer", disabled: device.armMode === 0, onClick: () => setArm.mutate({ deviceId: device.id, mode: 0 }), children: _jsx(LockOpen, { className: "h-3.5 w-3.5" }) })] })) : (_jsx(ChevronRight, { className: "ml-auto h-4 w-4 text-slate-300 dark:text-slate-600" })) })] }, device.id))) })] }), devicesQuery.data ? _jsx(Pagination, { page: devicesQuery.data, onPageChange: setPage }) : null] })) }), _jsx(Modal, { open: formOpen, onClose: () => setFormOpen(false), title: "Provisionner un dispositif", description: "Le num\u00E9ro de s\u00E9rie figure sur l'\u00E9tiquette de la centrale SafAlert Solar G1.", footer: _jsxs(_Fragment, { children: [_jsx(Button, { variant: "ghost", onClick: () => setFormOpen(false), children: "Annuler" }), _jsx(Button, { loading: provision.isPending, disabled: !form.serialNumber.trim(), onClick: () => provision.mutate(), children: "Provisionner" })] }), children: _jsxs("div", { className: "grid gap-4 sm:grid-cols-2", children: [_jsx(Field, { label: "Num\u00E9ro de s\u00E9rie", required: true, children: _jsx(Input, { value: form.serialNumber, onChange: (event) => setForm({ ...form, serialNumber: event.target.value }), placeholder: "3003004fba2394", className: "font-mono" }) }), _jsx(Field, { label: "Mod\u00E8le", children: _jsx(Input, { value: form.model, onChange: (event) => setForm({ ...form, model: event.target.value }) }) }), _jsx(Field, { label: "IMEI", children: _jsx(Input, { value: form.imei, onChange: (event) => setForm({ ...form, imei: event.target.value }) }) }), _jsx(Field, { label: "Num\u00E9ro SIM data", children: _jsx(Input, { value: form.simNumber, onChange: (event) => setForm({ ...form, simNumber: event.target.value }) }) }), _jsx(Field, { label: "Num\u00E9ro d'appel des alarmes", hint: "Num\u00E9ro compos\u00E9 par la centrale", children: _jsx(Input, { value: form.alarmPhoneNumber, onChange: (event) => setForm({ ...form, alarmPhoneNumber: event.target.value }), placeholder: "+243970255599" }) }), _jsx(Field, { label: "Agence proprietaire", children: _jsxs(Select, { value: form.organizationId, onChange: (event) => setForm({ ...form, organizationId: event.target.value }), children: [_jsx("option", { value: "", children: "Stock national" }), agenciesQuery.data?.items.map((organization) => (_jsxs("option", { value: organization.id, children: [organization.name, " (", organization.code, ")"] }, organization.id)))] }) }), _jsx(Field, { label: "Langue des messages vocaux", children: _jsx(Select, { value: form.language, onChange: (event) => setForm({ ...form, language: event.target.value }), children: Object.entries(LANGUAGE).map(([code, label]) => (_jsx("option", { value: code, children: label }, code))) }) })] }) })] }));
};
