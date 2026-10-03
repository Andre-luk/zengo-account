import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Cpu, DownloadCloud, KeyRound, Lock, LockOpen, Power, ShieldCheck, ShieldHalf, Copy, } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, DataRow, DescriptionList } from '@/components/ui/Card';
import { EmptyState, ErrorState, InlineEmpty, Skeleton, TableSkeleton } from '@/components/ui/Feedback';
import { Field, Input } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { TBody, TD, TH, THead, TR, TableWrap } from '@/components/ui/Table';
import { useAlerts, useDevice } from '@/hooks/queries';
import { api } from '@/lib/api';
import { formatDateTime, formatRelative } from '@/lib/format';
import { ALERT_STATUS, ALERT_TYPE, ARM_MODE, DEVICE_STATUS, LANGUAGE, SUB_DEVICE_CODE, describe } from '@/lib/labels';
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
const TOKEN_ROLES = ['SUPER_ADMIN', 'TECHNICAL_DIRECTOR'];
export const DeviceDetailPage = () => {
    const { deviceId } = useParams();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const pushToast = useUiStore((state) => state.pushToast);
    const hasRole = useAuthStore((state) => state.hasRole);
    const [firmwareOpen, setFirmwareOpen] = useState(false);
    const [firmwareVersion, setFirmwareVersion] = useState('');
    const [token, setToken] = useState(null);
    const [copied, setCopied] = useState(false);
    const deviceQuery = useDevice(deviceId);
    const device = deviceQuery.data;
    const alertsQuery = useAlerts({ deviceId: deviceId ?? '', limit: 10 });
    const canManage = hasRole(...MANAGER_ROLES);
    const canRotateToken = hasRole(...TOKEN_ROLES);
    const reportError = (message) => pushToast({ tone: 'danger', title: 'Opération refusée', description: message });
    const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['devices'] });
    const setArm = useMutation({
        mutationFn: async (mode) => api.post(`/devices/${deviceId}/arm-mode`, { mode }),
        onSuccess: (_data, mode) => {
            invalidate();
            pushToast({ tone: 'brand', title: `Commande ${describe(ARM_MODE, mode).label} transmise` });
        },
        onError: (error) => reportError(error.message),
    });
    const changeStatus = useMutation({
        mutationFn: async (status) => api.patch(`/devices/${deviceId}/status`, { status }),
        onSuccess: () => {
            invalidate();
            pushToast({ tone: 'success', title: 'État du dispositif mis a jour' });
        },
        onError: (error) => reportError(error.message),
    });
    const rotateToken = useMutation({
        mutationFn: async () => api.post(`/devices/${deviceId}/token`, {}),
        onSuccess: (data) => {
            invalidate();
            setToken(data.token);
        },
        onError: (error) => reportError(error.message),
    });
    const pushFirmware = useMutation({
        mutationFn: async () => api.patch(`/devices/${deviceId}`, { firmwareTargetVersion: Number(firmwareVersion) }),
        onSuccess: () => {
            invalidate();
            setFirmwareOpen(false);
            setFirmwareVersion('');
            pushToast({
                tone: 'info',
                title: 'Mise à jour OTA programmee',
                description: 'La centrale telechargera le firmware a sa prochaine synchronisation.',
            });
        },
        onError: (error) => reportError(error.message),
    });
    if (deviceQuery.isLoading) {
        return (_jsxs("div", { className: "space-y-4", children: [_jsx(Skeleton, { className: "h-28 w-full" }), _jsx(Skeleton, { className: "h-64 w-full" })] }));
    }
    if (deviceQuery.isError || !device) {
        return _jsx(ErrorState, { message: "Dispositif introuvable ou hors de votre p\u00E9rim\u00E8tre.", onRetry: () => void deviceQuery.refetch() });
    }
    return (_jsxs("div", { className: "space-y-5", children: [_jsx(Card, { className: "p-5", children: _jsxs("div", { className: "flex flex-wrap items-start justify-between gap-4", children: [_jsxs("div", { className: "flex min-w-0 items-start gap-4", children: [_jsx(Button, { variant: "ghost", size: "icon", onClick: () => navigate('/dispositifs'), "aria-label": "Retour", children: _jsx(ArrowLeft, { className: "h-4 w-4" }) }), _jsxs("div", { className: "min-w-0", children: [_jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [_jsx("h2", { className: "font-mono text-lg font-semibold text-slate-900 dark:text-white", children: device.serialNumber }), _jsx(Badge, { tone: describe(DEVICE_STATUS, device.status).tone, dot: device.status === 'OFFLINE', children: describe(DEVICE_STATUS, device.status).label }), _jsx(Badge, { tone: describe(ARM_MODE, device.armMode).tone, children: describe(ARM_MODE, device.armMode).label })] }), _jsxs("p", { className: "mt-1 text-sm text-slate-600 dark:text-slate-300", children: [device.model, " \u00B7 firmware ", device.firmwareVersion ?? '—', device.firmwareTargetVersion ? ` → cible ${device.firmwareTargetVersion}` : ''] }), _jsxs("p", { className: "mt-0.5 text-xs text-slate-500 dark:text-slate-400", children: ["Dernier signe de vie : ", formatDateTime(device.lastHeartbeatAt ?? device.lastSeenAt), " \u00B7", ' ', device.organization?.name ?? 'Stock national'] })] })] }), canManage ? (_jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [_jsx(Button, { size: "sm", variant: "secondary", icon: _jsx(Lock, { className: "h-3.5 w-3.5" }), disabled: device.armMode === 1, onClick: () => setArm.mutate(1), children: "Armer" }), _jsx(Button, { size: "sm", variant: "secondary", icon: _jsx(ShieldHalf, { className: "h-3.5 w-3.5" }), disabled: device.armMode === 2, onClick: () => setArm.mutate(2), children: "Armer partiel" }), _jsx(Button, { size: "sm", variant: "outline", icon: _jsx(LockOpen, { className: "h-3.5 w-3.5" }), disabled: device.armMode === 0, onClick: () => setArm.mutate(0), children: "D\u00E9sarmer" }), _jsx(Button, { size: "sm", variant: "ghost", icon: _jsx(DownloadCloud, { className: "h-3.5 w-3.5" }), onClick: () => setFirmwareOpen(true), children: "Firmware" }), canRotateToken ? (_jsx(Button, { size: "sm", variant: "ghost", icon: _jsx(KeyRound, { className: "h-3.5 w-3.5" }), loading: rotateToken.isPending, onClick: () => rotateToken.mutate(), children: "Token" })) : null, _jsx(Button, { size: "sm", variant: device.status === 'DISABLED' ? 'success' : 'danger', icon: _jsx(Power, { className: "h-3.5 w-3.5" }), loading: changeStatus.isPending, onClick: () => changeStatus.mutate(device.status === 'DISABLED' ? 'PROVISIONED' : 'DISABLED'), children: device.status === 'DISABLED' ? 'Réactiver' : 'Désactiver' })] })) : null] }) }), _jsxs("div", { className: "grid gap-4 lg:grid-cols-3", children: [_jsxs(Card, { className: "lg:col-span-2", children: [_jsx(CardHeader, { title: "Sous-appareils d\u00E9clar\u00E9s", description: "\u00C9tat d\u00E9cod\u00E9 des entrees de la centrale", icon: _jsx(Cpu, { className: "h-4 w-4" }) }), !device.subDevices?.length ? (_jsx(EmptyState, { title: "Aucun sous-appareil", description: "Les capteurs sont d\u00E9clar\u00E9s automatiquement par la centrale lors de la synchronisation." })) : (_jsxs(TableWrap, { children: [_jsxs(THead, { children: [_jsx(TH, { children: "Identifiant" }), _jsx(TH, { children: "Libelle" }), _jsx(TH, { children: "Type" }), _jsx(TH, { children: "Zone" }), _jsx(TH, { children: "\u00C9tat" }), _jsx(TH, { className: "text-right", children: "Dernier signe" })] }), _jsx(TBody, { children: device.subDevices.map((subDevice) => (_jsxs(TR, { children: [_jsx(TD, { className: "font-mono text-xs", children: subDevice.subId }), _jsx(TD, { children: subDevice.name }), _jsx(TD, { className: "text-xs", children: describe(SUB_DEVICE_CODE, subDevice.code).label }), _jsx(TD, { className: "text-xs", children: subDevice.areaName ?? '—' }), _jsx(TD, { children: subDevice.decodedState ? (_jsxs("span", { className: "flex flex-wrap gap-1", children: [subDevice.decodedState.offline ? _jsx(Badge, { tone: "neutral", children: "Hors ligne" }) : null, subDevice.decodedState.open ? _jsx(Badge, { tone: "warning", children: "Ouvert" }) : null, subDevice.decodedState.tamper ? _jsx(Badge, { tone: "danger", children: "Sabotage" }) : null, subDevice.decodedState.lowBattery ? _jsx(Badge, { tone: "warning", children: "Batterie faible" }) : null, !subDevice.decodedState.offline &&
                                                                !subDevice.decodedState.open &&
                                                                !subDevice.decodedState.tamper &&
                                                                !subDevice.decodedState.lowBattery ? (_jsx(Badge, { tone: "success", children: "Normal" })) : null] })) : ('—') }), _jsx(TD, { className: "text-right text-xs text-slate-500 dark:text-slate-400", children: formatRelative(subDevice.lastSeenAt) })] }, subDevice.id))) })] }))] }), _jsxs("div", { className: "space-y-4", children: [_jsxs(Card, { children: [_jsx(CardHeader, { title: "Caracteristiques", icon: _jsx(ShieldCheck, { className: "h-4 w-4" }) }), _jsx(CardBody, { className: "pt-2", children: _jsxs(DescriptionList, { children: [_jsx(DataRow, { label: "IMEI", value: _jsx("span", { className: "font-mono text-xs", children: device.imei ?? '—' }) }), _jsx(DataRow, { label: "SIM data", value: _jsx("span", { className: "font-mono text-xs", children: device.simNumber ?? '—' }) }), _jsx(DataRow, { label: "Num\u00E9ro d'alarme", value: _jsx("span", { className: "font-mono text-xs", children: device.alarmPhoneNumber ?? '—' }) }), _jsx(DataRow, { label: "Firmware", value: device.firmwareVersion ?? '—' }), _jsx(DataRow, { label: "Langue", value: LANGUAGE[device.language] ?? device.language }), _jsx(DataRow, { label: "Agence", value: device.organization?.name ?? 'Stock national' }), _jsx(DataRow, { label: "Provisionne le", value: formatDateTime(device.createdAt) })] }) })] }), _jsxs(Card, { children: [_jsx(CardHeader, { title: "Client detenteur" }), _jsx(CardBody, { className: "pt-2", children: device.client ? (_jsxs(DescriptionList, { children: [_jsx(DataRow, { label: "Titulaire", value: _jsx(Link, { to: `/clients/${device.client.id}`, className: "text-brand-600 hover:underline dark:text-brand-400", children: device.client.fullName }) }), _jsx(DataRow, { label: "ID Zengo", value: _jsx("span", { className: "font-mono text-xs", children: device.client.zengoId }) }), _jsx(DataRow, { label: "T\u00E9l\u00E9phone", value: device.client.primaryPhone }), _jsx(DataRow, { label: "Ville", value: device.client.city ?? '—' })] })) : (_jsx(InlineEmpty, { children: "Ce kit est en stock et n'est rattach\u00E9 \u00E0 aucun compte client." })) })] })] })] }), _jsxs(Card, { className: "overflow-hidden", children: [_jsx(CardHeader, { title: "Derni\u00E8res alertes du dispositif", description: "Les 10 plus r\u00E9centes" }), alertsQuery.isLoading ? (_jsx(TableSkeleton, { rows: 4, columns: 4 })) : (alertsQuery.data?.items.length ?? 0) === 0 ? (_jsx(EmptyState, { title: "Aucune alerte", description: "Ce dispositif n'a pas d\u00E9clenche d'alerte." })) : (_jsxs(TableWrap, { children: [_jsxs(THead, { children: [_jsx(TH, { children: "R\u00E9f\u00E9rence" }), _jsx(TH, { children: "Nature" }), _jsx(TH, { children: "Statut" }), _jsx(TH, { className: "text-right", children: "D\u00E9clench\u00E9e" })] }), _jsx(TBody, { children: alertsQuery.data?.items.map((alert) => (_jsxs(TR, { onClick: () => navigate(`/alertes/${alert.id}`), children: [_jsx(TD, { className: "font-mono text-xs font-semibold", children: alert.reference }), _jsx(TD, { className: "text-xs", children: describe(ALERT_TYPE, alert.type).label }), _jsx(TD, { children: _jsx(Badge, { tone: describe(ALERT_STATUS, alert.status).tone, children: describe(ALERT_STATUS, alert.status).label }) }), _jsx(TD, { className: "text-right text-xs text-slate-500 dark:text-slate-400", children: formatRelative(alert.openedAt) })] }, alert.id))) })] }))] }), _jsx(Modal, { open: firmwareOpen, onClose: () => setFirmwareOpen(false), title: "Mise \u00E0 jour du firmware", description: "La centrale Telecharge et applique le firmware cible lors de sa prochaine synchronisation MQTT.", size: "sm", footer: _jsxs(_Fragment, { children: [_jsx(Button, { variant: "ghost", onClick: () => setFirmwareOpen(false), children: "Annuler" }), _jsx(Button, { loading: pushFirmware.isPending, disabled: !firmwareVersion, onClick: () => pushFirmware.mutate(), children: "Programmer" })] }), children: _jsx(Field, { label: "Version cible", hint: `Version actuelle : ${device.firmwareVersion ?? 'inconnue'}`, required: true, children: _jsx(Input, { type: "number", min: 1, value: firmwareVersion, onChange: (event) => setFirmwareVersion(event.target.value), placeholder: "2" }) }) }), _jsx(Modal, { open: Boolean(token), onClose: () => {
                    setToken(null);
                    setCopied(false);
                }, title: "Nouveau token du dispositif", description: "Ce token ne sera plus affiche. Il doit etre injecte dans la centrale avant sa prochaine connexion.", size: "sm", footer: _jsxs(_Fragment, { children: [_jsx(Button, { variant: "secondary", icon: _jsx(Copy, { className: "h-4 w-4" }), onClick: async () => {
                                await navigator.clipboard.writeText(token ?? '');
                                setCopied(true);
                            }, children: copied ? 'Copie dans le presse-papier' : 'Copier le token' }), _jsx(Button, { onClick: () => {
                                setToken(null);
                                setCopied(false);
                            }, children: "Terminer" })] }), children: _jsx("code", { className: "block break-all rounded-lg bg-slate-900 p-3 font-mono text-xs text-emerald-300", children: token }) })] }));
};
