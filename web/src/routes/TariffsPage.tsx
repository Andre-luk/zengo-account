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
import type { OfferPack, PriceBreakdown, TariffGroup } from '@/types/api';

const MANAGE_ROLES = ['SUPER_ADMIN', 'NATIONAL_DIRECTOR', 'TECHNICAL_DIRECTOR', 'DAF'] as const;
const PACKS: OfferPack[] = ['STANDARD', 'PREMIUM_SMALL', 'PREMIUM_INSTITUTION', 'CUSTOM'];

interface TariffForm {
  name: string;
  code: string;
  offerPack: OfferPack;
  description: string;
  registrationFeeUsd: string;
  monthlyFeeUsd: string;
  includedSosButtons: string;
  sosButtonUnitPriceUsd: string;
  maxSosButtons: string;
  exchangeRateUsdToCdf: string;
}

const emptyForm: TariffForm = {
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
  const [editing, setEditing] = useState<TariffGroup | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<TariffForm>(emptyForm);
  const [rateTarget, setRateTarget] = useState<TariffGroup | null>(null);
  const [rateValue, setRateValue] = useState('');

  // Simulateur de facturation
  const [simGroup, setSimGroup] = useState('');
  const [simSos, setSimSos] = useState(1);

  const params = useMemo(
    () => ({
      page,
      limit: 20,
      order: 'asc' as const,
      ...(search ? { search } : {}),
      ...(offerPack ? { offerPack } : {}),
      ...(includeArchived ? { includeArchived: 'true' } : {}),
    }),
    [page, search, offerPack, includeArchived],
  );

  const tariffsQuery = useTariffGroups(params);

  const previewQuery = useQuery({
    queryKey: queryKeys.pricePreview(simGroup, simSos),
    queryFn: () => api.post<PriceBreakdown>('/tariff-groups/price-preview', { tariffGroupId: simGroup, sosButtonCount: simSos }),
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
      pushToast({ tone: 'success', title: editing ? 'Grille tarifaire mise à jour' : 'Grille tarifaire créée' });
    },
    onError: (error: Error) => pushToast({ tone: 'danger', title: 'Enregistrement refusé', description: error.message }),
  });

  const updateRate = useMutation({
    mutationFn: async () =>
      api.patch(`/tariff-groups/${rateTarget?.id}/exchange-rate`, { exchangeRateUsdToCdf: Number(rateValue) }),
    onSuccess: () => {
      invalidate();
      setRateTarget(null);
      setRateValue('');
      pushToast({ tone: 'success', title: 'Taux de change mis à jour' });
    },
    onError: (error: Error) => pushToast({ tone: 'danger', title: 'Mise à jour refusée', description: error.message }),
  });

  const setArchived = useMutation({
    mutationFn: async (input: { id: string; archived: boolean }) =>
      api.delete(`/tariff-groups/${input.id}`, { archived: input.archived }),
    onSuccess: (_data, variables) => {
      invalidate();
      pushToast({ tone: 'neutral', title: variables.archived ? 'Grille archivée' : 'Grille restaurée' });
    },
    onError: (error: Error) => pushToast({ tone: 'danger', title: 'Opération refusée', description: error.message }),
  });

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormOpen(true);
  };

  const openEdit = (group: TariffGroup) => {
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

  return (
    <div className="space-y-5">
      <div className="grid gap-4 xl:grid-cols-3">
        {/* Simulateur de facturation */}
        <Card className="xl:col-span-1">
          <CardHeader
            title="Simulateur de facturation"
            description="Kit + boutons SOS, en USD et CDF"
            icon={<Calculator className="h-4 w-4" />}
          />
          <CardBody className="space-y-3 pt-3">
            <Field label="Grille tarifaire">
              <Select value={simGroup} onChange={(event) => setSimGroup(event.target.value)}>
                <option value="">Sélectionner…</option>
                {simulatorGroups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Nombre total de boutons SOS" hint="Kit inclus : 1 bouton">
              <Input
                type="number"
                min={1}
                max={20}
                value={simSos}
                onChange={(event) => setSimSos(Number(event.target.value))}
              />
            </Field>

            {previewQuery.isLoading ? (
              <p className="text-xs text-slate-500">Calcul en cours…</p>
            ) : preview ? (
              <DescriptionList className="border-t border-slate-100 pt-2 dark:border-slate-800">
                <DataRow label="Boutons supplémentaires" value={formatNumber(preview.extraSosButtons)} />
                <DataRow label="Prix des boutons" value={formatMoney(preview.sosButtonsTotalUsd)} />
                <DataRow
                  label="Kit à payer"
                  value={
                    <span className="font-semibold text-brand-700 dark:text-brand-300">
                      {formatMoney(preview.totalKitUsd, preview.currency)}
                    </span>
                  }
                />
                <DataRow label="Abonnement / mois" value={formatMoney(preview.totalMonthlyUsd, preview.currency)} />
                {preview.totalKitCdf ? (
                  <DataRow label="Kit en CDF" value={formatMoney(preview.totalKitCdf, 'CDF')} />
                ) : null}
                {preview.totalMonthlyCdf ? (
                  <DataRow label="Abonnement en CDF" value={formatMoney(preview.totalMonthlyCdf, 'CDF')} />
                ) : null}
              </DescriptionList>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Sélectionnez une grille pour calculer le montant exact du kit et de l'abonnement.
              </p>
            )}
          </CardBody>
        </Card>

        {/* Grilles tarifaires */}
        <Card className="overflow-hidden xl:col-span-2">
          <CardHeader
            title="Grilles tarifaires"
            description="Packs commerciaux, boutons SOS et taux USD/CDF"
            icon={<Coins className="h-4 w-4" />}
            actions={
              canManage ? (
                <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={openCreate}>
                  Nouvelle grille
                </Button>
              ) : null
            }
          />
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3 dark:border-slate-800">
            <div className="relative min-w-[180px] flex-1">
              <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-slate-400" />
              <Input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Nom ou code de la grille..."
                className="pl-9"
              />
            </div>
            <Select
              className="w-auto"
              value={offerPack}
              onChange={(event) => {
                setOfferPack(event.target.value);
                setPage(1);
              }}
            >
              <option value="">Tous les packs</option>
              {PACKS.map((value) => (
                <option key={value} value={value}>
                  {describe(OFFER_PACK, value).label}
                </option>
              ))}
            </Select>
            <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                checked={includeArchived}
                onChange={(event) => {
                  setIncludeArchived(event.target.checked);
                  setPage(1);
                }}
              />
              Archives
            </label>
          </div>

          {tariffsQuery.isLoading ? (
            <TableSkeleton rows={6} columns={5} />
          ) : tariffsQuery.isError ? (
            <ErrorState onRetry={() => void tariffsQuery.refetch()} />
          ) : (tariffsQuery.data?.items.length ?? 0) === 0 ? (
            <EmptyState
              title="Aucune grille tarifaire"
              description="Définissez les frais de souscription, l'abonnement mensuel et le prix des boutons SOS."
              icon={<Coins className="h-5 w-5" />}
            />
          ) : (
            <>
              <TableWrap>
                <THead>
                  <TH>Grille</TH>
                  <TH>Pack</TH>
                  <TH className="text-right">Kit</TH>
                  <TH className="text-right">Abonnement</TH>
                  <TH className="text-right">Bouton SOS</TH>
                  <TH className="text-right">Taux CDF</TH>
                  <TH>État</TH>
                  {canManage ? <TH className="text-right">Actions</TH> : null}
                </THead>
                <TBody>
                  {tariffsQuery.data?.items.map((group) => (
                    <TR key={group.id}>
                      <TD>
                        <span className="block font-medium text-slate-800 dark:text-slate-100">{group.name}</span>
                        <span className="block font-mono text-[11px] text-slate-400">{group.code}</span>
                      </TD>
                      <TD className="text-xs">{describe(OFFER_PACK, group.offerPack).label}</TD>
                      <TD className="text-right tabular-nums">{formatMoney(Number(group.registrationFeeUsd))}</TD>
                      <TD className="text-right tabular-nums">{formatMoney(Number(group.monthlyFeeUsd))}</TD>
                      <TD className="text-right tabular-nums">
                        {formatMoney(Number(group.sosButtonUnitPriceUsd))}
                        <span className="ml-1 text-[11px] text-slate-400">
                          ({group.includedSosButtons} inclus, max {group.maxSosButtons})
                        </span>
                      </TD>
                      <TD className="text-right tabular-nums">
                        {group.exchangeRateUsdToCdf ? formatNumber(Number(group.exchangeRateUsdToCdf)) : '—'}
                      </TD>
                      <TD>
                        {group.archivedAt ? (
                          <Badge tone="neutral">Archivée</Badge>
                        ) : group.isActive ? (
                          <Badge tone="success" dot>
                            Active
                          </Badge>
                        ) : (
                          <Badge tone="warning">Inactive</Badge>
                        )}
                      </TD>
                      {canManage ? (
                        <TD className="text-right">
                          <span className="inline-flex gap-1">
                            <Button variant="ghost" size="icon" title="Modifier" onClick={() => openEdit(group)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Taux de change"
                              onClick={() => {
                                setRateTarget(group);
                                setRateValue(String(Number(group.exchangeRateUsdToCdf ?? 2800)));
                              }}
                            >
                              <RefreshCw className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setArchived.mutate({ id: group.id, archived: !group.archivedAt })}
                            >
                              {group.archivedAt ? 'Restaurer' : 'Archiver'}
                            </Button>
                          </span>
                        </TD>
                      ) : null}
                    </TR>
                  ))}
                </TBody>
              </TableWrap>
              {tariffsQuery.data ? <Pagination page={tariffsQuery.data} onPageChange={setPage} /> : null}
            </>
          )}
        </Card>
      </div>

      {/* Création / edition */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? `Modifier ${editing.name}` : 'Nouvelle grille tarifaire'}
        description="Le code est immuable et sert de reference comptable."
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setFormOpen(false);
                setEditing(null);
              }}
            >
              Annuler
            </Button>
            <Button
              loading={save.isPending}
              disabled={!form.name.trim() || (!editing && !form.code.trim())}
              onClick={() => save.mutate()}
            >
              Enregistrer
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nom commercial" required>
            <Input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="Premium Pack Small - Petits commerces"
            />
          </Field>
          <Field label="Code" hint="Non modifiable après création" required={!editing}>
            <Input
              value={form.code}
              disabled={Boolean(editing)}
              onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })}
              placeholder="PREMIUM_SMALL"
              className="font-mono"
            />
          </Field>
          <Field label="Pack commercial" required>
            <Select
              value={form.offerPack}
              onChange={(event) => setForm({ ...form, offerPack: event.target.value as OfferPack })}
            >
              {PACKS.map((value) => (
                <option key={value} value={value}>
                  {describe(OFFER_PACK, value).label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Frais de souscription (USD)" required>
            <Input
              type="number"
              step="0.01"
              min={0}
              value={form.registrationFeeUsd}
              onChange={(event) => setForm({ ...form, registrationFeeUsd: event.target.value })}
            />
          </Field>
          <Field label="Abonnement mensuel (USD)" required>
            <Input
              type="number"
              step="0.01"
              min={0}
              value={form.monthlyFeeUsd}
              onChange={(event) => setForm({ ...form, monthlyFeeUsd: event.target.value })}
            />
          </Field>
          <Field label="Prix unitaire du bouton SOS (USD)" required>
            <Input
              type="number"
              step="0.01"
              min={0}
              value={form.sosButtonUnitPriceUsd}
              onChange={(event) => setForm({ ...form, sosButtonUnitPriceUsd: event.target.value })}
            />
          </Field>
          <Field label="Boutons SOS inclus" required>
            <Input
              type="number"
              min={0}
              value={form.includedSosButtons}
              onChange={(event) => setForm({ ...form, includedSosButtons: event.target.value })}
            />
          </Field>
          <Field label="Boutons SOS maximum" required>
            <Input
              type="number"
              min={1}
              value={form.maxSosButtons}
              onChange={(event) => setForm({ ...form, maxSosButtons: event.target.value })}
            />
          </Field>
          <Field label="Taux USD → CDF" required>
            <Input
              type="number"
              step="0.0001"
              min={0}
              value={form.exchangeRateUsdToCdf}
              onChange={(event) => setForm({ ...form, exchangeRateUsdToCdf: event.target.value })}
            />
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <Textarea
              rows={3}
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              placeholder="Cible commerciale, services inclus, conditions particulieres..."
            />
          </Field>
        </div>
      </Modal>

      {/* Taux de change */}
      <Modal
        open={Boolean(rateTarget)}
        onClose={() => setRateTarget(null)}
        title="Taux de change USD → CDF"
        description={rateTarget?.name}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRateTarget(null)}>
              Annuler
            </Button>
            <Button loading={updateRate.isPending} disabled={!rateValue} onClick={() => updateRate.mutate()}>
              Mettre à jour
            </Button>
          </>
        }
      >
        <Field label="1 USD equivaut a (CDF)" required>
          <Input
            type="number"
            step="0.0001"
            min={0}
            value={rateValue}
            onChange={(event) => setRateValue(event.target.value)}
          />
        </Field>
      </Modal>
    </div>
  );
};
