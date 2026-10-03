import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, KeyRound, UserPlus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useOrganizations, useTariffGroups } from '@/hooks/queries';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { LANGUAGE, OFFER_PACK, describe } from '@/lib/labels';
import { useUiStore } from '@/store/ui';
const PACKS = ['STANDARD', 'PREMIUM_SMALL', 'PREMIUM_INSTITUTION', 'CUSTOM'];
const emptyForm = {
    fullName: '',
    companyName: '',
    primaryPhone: '',
    secondaryPhone: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    preferredLanguage: 'fr',
    address: '',
    city: '',
    country: 'CD',
    organizationId: '',
    offerPack: '',
    tariffGroupId: '',
    currency: 'USD',
    sosButtonCount: 1,
    createUserAccount: true,
    loginEmail: '',
    deviceSerialNumber: '',
    notes: '',
};
export const ClientFormModal = ({ open, onClose }) => {
    const queryClient = useQueryClient();
    const pushToast = useUiStore((state) => state.pushToast);
    const [form, setForm] = useState(emptyForm);
    const [result, setResult] = useState(null);
    const [copied, setCopied] = useState(false);
    const agenciesQuery = useOrganizations({ limit: 100, type: 'AGENCY' });
    const regionsQuery = useOrganizations({ limit: 100, type: 'REGION' });
    const tariffsQuery = useTariffGroups({ limit: 100 });
    const agencies = useMemo(() => [...(agenciesQuery.data?.items ?? []), ...(regionsQuery.data?.items ?? [])], [agenciesQuery.data, regionsQuery.data]);
    const selectedTariff = useMemo(() => tariffsQuery.data?.items.find((item) => item.id === form.tariffGroupId) ?? null, [tariffsQuery.data, form.tariffGroupId]);
    const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
    const create = useMutation({
        mutationFn: async () => {
            const payload = {
                fullName: form.fullName.trim(),
                primaryPhone: form.primaryPhone.trim(),
                organizationId: form.organizationId,
                preferredLanguage: form.preferredLanguage,
                currency: form.currency,
                sosButtonCount: Number(form.sosButtonCount) || 1,
                createUserAccount: form.createUserAccount,
                ...(form.companyName ? { companyName: form.companyName.trim() } : {}),
                ...(form.secondaryPhone ? { secondaryPhone: form.secondaryPhone.trim() } : {}),
                ...(form.emergencyContactName ? { emergencyContactName: form.emergencyContactName.trim() } : {}),
                ...(form.emergencyContactPhone ? { emergencyContactPhone: form.emergencyContactPhone.trim() } : {}),
                ...(form.address ? { address: form.address.trim() } : {}),
                ...(form.city ? { city: form.city.trim() } : {}),
                ...(form.country ? { country: form.country.trim() } : {}),
                ...(form.offerPack ? { offerPack: form.offerPack } : {}),
                ...(form.tariffGroupId ? { tariffGroupId: form.tariffGroupId } : {}),
                ...(form.loginEmail ? { loginEmail: form.loginEmail.trim() } : {}),
                ...(form.deviceSerialNumber ? { deviceSerialNumber: form.deviceSerialNumber.trim() } : {}),
                ...(form.notes ? { notes: form.notes.trim() } : {}),
            };
            return api.post('/clients', payload);
        },
        onSuccess: (data) => {
            void queryClient.invalidateQueries({ queryKey: ['clients'] });
            setResult(data);
            pushToast({
                tone: 'success',
                title: 'Compte client créé',
                description: `ID Zengo ${data.client.zengoId} — statut : en attente d'installation.`,
            });
        },
        onError: (error) => pushToast({ tone: 'danger', title: 'Création impossible', description: error.message }),
    });
    const close = () => {
        if (result) {
            setForm(emptyForm);
            setResult(null);
            setCopied(false);
        }
        onClose();
    };
    return (_jsx(Modal, { open: open, onClose: close, title: result ? 'Compte client créé' : 'Nouveau compte client', description: result
            ? 'Conservez les identifiants ci-dessous : ils ne seront plus affiches.'
            : "Le rattachement à une agence détermine les stations d'intervention disponibles.", size: "lg", footer: result ? (_jsxs(_Fragment, { children: [_jsx(Button, { variant: "ghost", onClick: close, children: "Fermer" }), _jsx(Button, { variant: "secondary", onClick: () => setResult(null), children: "Cr\u00E9er un autre compte" })] })) : (_jsxs(_Fragment, { children: [_jsx(Button, { variant: "ghost", onClick: close, children: "Annuler" }), _jsx(Button, { icon: _jsx(UserPlus, { className: "h-4 w-4" }), loading: create.isPending, disabled: !form.fullName.trim() || !form.primaryPhone.trim() || !form.organizationId, onClick: () => create.mutate(), children: "Cr\u00E9er le compte" })] })), children: result ? (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-500/30 dark:bg-emerald-500/10", children: [_jsxs("p", { className: "flex items-center gap-2 text-sm font-semibold text-emerald-800 dark:text-emerald-200", children: [_jsx(Check, { className: "h-4 w-4" }), result.client.fullName] }), _jsx("p", { className: "mt-1 font-mono text-lg font-semibold text-emerald-900 dark:text-emerald-100", children: result.client.zengoId })] }), result.temporaryPassword ? (_jsxs("div", { className: "rounded-xl border border-slate-200 p-4 dark:border-slate-800", children: [_jsxs("p", { className: "flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase dark:text-slate-400", children: [_jsx(KeyRound, { className: "h-3.5 w-3.5" }), "Mot de passe temporaire"] }), _jsxs("div", { className: "mt-2 flex items-center justify-between gap-3", children: [_jsx("code", { className: "font-mono text-base font-semibold text-slate-900 dark:text-white", children: result.temporaryPassword }), _jsx(Button, { size: "sm", variant: "secondary", icon: _jsx(Copy, { className: "h-3.5 w-3.5" }), onClick: async () => {
                                        await navigator.clipboard.writeText(result.temporaryPassword ?? '');
                                        setCopied(true);
                                    }, children: copied ? 'Copie' : 'Copier' })] }), _jsx("p", { className: "mt-2 text-xs text-slate-500 dark:text-slate-400", children: "Le client devra changer ce mot de passe \u00E0 sa premi\u00E8re connexion sur l'application mobile." })] })) : null, _jsxs("div", { className: "rounded-xl border border-slate-200 p-4 dark:border-slate-800", children: [_jsx("p", { className: "text-xs font-semibold text-slate-500 uppercase dark:text-slate-400", children: "Facturation du kit" }), _jsxs("dl", { className: "mt-2 space-y-1.5 text-sm", children: [_jsxs("div", { className: "flex justify-between", children: [_jsxs("dt", { className: "text-slate-500 dark:text-slate-400", children: ["Kit + ", result.pricing.extraSosButtons, " bouton(s) SOS supplementaire(s)"] }), _jsx("dd", { className: "font-medium text-slate-900 dark:text-white", children: formatMoney(result.pricing.totalKitUsd, result.pricing.currency) })] }), _jsxs("div", { className: "flex justify-between", children: [_jsx("dt", { className: "text-slate-500 dark:text-slate-400", children: "Abonnement mensuel" }), _jsx("dd", { className: "font-medium text-slate-900 dark:text-white", children: formatMoney(result.pricing.totalMonthlyUsd, result.pricing.currency) })] }), result.pricing.currency === 'CDF' && result.pricing.totalKitCdf ? (_jsxs("div", { className: "flex justify-between border-t border-slate-100 pt-1.5 dark:border-slate-800", children: [_jsxs("dt", { className: "text-slate-500 dark:text-slate-400", children: ["\u00C9quivalent CDF (taux ", result.pricing.exchangeRateUsdToCdf, ")"] }), _jsx("dd", { className: "font-medium text-slate-900 dark:text-white", children: formatMoney(result.pricing.totalKitCdf, 'CDF') })] })) : null] })] })] })) : (_jsxs("div", { className: "space-y-5", children: [_jsxs("section", { className: "space-y-4", children: [_jsx("h3", { className: "text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400", children: "Identit\u00E9 du client" }), _jsxs("div", { className: "grid gap-4 sm:grid-cols-2", children: [_jsx(Field, { label: "Nom complet", required: true, children: _jsx(Input, { value: form.fullName, onChange: (event) => set('fullName', event.target.value), placeholder: "Jean Kabila" }) }), _jsx(Field, { label: "Raison sociale", hint: "Institutions et comptes sur mesure", children: _jsx(Input, { value: form.companyName, onChange: (event) => set('companyName', event.target.value), placeholder: "Etablissement scolaire Les Elites" }) }), _jsx(Field, { label: "T\u00E9l\u00E9phone principal", required: true, children: _jsx(Input, { value: form.primaryPhone, onChange: (event) => set('primaryPhone', event.target.value), placeholder: "+243970255599" }) }), _jsx(Field, { label: "T\u00E9l\u00E9phone secondaire", children: _jsx(Input, { value: form.secondaryPhone, onChange: (event) => set('secondaryPhone', event.target.value) }) })] })] }), _jsxs("section", { className: "space-y-4 border-t border-slate-100 pt-4 dark:border-slate-800", children: [_jsx("h3", { className: "text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400", children: "Localisation & contacts d'urgence" }), _jsxs("div", { className: "grid gap-4 sm:grid-cols-2", children: [_jsx(Field, { label: "Adresse", children: _jsx(Input, { value: form.address, onChange: (event) => set('address', event.target.value), placeholder: "12, av. de la Justice" }) }), _jsx(Field, { label: "Ville", children: _jsx(Input, { value: form.city, onChange: (event) => set('city', event.target.value), placeholder: "Kinshasa" }) }), _jsx(Field, { label: "Contact d'urgence", children: _jsx(Input, { value: form.emergencyContactName, onChange: (event) => set('emergencyContactName', event.target.value), placeholder: "Marie Kabila (epouse)" }) }), _jsx(Field, { label: "T\u00E9l\u00E9phone d'urgence", children: _jsx(Input, { value: form.emergencyContactPhone, onChange: (event) => set('emergencyContactPhone', event.target.value) }) }), _jsx(Field, { label: "Langue du client", hint: "Utilis\u00E9e par les appels vocaux IA", children: _jsx(Select, { value: form.preferredLanguage, onChange: (event) => set('preferredLanguage', event.target.value), children: Object.entries(LANGUAGE).map(([code, label]) => (_jsx("option", { value: code, children: label }, code))) }) })] })] }), _jsxs("section", { className: "space-y-4 border-t border-slate-100 pt-4 dark:border-slate-800", children: [_jsx("h3", { className: "text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400", children: "Offre & rattachement" }), _jsxs("div", { className: "grid gap-4 sm:grid-cols-2", children: [_jsx(Field, { label: "Agence / PDC de rattachement", required: true, children: _jsxs(Select, { value: form.organizationId, onChange: (event) => set('organizationId', event.target.value), children: [_jsx("option", { value: "", children: "S\u00E9lectionner\u2026" }), agencies.map((organization) => (_jsxs("option", { value: organization.id, children: [organization.name, " (", organization.code, ")"] }, organization.id)))] }) }), _jsx(Field, { label: "Pack commercial", hint: "pr\u00E9-rempli par le groupe tarifaire", children: _jsxs(Select, { value: form.offerPack, onChange: (event) => set('offerPack', event.target.value), children: [_jsx("option", { value: "", children: "Automatique" }), PACKS.map((pack) => (_jsx("option", { value: pack, children: describe(OFFER_PACK, pack).label }, pack)))] }) }), _jsx(Field, { label: "Groupe tarifaire", children: _jsxs(Select, { value: form.tariffGroupId, onChange: (event) => set('tariffGroupId', event.target.value), children: [_jsx("option", { value: "", children: "Aucun (tarif par d\u00E9faut)" }), tariffsQuery.data?.items.map((group) => (_jsx("option", { value: group.id, children: group.name }, group.id)))] }) }), _jsx(Field, { label: "Devise de facturation", children: _jsxs(Select, { value: form.currency, onChange: (event) => set('currency', event.target.value), children: [_jsx("option", { value: "USD", children: "Dollar americain (USD)" }), _jsx("option", { value: "CDF", children: "Franc congolais (CDF)" })] }) }), _jsx(Field, { label: "Boutons SOS factures", hint: "1 bouton inclus dans le kit", children: _jsx(Input, { type: "number", min: 1, max: selectedTariff?.maxSosButtons ?? 10, value: form.sosButtonCount, onChange: (event) => set('sosButtonCount', Number(event.target.value)) }) }), _jsx(Field, { label: "Num\u00E9ro de s\u00E9rie du kit", hint: "Si le dispositif est d\u00E9j\u00E0 provisionn\u00E9", children: _jsx(Input, { value: form.deviceSerialNumber, onChange: (event) => set('deviceSerialNumber', event.target.value), placeholder: "3003004fba2394", className: "font-mono" }) })] }), selectedTariff ? (_jsxs("p", { className: "rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-300", children: ["Kit ", formatMoney(Number(selectedTariff.registrationFeeUsd)), " +", ' ', formatMoney(Number(selectedTariff.sosButtonUnitPriceUsd)), " par bouton SOS supplementaire \u00B7 abonnement", ' ', formatMoney(Number(selectedTariff.monthlyFeeUsd)), "/mois."] })) : null] }), _jsxs("section", { className: "space-y-4 border-t border-slate-100 pt-4 dark:border-slate-800", children: [_jsx("h3", { className: "text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400", children: "Acc\u00E8s application mobile" }), _jsxs("label", { className: "flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200", children: [_jsx("input", { type: "checkbox", className: "h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500", checked: form.createUserAccount, onChange: (event) => set('createUserAccount', event.target.checked) }), "Cr\u00E9er le compte de connexion du client"] }), form.createUserAccount ? (_jsx("div", { className: "grid gap-4 sm:grid-cols-2", children: _jsx(Field, { label: "Email de connexion", hint: "Sinon le t\u00E9l\u00E9phone est utilis\u00E9", children: _jsx(Input, { type: "email", value: form.loginEmail, onChange: (event) => set('loginEmail', event.target.value), placeholder: "client@exemple.cd" }) }) })) : null, _jsx(Field, { label: "Notes internes", children: _jsx(Textarea, { rows: 3, value: form.notes, onChange: (event) => set('notes', event.target.value), placeholder: "Particularit\u00E9s du site, consignes d'acc\u00E8s, historique commercial..." }) })] })] })) }));
};
