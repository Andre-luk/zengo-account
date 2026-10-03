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
import type { ClientProfile, Currency, Language, OfferPack, PriceBreakdown } from '@/types/api';

interface CreateClientResponse {
  client: ClientProfile;
  pricing: PriceBreakdown;
  temporaryPassword?: string;
}

const PACKS: OfferPack[] = ['STANDARD', 'PREMIUM_SMALL', 'PREMIUM_INSTITUTION', 'CUSTOM'];

const emptyForm = {
  fullName: '',
  companyName: '',
  primaryPhone: '',
  secondaryPhone: '',
  emergencyContactName: '',
  emergencyContactPhone: '',
  preferredLanguage: 'fr' as Language,
  address: '',
  city: '',
  country: 'CD',
  organizationId: '',
  offerPack: '' as OfferPack | '',
  tariffGroupId: '',
  currency: 'USD' as Currency,
  sosButtonCount: 1,
  createUserAccount: true,
  loginEmail: '',
  deviceSerialNumber: '',
  notes: '',
};

export const ClientFormModal = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((state) => state.pushToast);
  const [form, setForm] = useState(emptyForm);
  const [result, setResult] = useState<CreateClientResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const agenciesQuery = useOrganizations({ limit: 100, type: 'AGENCY' });
  const regionsQuery = useOrganizations({ limit: 100, type: 'REGION' });
  const tariffsQuery = useTariffGroups({ limit: 100 });

  const agencies = useMemo(
    () => [...(agenciesQuery.data?.items ?? []), ...(regionsQuery.data?.items ?? [])],
    [agenciesQuery.data, regionsQuery.data],
  );

  const selectedTariff = useMemo(
    () => tariffsQuery.data?.items.find((item) => item.id === form.tariffGroupId) ?? null,
    [tariffsQuery.data, form.tariffGroupId],
  );

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

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
      return api.post<CreateClientResponse>('/clients', payload);
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
    onError: (error: Error) => pushToast({ tone: 'danger', title: 'Création impossible', description: error.message }),
  });

  const close = () => {
    if (result) {
      setForm(emptyForm);
      setResult(null);
      setCopied(false);
    }
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={result ? 'Compte client créé' : 'Nouveau compte client'}
      description={
        result
          ? 'Conservez les identifiants ci-dessous : ils ne seront plus affiches.'
          : "Le rattachement à une agence détermine les stations d'intervention disponibles."
      }
      size="lg"
      footer={
        result ? (
          <>
            <Button variant="ghost" onClick={close}>
              Fermer
            </Button>
            <Button variant="secondary" onClick={() => setResult(null)}>
              Créer un autre compte
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={close}>
              Annuler
            </Button>
            <Button
              icon={<UserPlus className="h-4 w-4" />}
              loading={create.isPending}
              disabled={!form.fullName.trim() || !form.primaryPhone.trim() || !form.organizationId}
              onClick={() => create.mutate()}
            >
              Créer le compte
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-500/30 dark:bg-emerald-500/10">
            <p className="flex items-center gap-2 text-sm font-semibold text-emerald-800 dark:text-emerald-200">
              <Check className="h-4 w-4" />
              {result.client.fullName}
            </p>
            <p className="mt-1 font-mono text-lg font-semibold text-emerald-900 dark:text-emerald-100">
              {result.client.zengoId}
            </p>
          </div>

          {result.temporaryPassword ? (
            <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
              <p className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase dark:text-slate-400">
                <KeyRound className="h-3.5 w-3.5" />
                Mot de passe temporaire
              </p>
              <div className="mt-2 flex items-center justify-between gap-3">
                <code className="font-mono text-base font-semibold text-slate-900 dark:text-white">
                  {result.temporaryPassword}
                </code>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Copy className="h-3.5 w-3.5" />}
                  onClick={async () => {
                    await navigator.clipboard.writeText(result.temporaryPassword ?? '');
                    setCopied(true);
                  }}
                >
                  {copied ? 'Copie' : 'Copier'}
                </Button>
              </div>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Le client devra changer ce mot de passe à sa première connexion sur l'application mobile.
              </p>
            </div>
          ) : null}

          <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
            <p className="text-xs font-semibold text-slate-500 uppercase dark:text-slate-400">Facturation du kit</p>
            <dl className="mt-2 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500 dark:text-slate-400">
                  Kit + {result.pricing.extraSosButtons} bouton(s) SOS supplementaire(s)
                </dt>
                <dd className="font-medium text-slate-900 dark:text-white">
                  {formatMoney(result.pricing.totalKitUsd, result.pricing.currency)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500 dark:text-slate-400">Abonnement mensuel</dt>
                <dd className="font-medium text-slate-900 dark:text-white">
                  {formatMoney(result.pricing.totalMonthlyUsd, result.pricing.currency)}
                </dd>
              </div>
              {result.pricing.currency === 'CDF' && result.pricing.totalKitCdf ? (
                <div className="flex justify-between border-t border-slate-100 pt-1.5 dark:border-slate-800">
                  <dt className="text-slate-500 dark:text-slate-400">
                    Équivalent CDF (taux {result.pricing.exchangeRateUsdToCdf})
                  </dt>
                  <dd className="font-medium text-slate-900 dark:text-white">
                    {formatMoney(result.pricing.totalKitCdf, 'CDF')}
                  </dd>
                </div>
              ) : null}
            </dl>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <section className="space-y-4">
            <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
              Identité du client
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nom complet" required>
                <Input value={form.fullName} onChange={(event) => set('fullName', event.target.value)} placeholder="Jean Kabila" />
              </Field>
              <Field label="Raison sociale" hint="Institutions et comptes sur mesure">
                <Input
                  value={form.companyName}
                  onChange={(event) => set('companyName', event.target.value)}
                  placeholder="Etablissement scolaire Les Elites"
                />
              </Field>
              <Field label="Téléphone principal" required>
                <Input
                  value={form.primaryPhone}
                  onChange={(event) => set('primaryPhone', event.target.value)}
                  placeholder="+243970255599"
                />
              </Field>
              <Field label="Téléphone secondaire">
                <Input value={form.secondaryPhone} onChange={(event) => set('secondaryPhone', event.target.value)} />
              </Field>
            </div>
          </section>

          <section className="space-y-4 border-t border-slate-100 pt-4 dark:border-slate-800">
            <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
              Localisation & contacts d'urgence
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Adresse">
                <Input value={form.address} onChange={(event) => set('address', event.target.value)} placeholder="12, av. de la Justice" />
              </Field>
              <Field label="Ville">
                <Input value={form.city} onChange={(event) => set('city', event.target.value)} placeholder="Kinshasa" />
              </Field>
              <Field label="Contact d'urgence">
                <Input
                  value={form.emergencyContactName}
                  onChange={(event) => set('emergencyContactName', event.target.value)}
                  placeholder="Marie Kabila (epouse)"
                />
              </Field>
              <Field label="Téléphone d'urgence">
                <Input
                  value={form.emergencyContactPhone}
                  onChange={(event) => set('emergencyContactPhone', event.target.value)}
                />
              </Field>
              <Field label="Langue du client" hint="Utilisée par les appels vocaux IA">
                <Select
                  value={form.preferredLanguage}
                  onChange={(event) => set('preferredLanguage', event.target.value as Language)}
                >
                  {Object.entries(LANGUAGE).map(([code, label]) => (
                    <option key={code} value={code}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </section>

          <section className="space-y-4 border-t border-slate-100 pt-4 dark:border-slate-800">
            <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
              Offre & rattachement
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Agence / PDC de rattachement" required>
                <Select value={form.organizationId} onChange={(event) => set('organizationId', event.target.value)}>
                  <option value="">Sélectionner…</option>
                  {agencies.map((organization) => (
                    <option key={organization.id} value={organization.id}>
                      {organization.name} ({organization.code})
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Pack commercial" hint="pré-rempli par le groupe tarifaire">
                <Select value={form.offerPack} onChange={(event) => set('offerPack', event.target.value as OfferPack | '')}>
                  <option value="">Automatique</option>
                  {PACKS.map((pack) => (
                    <option key={pack} value={pack}>
                      {describe(OFFER_PACK, pack).label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Groupe tarifaire">
                <Select value={form.tariffGroupId} onChange={(event) => set('tariffGroupId', event.target.value)}>
                  <option value="">Aucun (tarif par défaut)</option>
                  {tariffsQuery.data?.items.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Devise de facturation">
                <Select value={form.currency} onChange={(event) => set('currency', event.target.value as Currency)}>
                  <option value="USD">Dollar americain (USD)</option>
                  <option value="CDF">Franc congolais (CDF)</option>
                </Select>
              </Field>
              <Field label="Boutons SOS factures" hint="1 bouton inclus dans le kit">
                <Input
                  type="number"
                  min={1}
                  max={selectedTariff?.maxSosButtons ?? 10}
                  value={form.sosButtonCount}
                  onChange={(event) => set('sosButtonCount', Number(event.target.value))}
                />
              </Field>
              <Field label="Numéro de série du kit" hint="Si le dispositif est déjà provisionné">
                <Input
                  value={form.deviceSerialNumber}
                  onChange={(event) => set('deviceSerialNumber', event.target.value)}
                  placeholder="3003004fba2394"
                  className="font-mono"
                />
              </Field>
            </div>

            {selectedTariff ? (
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
                Kit {formatMoney(Number(selectedTariff.registrationFeeUsd))} +{' '}
                {formatMoney(Number(selectedTariff.sosButtonUnitPriceUsd))} par bouton SOS supplementaire · abonnement{' '}
                {formatMoney(Number(selectedTariff.monthlyFeeUsd))}/mois.
              </p>
            ) : null}
          </section>

          <section className="space-y-4 border-t border-slate-100 pt-4 dark:border-slate-800">
            <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
              Accès application mobile
            </h3>
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                checked={form.createUserAccount}
                onChange={(event) => set('createUserAccount', event.target.checked)}
              />
              Créer le compte de connexion du client
            </label>
            {form.createUserAccount ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Email de connexion" hint="Sinon le téléphone est utilisé">
                  <Input
                    type="email"
                    value={form.loginEmail}
                    onChange={(event) => set('loginEmail', event.target.value)}
                    placeholder="client@exemple.cd"
                  />
                </Field>
              </div>
            ) : null}
            <Field label="Notes internes">
              <Textarea
                rows={3}
                value={form.notes}
                onChange={(event) => set('notes', event.target.value)}
                placeholder="Particularités du site, consignes d'accès, historique commercial..."
              />
            </Field>
          </section>
        </div>
      )}
    </Modal>
  );
};
