import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, BadgeCheck, Coins, Cpu, Link2, Phone, ShieldCheck, Unlink, Wrench, } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, DataRow, DescriptionList } from '@/components/ui/Card';
import { EmptyState, ErrorState, InlineEmpty, Skeleton, TableSkeleton } from '@/components/ui/Feedback';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Tabs } from '@/components/ui/Tabs';
import { TBody, TD, TH, THead, TR, TableWrap } from '@/components/ui/Table';
import { useAlerts, useClient, useClientPricing } from '@/hooks/queries';
import { api } from '@/lib/api';
import { formatCoordinates, formatDate, formatMoney, formatRelative } from '@/lib/format';
import { ALERT_STATUS, ALERT_TYPE, ARM_MODE, CLIENT_STATUS, DEVICE_STATUS, DISPATCH_STATUS, LANGUAGE, OFFER_PACK, SUB_DEVICE_CODE, SUBSCRIPTION_STATUS, describe, } from '@/lib/labels';
import { useAuthStore } from '@/store/auth';
import { useUiStore } from '@/store/ui';
const MANAGE_ROLES = [
    'SUPER_ADMIN',
    'NATIONAL_DIRECTOR',
    'TECHNICAL_DIRECTOR',
    'PLATFORM_MANAGER',
    'REGION_MANAGER',
    'AGENCY_MANAGER',
    'ACCOUNTANT',
];
const TECH_ROLES = ['SUPER_ADMIN', 'TECHNICAL_DIRECTOR', 'PLATFORM_MANAGER', 'TECHNICIAN'];
const STATUSES = ['PENDING', 'ACTIVE', 'SUSPENDED', 'EXPIRED', 'ARCHIVED'];
export const ClientDetailPage = () => {
    const { clientId } = useParams();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const pushToast = useUiStore((state) => state.pushToast);
    const hasRole = useAuthStore((state) => state.hasRole);
    const [tab, setTab] = useState('dossier');
    const [editOpen, setEditOpen] = useState(false);
    const [kitOpen, setKitOpen] = useState(false);
    const [serial, setSerial] = useState('');
    const [editForm, setEditForm] = useState({
        primaryPhone: '',
        secondaryPhone: '',
        address: '',
        city: '',
        emergencyContactName: '',
        emergencyContactPhone: '',
        notes: '',
    });
    const clientQuery = useClient(clientId);
    const pricingQuery = useClientPricing(clientId);
    const alertsQuery = useAlerts({ clientId: clientId ?? '', limit: 20 });
    const client = clientQuery.data;
    const canManage = hasRole(...MANAGE_ROLES);
    const canTechnical = hasRole(...TECH_ROLES);
    const reportError = (message) => pushToast({ tone: 'danger', title: 'Opération refusée', description: message });
    const invalidate = () => {
        void queryClient.invalidateQueries({ queryKey: ['clients'] });
    };
    const changeStatus = useMutation({
        mutationFn: async (status) => api.patch(`/clients/${clientId}/status`, { status }),
        onSuccess: () => {
            invalidate();
            pushToast({ tone: 'success', title: 'Statut du compte mis a jour' });
        },
        onError: (error) => reportError(error.message),
    });
    const attachKit = useMutation({
        mutationFn: async () => api.post(`/clients/${clientId}/device`, { serialNumber: serial.trim() }),
        onSuccess: () => {
            invalidate();
            setKitOpen(false);
            setSerial('');
            pushToast({ tone: 'success', title: 'Kit SafAlert rattaché au compte' });
        },
        onError: (error) => reportError(error.message),
    });
    const detachKit = useMutation({
        mutationFn: async () => api.delete(`/clients/${clientId}/device`),
        onSuccess: () => {
            invalidate();
            pushToast({ tone: 'neutral', title: 'Kit détaché du compte' });
        },
        onError: (error) => reportError(error.message),
    });
    const completeInstallation = useMutation({
        mutationFn: async () => api.post(`/clients/${clientId}/installation`, { deviceId: client?.device?.id }),
        onSuccess: () => {
            invalidate();
            pushToast({
                tone: 'success',
                title: 'Installation finalisée',
                description: "Le compte est actif et l'abonnement demarre.",
            });
        },
        onError: (error) => reportError(error.message),
    });
    const updateClient = useMutation({
        mutationFn: async () => {
            const payload = Object.fromEntries(Object.entries(editForm).filter(([, value]) => value !== ''));
            return api.patch(`/clients/${clientId}`, payload);
        },
        onSuccess: () => {
            invalidate();
            setEditOpen(false);
            pushToast({ tone: 'success', title: 'Fiche client mise a jour' });
        },
        onError: (error) => reportError(error.message),
    });
    const openEdit = () => {
        if (!client)
            return;
        setEditForm({
            primaryPhone: client.primaryPhone,
            secondaryPhone: client.secondaryPhone ?? '',
            address: client.address ?? '',
            city: client.city ?? '',
            emergencyContactName: client.emergencyContactName ?? '',
            emergencyContactPhone: client.emergencyContactPhone ?? '',
            notes: client.notes ?? '',
        });
        setEditOpen(true);
    };
    if (clientQuery.isLoading) {
        return (_jsxs("div", { className: "space-y-4", children: [_jsx(Skeleton, { className: "h-24 w-full" }), _jsx(Skeleton, { className: "h-64 w-full" })] }));
    }
    if (clientQuery.isError || !client) {
        return _jsx(ErrorState, { message: "Fiche client introuvable ou hors de votre p\u00E9rim\u00E8tre.", onRetry: () => void clientQuery.refetch() });
    }
    const pricing = pricingQuery.data;
    return (_jsxs("div", { className: "space-y-5", children: [_jsx(Card, { className: "p-5", children: _jsxs("div", { className: "flex flex-wrap items-start justify-between gap-4", children: [_jsxs("div", { className: "flex min-w-0 items-start gap-4", children: [_jsx(Button, { variant: "ghost", size: "icon", onClick: () => navigate('/clients'), "aria-label": "Retour", children: _jsx(ArrowLeft, { className: "h-4 w-4" }) }), _jsxs("div", { className: "min-w-0", children: [_jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [_jsx("h2", { className: "text-lg font-semibold text-slate-900 dark:text-white", children: client.fullName }), _jsx(Badge, { tone: describe(CLIENT_STATUS, client.status).tone, dot: true, children: describe(CLIENT_STATUS, client.status).label }), _jsx(Badge, { tone: describe(SUBSCRIPTION_STATUS, client.subscriptionStatus).tone, children: describe(SUBSCRIPTION_STATUS, client.subscriptionStatus).label })] }), _jsx("p", { className: "mt-1 font-mono text-sm text-slate-500 dark:text-slate-400", children: client.zengoId }), _jsxs("p", { className: "mt-0.5 text-xs text-slate-500 dark:text-slate-400", children: [client.companyName ? `${client.companyName} · ` : '', client.organization?.name ?? '—', " \u00B7 ", client.city ?? 'ville non renseignée'] })] })] }), _jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [canManage ? (_jsx(Button, { variant: "secondary", size: "sm", onClick: openEdit, children: "Modifier la fiche" })) : null, canTechnical && !client.device ? (_jsx(Button, { size: "sm", icon: _jsx(Link2, { className: "h-3.5 w-3.5" }), onClick: () => setKitOpen(true), children: "Rattacher un kit" })) : null, canTechnical && client.device && !client.installationDate ? (_jsx(Button, { size: "sm", icon: _jsx(Wrench, { className: "h-3.5 w-3.5" }), loading: completeInstallation.isPending, onClick: () => completeInstallation.mutate(), children: "Finaliser l'installation" })) : null, canManage ? (_jsx(Select, { className: "w-auto", value: client.status, onChange: (event) => changeStatus.mutate(event.target.value), children: STATUSES.map((status) => (_jsx("option", { value: status, children: describe(CLIENT_STATUS, status).label }, status))) })) : null] })] }) }), _jsx(Tabs, { items: [
                    { id: 'dossier', label: 'Dossier client' },
                    { id: 'facturation', label: 'Facturation' },
                    { id: 'alertes', label: 'Historique alertes', count: alertsQuery.data?.total },
                ], value: tab, onChange: setTab }), tab === 'dossier' ? (_jsxs("div", { className: "grid gap-4 lg:grid-cols-3", children: [_jsxs(Card, { className: "lg:col-span-2", children: [_jsx(CardHeader, { title: "Coordonnees", icon: _jsx(Phone, { className: "h-4 w-4" }) }), _jsx(CardBody, { className: "pt-2", children: _jsxs(DescriptionList, { children: [_jsx(DataRow, { label: "T\u00E9l\u00E9phone principal", value: client.primaryPhone }), _jsx(DataRow, { label: "T\u00E9l\u00E9phone secondaire", value: client.secondaryPhone ?? '—' }), _jsx(DataRow, { label: "Contact d'urgence", value: client.emergencyContactName ?? '—' }), _jsx(DataRow, { label: "T\u00E9l\u00E9phone d'urgence", value: client.emergencyContactPhone ?? '—' }), _jsx(DataRow, { label: "Langue pr\u00E9f\u00E9r\u00E9e", value: LANGUAGE[client.preferredLanguage] ?? client.preferredLanguage }), _jsx(DataRow, { label: "Adresse", value: client.address ?? '—' }), _jsx(DataRow, { label: "Ville / pays", value: `${client.city ?? '—'} · ${client.country ?? '—'}` }), _jsx(DataRow, { label: "Coordonnees GPS", value: _jsx("span", { className: "font-mono text-xs", children: formatCoordinates(client.latitude, client.longitude) }) }), _jsx(DataRow, { label: "Notes", value: client.notes ?? '—' })] }) })] }), _jsxs("div", { className: "space-y-4", children: [_jsxs(Card, { children: [_jsx(CardHeader, { title: "Equipement", icon: _jsx(Cpu, { className: "h-4 w-4" }) }), _jsxs(CardBody, { className: "pt-2", children: [client.device ? (_jsxs(DescriptionList, { children: [_jsx(DataRow, { label: "Centrale", value: _jsx(Link, { to: `/dispositifs/${client.device.id}`, className: "font-mono text-brand-600 hover:underline dark:text-brand-400", children: client.device.serialNumber }) }), _jsx(DataRow, { label: "Mod\u00E8le", value: client.device.model }), _jsx(DataRow, { label: "\u00C9tat", value: _jsx(Badge, { tone: describe(DEVICE_STATUS, client.device.status).tone, children: describe(DEVICE_STATUS, client.device.status).label }) }), _jsx(DataRow, { label: "Armement", value: _jsx(Badge, { tone: describe(ARM_MODE, client.device.armMode).tone, children: describe(ARM_MODE, client.device.armMode).label }) }), _jsx(DataRow, { label: "Dernier signe de vie", value: formatRelative(client.device.lastHeartbeatAt) })] })) : (_jsx(InlineEmpty, { children: "Aucun kit SafAlert rattach\u00E9 \u00E0 ce compte." })), canTechnical && client.device ? (_jsx("div", { className: "mt-3 flex justify-end", children: _jsx(Button, { size: "sm", variant: "ghost", icon: _jsx(Unlink, { className: "h-3.5 w-3.5" }), loading: detachKit.isPending, onClick: () => detachKit.mutate(), children: "D\u00E9tacher le kit" }) })) : null] })] }), _jsxs(Card, { children: [_jsx(CardHeader, { title: "Abonnement", icon: _jsx(ShieldCheck, { className: "h-4 w-4" }) }), _jsx(CardBody, { className: "pt-2", children: _jsxs(DescriptionList, { children: [_jsx(DataRow, { label: "Pack", value: describe(OFFER_PACK, client.offerPack).label }), _jsx(DataRow, { label: "Groupe tarifaire", value: client.tariffGroup?.name ?? '—' }), _jsx(DataRow, { label: "Installation", value: client.installationDate ? formatDate(client.installationDate) : 'Non installe' }), _jsx(DataRow, { label: "Expiration", value: client.subscriptionExpiresAt ? formatDate(client.subscriptionExpiresAt) : '—' }), _jsx(DataRow, { label: "Dernier paiement", value: client.lastPaymentAt ? formatDate(client.lastPaymentAt) : '—' }), _jsx(DataRow, { label: "Boutons SOS", value: client.sosButtonCount })] }) })] })] })] })) : null, tab === 'facturation' ? (pricingQuery.isLoading ? (_jsx(Skeleton, { className: "h-56 w-full" })) : pricingQuery.isError || !pricing ? (_jsx(EmptyState, { title: "Tarification indisponible", description: "Aucun groupe tarifaire n'est appliqu\u00E9 \u00E0 ce compte ou l'information n'est pas accessible.", icon: _jsx(Coins, { className: "h-5 w-5" }) })) : (_jsxs("div", { className: "grid gap-4 lg:grid-cols-2", children: [_jsxs(Card, { children: [_jsx(CardHeader, { title: "Kit SafAlert solar G1", description: pricing.tariffGroupName, icon: _jsx(Coins, { className: "h-4 w-4" }) }), _jsx(CardBody, { className: "pt-2", children: _jsxs(DescriptionList, { children: [_jsx(DataRow, { label: "Frais de souscription", value: formatMoney(pricing.registrationFeeUsd, 'USD') }), _jsx(DataRow, { label: `Boutons SOS supplémentaires (${pricing.extraSosButtons})`, value: formatMoney(pricing.sosButtonsTotalUsd, 'USD') }), _jsx(DataRow, { label: "Total a payer", value: _jsx("span", { className: "text-base font-semibold text-brand-700 dark:text-brand-300", children: formatMoney(pricing.totalKitUsd, pricing.currency) }) }), pricing.totalKitCdf ? (_jsx(DataRow, { label: "\u00C9quivalent CDF", value: formatMoney(pricing.totalKitCdf, 'CDF') })) : null] }) })] }), _jsxs(Card, { children: [_jsx(CardHeader, { title: "Abonnement mensuel", description: "Facture en debut de mois", icon: _jsx(BadgeCheck, { className: "h-4 w-4" }) }), _jsx(CardBody, { className: "pt-2", children: _jsxs(DescriptionList, { children: [_jsx(DataRow, { label: "Montant mensuel", value: formatMoney(pricing.totalMonthlyUsd, 'USD') }), pricing.totalMonthlyCdf ? (_jsx(DataRow, { label: "\u00C9quivalent CDF", value: formatMoney(pricing.totalMonthlyCdf, 'CDF') })) : null, _jsx(DataRow, { label: "Devise de facturation", value: pricing.currency }), _jsx(DataRow, { label: "Taux applique", value: pricing.exchangeRateUsdToCdf ? `1 USD = ${pricing.exchangeRateUsdToCdf} CDF` : '—' }), _jsx(DataRow, { label: "Boutons inclus", value: pricing.includedSosButtons })] }) })] })] }))) : null, tab === 'alertes' ? (_jsx(Card, { className: "overflow-hidden", children: alertsQuery.isLoading ? (_jsx(TableSkeleton, { rows: 5, columns: 5 })) : (alertsQuery.data?.items.length ?? 0) === 0 ? (_jsx(EmptyState, { title: "Aucune alerte enregistr\u00E9e", description: "Ce client n'a jamais d\u00E9clenche d'alerte." })) : (_jsxs(TableWrap, { children: [_jsxs(THead, { children: [_jsx(TH, { children: "R\u00E9f\u00E9rence" }), _jsx(TH, { children: "Nature" }), _jsx(TH, { children: "Statut" }), _jsx(TH, { children: "Engagement" }), _jsx(TH, { className: "text-right", children: "D\u00E9clench\u00E9e" })] }), _jsx(TBody, { children: alertsQuery.data?.items.map((alert) => (_jsxs(TR, { onClick: () => navigate(`/alertes/${alert.id}`), children: [_jsx(TD, { className: "font-mono text-xs font-semibold", children: alert.reference }), _jsx(TD, { children: describe(ALERT_TYPE, alert.type).label }), _jsx(TD, { children: _jsx(Badge, { tone: describe(ALERT_STATUS, alert.status).tone, children: describe(ALERT_STATUS, alert.status).label }) }), _jsx(TD, { className: "text-xs", children: alert.dispatches?.length
                                            ? alert.dispatches.map((item) => (_jsx(Badge, { tone: describe(DISPATCH_STATUS, item.status).tone, className: "mr-1", children: item.station?.name ?? 'Station' }, item.id)))
                                            : '—' }), _jsx(TD, { className: "text-right text-xs text-slate-500 dark:text-slate-400", children: formatRelative(alert.openedAt) })] }, alert.id))) })] })) })) : null, client.device?.subDevices?.length ? (_jsxs(Card, { className: "overflow-hidden", children: [_jsx(CardHeader, { title: "Sous-appareils d\u00E9clar\u00E9s", description: `Centrale ${client.device.serialNumber}`, icon: _jsx(Cpu, { className: "h-4 w-4" }) }), _jsxs(TableWrap, { children: [_jsxs(THead, { children: [_jsx(TH, { children: "Identifiant" }), _jsx(TH, { children: "Libelle" }), _jsx(TH, { children: "Type" }), _jsx(TH, { children: "Zone" }), _jsx(TH, { children: "\u00C9tat" }), _jsx(TH, { className: "text-right", children: "Dernier signe" })] }), _jsx(TBody, { children: client.device.subDevices.map((subDevice) => (_jsxs(TR, { children: [_jsx(TD, { className: "font-mono text-xs", children: subDevice.subId }), _jsx(TD, { children: subDevice.name }), _jsx(TD, { className: "text-xs", children: describe(SUB_DEVICE_CODE, subDevice.code).label }), _jsx(TD, { className: "text-xs", children: subDevice.areaName ?? '—' }), _jsx(TD, { children: subDevice.decodedState ? (_jsxs("span", { className: "flex flex-wrap gap-1", children: [subDevice.decodedState.offline ? _jsx(Badge, { tone: "neutral", children: "Hors ligne" }) : null, subDevice.decodedState.open ? _jsx(Badge, { tone: "warning", children: "Ouvert" }) : null, subDevice.decodedState.tamper ? _jsx(Badge, { tone: "danger", children: "Sabotage" }) : null, subDevice.decodedState.lowBattery ? _jsx(Badge, { tone: "warning", children: "Batterie faible" }) : null, !subDevice.decodedState.offline &&
                                                        !subDevice.decodedState.open &&
                                                        !subDevice.decodedState.tamper &&
                                                        !subDevice.decodedState.lowBattery ? (_jsx(Badge, { tone: "success", children: "Normal" })) : null] })) : ('—') }), _jsx(TD, { className: "text-right text-xs text-slate-500 dark:text-slate-400", children: formatRelative(subDevice.lastSeenAt) })] }, subDevice.id))) })] })] })) : null, _jsx(Modal, { open: kitOpen, onClose: () => setKitOpen(false), title: "Rattacher un kit SafAlert", size: "sm", footer: _jsxs(_Fragment, { children: [_jsx(Button, { variant: "ghost", onClick: () => setKitOpen(false), children: "Annuler" }), _jsx(Button, { loading: attachKit.isPending, disabled: !serial.trim(), onClick: () => attachKit.mutate(), children: "Rattacher" })] }), children: _jsx(Field, { label: "Num\u00E9ro de s\u00E9rie de la centrale", hint: "Le dispositif doit avoir ete provisionn\u00E9 au pr\u00E9alable.", required: true, children: _jsx(Input, { value: serial, onChange: (event) => setSerial(event.target.value), placeholder: "3003004fba2394", className: "font-mono" }) }) }), _jsx(Modal, { open: editOpen, onClose: () => setEditOpen(false), title: "Modifier la fiche client", footer: _jsxs(_Fragment, { children: [_jsx(Button, { variant: "ghost", onClick: () => setEditOpen(false), children: "Annuler" }), _jsx(Button, { loading: updateClient.isPending, onClick: () => updateClient.mutate(), children: "Enregistrer" })] }), children: _jsxs("div", { className: "grid gap-4 sm:grid-cols-2", children: [_jsx(Field, { label: "T\u00E9l\u00E9phone principal", children: _jsx(Input, { value: editForm.primaryPhone, onChange: (event) => setEditForm({ ...editForm, primaryPhone: event.target.value }) }) }), _jsx(Field, { label: "T\u00E9l\u00E9phone secondaire", children: _jsx(Input, { value: editForm.secondaryPhone, onChange: (event) => setEditForm({ ...editForm, secondaryPhone: event.target.value }) }) }), _jsx(Field, { label: "Contact d'urgence", children: _jsx(Input, { value: editForm.emergencyContactName, onChange: (event) => setEditForm({ ...editForm, emergencyContactName: event.target.value }) }) }), _jsx(Field, { label: "T\u00E9l\u00E9phone d'urgence", children: _jsx(Input, { value: editForm.emergencyContactPhone, onChange: (event) => setEditForm({ ...editForm, emergencyContactPhone: event.target.value }) }) }), _jsx(Field, { label: "Adresse", className: "sm:col-span-2", children: _jsx(Input, { value: editForm.address, onChange: (event) => setEditForm({ ...editForm, address: event.target.value }) }) }), _jsx(Field, { label: "Ville", children: _jsx(Input, { value: editForm.city, onChange: (event) => setEditForm({ ...editForm, city: event.target.value }) }) }), _jsx(Field, { label: "Notes internes", className: "sm:col-span-2", children: _jsx(Textarea, { rows: 3, value: editForm.notes, onChange: (event) => setEditForm({ ...editForm, notes: event.target.value }) }) })] }) })] }));
};
