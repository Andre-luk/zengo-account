import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Calculator, Coins, Pencil, Plus, RefreshCw, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, DataRow, DescriptionList } from '@/components/ui/Card';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/Feedback';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Pagination, TBody, TD, TH, THead, TR, TableWrap } from '@/components/ui/Table';
import { useTariffGroups } from '@/hooks/queries';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/queryClient';
import { formatMoney, formatNumber } from '@/lib/format';
import { OFFER_PACK, describe } from '@/lib/labels';
import { useAuthStore } from '@/store/auth';
import { useUiStore } from '@/store/ui';
const MANAGE_ROLES = ['SUPER_ADMIN', 'NATIONAL_DIRECTOR', 'TECHNICAL_DIRECTOR', 'DAF'];
const PACKS = ['STANDARD', 'PREMIUM_SMALL', 'PREMIUM_INSTITUTION', 'CUSTOM'];
const emptyForm = {
    name: '',
    code: '',
    offerPack: 'PREMIUM_SMALL',
    description: '',
    registrationFeeUsd: '350',
    monthlyFeeUsd: '25',
    includedSosButtons: '1',
    sosButtonUnitPriceUsd: '5',
    maxSosButtons: '10',
    exchangeRateUsdToCdf: '2800',
};
export const TariffsPage = () => {
    const queryClient = useQueryClient();
    const pushToast = useUiStore((state) => state.pushToast);
    const hasRole = useAuthStore((state) => state.hasRole);
    const canManage = hasRole(...MANAGE_ROLES);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [offerPack, setOfferPack] = useState('');
    const [includeArchived, setIncludeArchived] = useState(false);
    const [editing, setEditing] = useState(null);
    const [formOpen, setFormOpen] = useState(false);
    const [form, setForm] = useState(emptyForm);
    const [rateTarget, setRateTarget] = useState(null);
    const [rateValue, setRateValue] = useState('');
    // Simulateur de facturation
    const [simGroup, setSimGroup] = useState('');
    const [simSos, setSimSos] = useState(1);
    const params = useMemo(() => ({
        page,
        limit: 20,
        order: 'asc',
        ...(search ? { search } : {}),
        ...(offerPack ? { offerPack } : {}),
        ...(includeArchived ? { includeArchived: 'true' } : {}),
    }), [page, search, offerPack, includeArchived]);
    const tariffsQuery = useTariffGroups(params);
    const previewQuery = useQuery({
        queryKey: queryKeys.pricePreview(simGroup, simSos),
        queryFn: () => api.post('/tariff-groups/price-preview', { tariffGroupId: simGroup, sosButtonCount: simSos }),
        enabled: Boolean(simGroup),
    });
    const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['tariffs'] });
    const save = useMutation({
        mutationFn: async () => {
            const payload = {
                name: form.name.trim(),
                offerPack: form.offerPack,
                registrationFeeUsd: Number(form.registrationFeeUsd),
                monthlyFeeUsd: Number(form.monthlyFeeUsd),
                includedSosButtons: Number(form.includedSosButtons),
                sosButtonUnitPriceUsd: Number(form.sosButtonUnitPriceUsd),
                maxSosButtons: Number(form.maxSosButtons),
                exchangeRateUsdToCdf: Number(form.exchangeRateUsdToCdf),
                ...(form.description ? { description: form.description } : {}),
            };
            return editing
                ? api.patch(`/tariff-groups/${editing.id}`, payload)
                : api.post('/tariff-groups', { ...payload, code: form.code.trim().toUpperCase() });
        },
        onSuccess: () => {
            invalidate();
            setFormOpen(false);
            setEditing(null);
            setForm(emptyForm);
            pushToast({ tone: 'success', title: editing ? 'Grille tarifaire mise a jour' : 'Grille tarifaire créée' });
        },
        onError: (error) => pushToast({ tone: 'danger', title: 'Enregistrement refusé', description: error.message }),
    });
    const updateRate = useMutation({
        mutationFn: async () => api.patch(`/tariff-groups/${rateTarget?.id}/exchange-rate`, { exchangeRateUsdToCdf: Number(rateValue) }),
        onSuccess: () => {
            invalidate();
            setRateTarget(null);
            setRateValue('');
            pushToast({ tone: 'success', title: 'Taux de change mis a jour' });
        },
        onError: (error) => pushToast({ tone: 'danger', title: 'Mise à jour refusée', description: error.message }),
    });
    const setArchived = useMutation({
        mutationFn: async (input) => api.delete(`/tariff-groups/${input.id}`, { archived: input.archived }),
        onSuccess: (_data, variables) => {
            invalidate();
            pushToast({ tone: 'neutral', title: variables.archived ? 'Grille archivée' : 'Grille restaurée' });
        },
        onError: (error) => pushToast({ tone: 'danger', title: 'Opération refusée', description: error.message }),
    });
    const openCreate = () => {
        setEditing(null);
        setForm(emptyForm);
        setFormOpen(true);
    };
    const openEdit = (group) => {
        setEditing(group);
        setForm({
            name: group.name,
            code: group.code,
            offerPack: group.offerPack,
            description: group.description ?? '',
            registrationFeeUsd: String(Number(group.registrationFeeUsd)),
            monthlyFeeUsd: String(Number(group.monthlyFeeUsd)),
            includedSosButtons: String(group.includedSosButtons),
            sosButtonUnitPriceUsd: String(Number(group.sosButtonUnitPriceUsd)),
            maxSosButtons: String(group.maxSosButtons),
            exchangeRateUsdToCdf: String(Number(group.exchangeRateUsdToCdf ?? 2800)),
        });
        setFormOpen(true);
    };
    const simulatorGroups = tariffsQuery.data?.items ?? [];
    const preview = previewQuery.data;
    return (_jsxs("div", { className: "space-y-5", children: [_jsxs("div", { className: "grid gap-4 xl:grid-cols-3", children: [_jsxs(Card, { className: "xl:col-span-1", children: [_jsx(CardHeader, { title: "Simulateur de facturation", description: "Kit + boutons SOS, en USD et CDF", icon: _jsx(Calculator, { className: "h-4 w-4" }) }), _jsxs(CardBody, { className: "space-y-3 pt-3", children: [_jsx(Field, { label: "Grille tarifaire", children: _jsxs(Select, { value: simGroup, onChange: (event) => setSimGroup(event.target.value), children: [_jsx("option", { value: "", children: "S\u00E9lectionner\u2026" }), simulatorGroups.map((group) => (_jsx("option", { value: group.id, children: group.name }, group.id)))] }) }), _jsx(Field, { label: "Nombre total de boutons SOS", hint: "Kit inclus : 1 bouton", children: _jsx(Input, { type: "number", min: 1, max: 20, value: simSos, onChange: (event) => setSimSos(Number(event.target.value)) }) }), previewQuery.isLoading ? (_jsx("p", { className: "text-xs text-slate-500", children: "Calcul en cours\u2026" })) : preview ? (_jsxs(DescriptionList, { className: "border-t border-slate-100 pt-2 dark:border-slate-800", children: [_jsx(DataRow, { label: "Boutons suppl\u00E9mentaires", value: formatNumber(preview.extraSosButtons) }), _jsx(DataRow, { label: "Prix des boutons", value: formatMoney(preview.sosButtonsTotalUsd) }), _jsx(DataRow, { label: "Kit a payer", value: _jsx("span", { className: "font-semibold text-brand-700 dark:text-brand-300", children: formatMoney(preview.totalKitUsd, preview.currency) }) }), _jsx(DataRow, { label: "Abonnement / mois", value: formatMoney(preview.totalMonthlyUsd, preview.currency) }), preview.totalKitCdf ? (_jsx(DataRow, { label: "Kit en CDF", value: formatMoney(preview.totalKitCdf, 'CDF') })) : null, preview.totalMonthlyCdf ? (_jsx(DataRow, { label: "Abonnement en CDF", value: formatMoney(preview.totalMonthlyCdf, 'CDF') })) : null] })) : (_jsx("p", { className: "text-xs text-slate-500 dark:text-slate-400", children: "S\u00E9lectionnez une grille pour calculer le montant exact du kit et de l'abonnement." }))] })] }), _jsxs(Card, { className: "overflow-hidden xl:col-span-2", children: [_jsx(CardHeader, { title: "Grilles tarifaires", description: "Packs commerciaux, boutons SOS et taux USD/CDF", icon: _jsx(Coins, { className: "h-4 w-4" }), actions: canManage ? (_jsx(Button, { size: "sm", icon: _jsx(Plus, { className: "h-3.5 w-3.5" }), onClick: openCreate, children: "Nouvelle grille" })) : null }), _jsxs("div", { className: "flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3 dark:border-slate-800", children: [_jsxs("div", { className: "relative min-w-[180px] flex-1", children: [_jsx(Search, { className: "pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-slate-400" }), _jsx(Input, { value: search, onChange: (event) => {
                                                    setSearch(event.target.value);
                                                    setPage(1);
                                                }, placeholder: "Nom ou code de la grille...", className: "pl-9" })] }), _jsxs(Select, { className: "w-auto", value: offerPack, onChange: (event) => {
                                            setOfferPack(event.target.value);
                                            setPage(1);
                                        }, children: [_jsx("option", { value: "", children: "Tous les packs" }), PACKS.map((value) => (_jsx("option", { value: value, children: describe(OFFER_PACK, value).label }, value)))] }), _jsxs("label", { className: "flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300", children: [_jsx("input", { type: "checkbox", className: "h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500", checked: includeArchived, onChange: (event) => {
                                                    setIncludeArchived(event.target.checked);
                                                    setPage(1);
                                                } }), "Archives"] })] }), tariffsQuery.isLoading ? (_jsx(TableSkeleton, { rows: 6, columns: 5 })) : tariffsQuery.isError ? (_jsx(ErrorState, { onRetry: () => void tariffsQuery.refetch() })) : (tariffsQuery.data?.items.length ?? 0) === 0 ? (_jsx(EmptyState, { title: "Aucune grille tarifaire", description: "D\u00E9finissez les frais de souscription, l'abonnement mensuel et le prix des boutons SOS.", icon: _jsx(Coins, { className: "h-5 w-5" }) })) : (_jsxs(_Fragment, { children: [_jsxs(TableWrap, { children: [_jsxs(THead, { children: [_jsx(TH, { children: "Grille" }), _jsx(TH, { children: "Pack" }), _jsx(TH, { className: "text-right", children: "Kit" }), _jsx(TH, { className: "text-right", children: "Abonnement" }), _jsx(TH, { className: "text-right", children: "Bouton SOS" }), _jsx(TH, { className: "text-right", children: "Taux CDF" }), _jsx(TH, { children: "\u00C9tat" }), canManage ? _jsx(TH, { className: "text-right", children: "Actions" }) : null] }), _jsx(TBody, { children: tariffsQuery.data?.items.map((group) => (_jsxs(TR, { children: [_jsxs(TD, { children: [_jsx("span", { className: "block font-medium text-slate-800 dark:text-slate-100", children: group.name }), _jsx("span", { className: "block font-mono text-[11px] text-slate-400", children: group.code })] }), _jsx(TD, { className: "text-xs", children: describe(OFFER_PACK, group.offerPack).label }), _jsx(TD, { className: "text-right tabular-nums", children: formatMoney(Number(group.registrationFeeUsd)) }), _jsx(TD, { className: "text-right tabular-nums", children: formatMoney(Number(group.monthlyFeeUsd)) }), _jsxs(TD, { className: "text-right tabular-nums", children: [formatMoney(Number(group.sosButtonUnitPriceUsd)), _jsxs("span", { className: "ml-1 text-[11px] text-slate-400", children: ["(", group.includedSosButtons, " inclus, max ", group.maxSosButtons, ")"] })] }), _jsx(TD, { className: "text-right tabular-nums", children: group.exchangeRateUsdToCdf ? formatNumber(Number(group.exchangeRateUsdToCdf)) : '—' }), _jsx(TD, { children: group.archivedAt ? (_jsx(Badge, { tone: "neutral", children: "Archiv\u00E9e" })) : group.isActive ? (_jsx(Badge, { tone: "success", dot: true, children: "Active" })) : (_jsx(Badge, { tone: "warning", children: "Inactive" })) }), canManage ? (_jsx(TD, { className: "text-right", children: _jsxs("span", { className: "inline-flex gap-1", children: [_jsx(Button, { variant: "ghost", size: "icon", title: "Modifier", onClick: () => openEdit(group), children: _jsx(Pencil, { className: "h-3.5 w-3.5" }) }), _jsx(Button, { variant: "ghost", size: "icon", title: "Taux de change", onClick: () => {
                                                                            setRateTarget(group);
                                                                            setRateValue(String(Number(group.exchangeRateUsdToCdf ?? 2800)));
                                                                        }, children: _jsx(RefreshCw, { className: "h-3.5 w-3.5" }) }), _jsx(Button, { variant: "ghost", size: "sm", onClick: () => setArchived.mutate({ id: group.id, archived: !group.archivedAt }), children: group.archivedAt ? 'Restaurer' : 'Archiver' })] }) })) : null] }, group.id))) })] }), tariffsQuery.data ? _jsx(Pagination, { page: tariffsQuery.data, onPageChange: setPage }) : null] }))] })] }), _jsx(Modal, { open: formOpen, onClose: () => setFormOpen(false), title: editing ? `Modifier ${editing.name}` : 'Nouvelle grille tarifaire', description: "Le code est immuable et sert de reference comptable.", footer: _jsxs(_Fragment, { children: [_jsx(Button, { variant: "ghost", onClick: () => {
                                setFormOpen(false);
                                setEditing(null);
                            }, children: "Annuler" }), _jsx(Button, { loading: save.isPending, disabled: !form.name.trim() || (!editing && !form.code.trim()), onClick: () => save.mutate(), children: "Enregistrer" })] }), children: _jsxs("div", { className: "grid gap-4 sm:grid-cols-2", children: [_jsx(Field, { label: "Nom commercial", required: true, children: _jsx(Input, { value: form.name, onChange: (event) => setForm({ ...form, name: event.target.value }), placeholder: "Premium Pack Small - Petits commerces" }) }), _jsx(Field, { label: "Code", hint: "Non modifiable apr\u00E8s cr\u00E9ation", required: !editing, children: _jsx(Input, { value: form.code, disabled: Boolean(editing), onChange: (event) => setForm({ ...form, code: event.target.value.toUpperCase() }), placeholder: "PREMIUM_SMALL", className: "font-mono" }) }), _jsx(Field, { label: "Pack commercial", required: true, children: _jsx(Select, { value: form.offerPack, onChange: (event) => setForm({ ...form, offerPack: event.target.value }), children: PACKS.map((value) => (_jsx("option", { value: value, children: describe(OFFER_PACK, value).label }, value))) }) }), _jsx(Field, { label: "Frais de souscription (USD)", required: true, children: _jsx(Input, { type: "number", step: "0.01", min: 0, value: form.registrationFeeUsd, onChange: (event) => setForm({ ...form, registrationFeeUsd: event.target.value }) }) }), _jsx(Field, { label: "Abonnement mensuel (USD)", required: true, children: _jsx(Input, { type: "number", step: "0.01", min: 0, value: form.monthlyFeeUsd, onChange: (event) => setForm({ ...form, monthlyFeeUsd: event.target.value }) }) }), _jsx(Field, { label: "Prix unitaire du bouton SOS (USD)", required: true, children: _jsx(Input, { type: "number", step: "0.01", min: 0, value: form.sosButtonUnitPriceUsd, onChange: (event) => setForm({ ...form, sosButtonUnitPriceUsd: event.target.value }) }) }), _jsx(Field, { label: "Boutons SOS inclus", required: true, children: _jsx(Input, { type: "number", min: 0, value: form.includedSosButtons, onChange: (event) => setForm({ ...form, includedSosButtons: event.target.value }) }) }), _jsx(Field, { label: "Boutons SOS maximum", required: true, children: _jsx(Input, { type: "number", min: 1, value: form.maxSosButtons, onChange: (event) => setForm({ ...form, maxSosButtons: event.target.value }) }) }), _jsx(Field, { label: "Taux USD \u2192 CDF", required: true, children: _jsx(Input, { type: "number", step: "0.0001", min: 0, value: form.exchangeRateUsdToCdf, onChange: (event) => setForm({ ...form, exchangeRateUsdToCdf: event.target.value }) }) }), _jsx(Field, { label: "Description", className: "sm:col-span-2", children: _jsx(Textarea, { rows: 3, value: form.description, onChange: (event) => setForm({ ...form, description: event.target.value }), placeholder: "Cible commerciale, services inclus, conditions particulieres..." }) })] }) }), _jsx(Modal, { open: Boolean(rateTarget), onClose: () => setRateTarget(null), title: "Taux de change USD \u2192 CDF", description: rateTarget?.name, size: "sm", footer: _jsxs(_Fragment, { children: [_jsx(Button, { variant: "ghost", onClick: () => setRateTarget(null), children: "Annuler" }), _jsx(Button, { loading: updateRate.isPending, disabled: !rateValue, onClick: () => updateRate.mutate(), children: "Mettre a jour" })] }), children: _jsx(Field, { label: "1 USD equivaut a (CDF)", required: true, children: _jsx(Input, { type: "number", step: "0.0001", min: 0, value: rateValue, onChange: (event) => setRateValue(event.target.value) }) }) })] }));
};
