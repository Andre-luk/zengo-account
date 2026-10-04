import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, Banknote, CalendarClock, KeyRound, Plus, Wallet } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, StatCard } from '@/components/ui/Card';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { EmptyState, ErrorState, InlineEmpty, Skeleton, TableSkeleton } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { TD, TH, THead, TR, TableWrap, TBody } from '@/components/ui/Table';
import { useClientSubscription, useClients, useSubscriptions, useSubscriptionStats } from '@/hooks/queries';
import { api } from '@/lib/api';
import { formatDate, formatNumber, formatRelative } from '@/lib/format';
import {
  PAYMENT_METHOD,
  SUBSCRIPTION_CODE_STATUS,
  SUBSCRIPTION_DURATION,
  SUBSCRIPTION_STATUS,
  describe,
} from '@/lib/labels';
import { useAuthStore } from '@/store/auth';
import { useUiStore } from '@/store/ui';
import type { ClientProfile, PaymentMethod, Subscription, SubscriptionDuration } from '@/types/api';

const CASHIER_ROLES = [
  'SUPER_ADMIN',
  'NATIONAL_DIRECTOR',
  'TECHNICAL_DIRECTOR',
  'PLATFORM_MANAGER',
  'DAF',
  'ACCOUNTANT',
  'REGION_MANAGER',
  'AGENCY_MANAGER',
  'OPERATOR',
  'SUPERVISOR',
] as const;

const DURATIONS: SubscriptionDuration[] = [30, 90, 180];
const METHODS: PaymentMethod[] = ['CASH_AGENCY', 'MPESA', 'AIRTEL_MONEY', 'ORANGE_MONEY', 'ILLICOCASH', 'BANK_TRANSFER'];

/**
 * Portefeuille d'abonnements.
 *
 * Le guichetier encaisse, la plateforme emet le code et le client le recoit par
 * SMS ; cette page sert aussi de journal de caisse (qui a encaisse quoi, par
 * quel moyen, en dollars ou en francs).
 */
export const SubscriptionsPage = () => {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((state) => state.pushToast);
  const hasRole = useAuthStore((state) => state.hasRole);
  const canCash = hasRole(...CASHIER_ROLES);

  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [expiringOnly, setExpiringOnly] = useState(false);
  const [issueOpen, setIssueOpen] = useState(false);
  const [activateOpen, setActivateOpen] = useState(false);

  const [clientId, setClientId] = useState('');
  const [duration, setDuration] = useState<SubscriptionDuration>(30);
  const [method, setMethod] = useState<PaymentMethod>('CASH_AGENCY');
  const [currency, setCurrency] = useState<'USD' | 'CDF'>('USD');
  const [operatorReference, setOperatorReference] = useState('');
  const [note, setNote] = useState('');
  const [codeDraft, setCodeDraft] = useState('');

  const statsQuery = useSubscriptionStats(30);
  const listQuery = useSubscriptions({
    page,
    limit: 15,
    status: statusFilter || undefined,
    expiringSoon: expiringOnly || undefined,
  });
  const clientsQuery = useClients({ limit: 100, status: 'ACTIVE' });

  const totalPages = useMemo(() => {
    const total = listQuery.data?.total ?? 0;
    return Math.max(1, Math.ceil(total / 15));
  }, [listQuery.data]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
    void queryClient.invalidateQueries({ queryKey: ['clients'] });
  };

  const issue = useMutation({
    mutationFn: () =>
      api.post<{ subscription: Subscription; smsSent: boolean }>('/subscriptions', {
        clientId,
        durationDays: duration,
        method,
        currency,
        operatorReference: operatorReference || undefined,
        note: note || undefined,
      }),
    onSuccess: (result) => {
      pushToast({
        tone: 'success',
        title: `Abonnement ${result.subscription.code}`,
        description: result.smsSent
          ? 'Le client a reçu son code par SMS.'
          : 'Code émis, mais le SMS n’a pas pu être envoyé.',
      });
      setIssueOpen(false);
      setClientId('');
      setOperatorReference('');
      setNote('');
      invalidate();
    },
    onError: (error: Error) =>
      pushToast({ tone: 'danger', title: 'Encaissement refusé', description: error.message }),
  });

  const activate = useMutation({
    mutationFn: () => api.post<{ subscription: Subscription; alreadyActive: boolean }>('/subscriptions/activate', { code: codeDraft }),
    onSuccess: (result) => {
      pushToast({
        tone: 'success',
        title: result.alreadyActive ? 'Code déjà activé' : 'Code activé',
        description: `Validité : ${result.subscription.validity}.`,
      });
      setActivateOpen(false);
      setCodeDraft('');
      invalidate();
    },
    onError: (error: Error) =>
      pushToast({ tone: 'danger', title: 'Activation refusée', description: error.message }),
  });

  const stats = statsQuery.data;
  const items = listQuery.data?.items ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Abonnements</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Encaissement des abonnements, codes clients et suivi des échéances
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            icon={<KeyRound className="h-4 w-4" />}
            onClick={() => setActivateOpen(true)}
          >
            Activer un code
          </Button>
          {canCash ? (
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => setIssueOpen(true)}>
              Encaisser un abonnement
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Encaissé"
          value={stats ? `${formatNumber(stats.revenueUsd)} $` : '—'}
          hint={`${stats?.payments ?? 0} paiement(s) sur ${stats?.windowDays ?? 30} jours`}
          icon={<Wallet className="h-4 w-4" />}
          tone="brand"
        />
        <StatCard
          label="En francs congolais"
          value={stats ? `${formatNumber(stats.revenueCdf)} FC` : '—'}
          hint="Encaissements réglés en CDF"
          icon={<Banknote className="h-4 w-4" />}
          tone="info"
        />
        <StatCard
          label="Clients actifs"
          value={stats ? formatNumber(stats.activeClients) : '—'}
          hint={`${stats?.newSubscriptions ?? 0} abonnement(s) émis`}
          icon={<BadgeCheck className="h-4 w-4" />}
          tone="success"
        />
        <StatCard
          label="Échéances proches"
          value={stats ? formatNumber(stats.expiringSoon) : '—'}
          hint={`${stats?.expired ?? 0} client(s) déjà expiré(s)`}
          icon={<CalendarClock className="h-4 w-4" />}
          tone="warning"
        />
      </div>

      {stats?.pendingPayments ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-100">
          {stats.pendingPayments} paiement(s) annoncés mais non confirmés : vérifiez les accusés des opérateurs
          Mobile Money.
        </p>
      ) : null}

      <Card>
        <CardHeader
          title="Codes d'abonnement"
          description="Chaque encaissement produit un code ZG-XXXX-XXXX transmis au client par SMS en 30, 90 ou 180 jours."
          icon={<KeyRound className="h-4 w-4" />}
          actions={
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Statut">
                <Select
                  value={statusFilter}
                  onChange={(event) => {
                    setStatusFilter(event.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">Tous les statuts</option>
                  <option value="ISSUED">Émis</option>
                  <option value="ACTIVATED">Activés</option>
                  <option value="EXPIRED">Périmés</option>
                  <option value="CANCELLED">Annulés</option>
                </Select>
              </Field>
              <label className="flex items-center gap-2 pb-1.5 text-xs text-slate-600 dark:text-slate-300">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300"
                  checked={expiringOnly}
                  onChange={(event) => {
                    setExpiringOnly(event.target.checked);
                    setPage(1);
                  }}
                />
                Échéance sous 7 jours
              </label>
            </div>
          }
        />

        {listQuery.isLoading ? (
          <TableSkeleton rows={6} />
        ) : listQuery.isError ? (
          <ErrorState onRetry={() => void listQuery.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState
            title="Aucun abonnement"
            description="Aucun code ne correspond à ces filtres."
            icon={<KeyRound className="h-5 w-5" />}
          />
        ) : (
          <>
            <TableWrap>
              <THead>
                <TR>
                  <TH>Code</TH>
                  <TH>Client</TH>
                  <TH>Période</TH>
                  <TH>Montant</TH>
                  <TH>Statut</TH>
                  <TH>Encaissé par</TH>
                </TR>
              </THead>
              <TBody>
                {items.map((item) => (
                  <TR key={item.id}>
                    <TD>
                      <span className="font-mono text-xs font-medium text-slate-800 dark:text-slate-100">
                        {item.code}
                      </span>
                      <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                        {describe(SUBSCRIPTION_DURATION, String(item.durationDays)).label} · émis{' '}
                        {formatRelative(item.issuedAt)}
                      </p>
                    </TD>
                    <TD>
                      <span className="text-sm text-slate-700 dark:text-slate-200">
                        {item.client?.fullName ?? '—'}
                      </span>
                      <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                        {item.client?.zengoId ?? '—'}
                      </p>
                    </TD>
                    <TD>
                      <span className="text-xs text-slate-600 dark:text-slate-300">
                        {formatDate(item.startsAt)} → {formatDate(item.endsAt)}
                      </span>
                      <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{item.validity}</p>
                    </TD>
                    <TD>
                      <span className="text-sm text-slate-700 dark:text-slate-200">{item.priceUsd} $</span>
                      {Number(item.discountUsd) > 0 ? (
                        <p className="mt-0.5 text-[11px] text-emerald-600 dark:text-emerald-400">
                          −{item.discountUsd} $ de remise
                        </p>
                      ) : null}
                    </TD>
                    <TD>
                      <Badge tone={describe(SUBSCRIPTION_CODE_STATUS, item.status).tone}>
                        {describe(SUBSCRIPTION_CODE_STATUS, item.status).label}
                      </Badge>
                      {item.activatedAt ? (
                        <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                          activé {formatRelative(item.activatedAt)}
                        </p>
                      ) : null}
                    </TD>
                    <TD>
                      <span className="text-xs text-slate-600 dark:text-slate-300">
                        {item.issuedByLabel ?? '—'}
                      </span>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </TableWrap>

            <div className="flex items-center justify-between px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
              <span>
                {items.length} sur {listQuery.data?.total ?? 0} code(s)
              </span>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
                  Précédent
                </Button>
                <span>
                  {page} / {totalPages}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((value) => value + 1)}
                >
                  Suivant
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>

      {/* Encaissement */}
      <Modal
        open={issueOpen}
        onClose={() => setIssueOpen(false)}
        title="Encaisser un abonnement"
        description="Le paiement est journalisé, un code unique est émis, la validité du client est étendue et le code lui est envoyé par SMS."
        footer={
          <>
            <Button variant="ghost" onClick={() => setIssueOpen(false)}>
              Annuler
            </Button>
            <Button
              icon={<Wallet className="h-4 w-4" />}
              loading={issue.isPending}
              disabled={!clientId}
              onClick={() => issue.mutate()}
            >
              Encaisser et envoyer le code
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Client" required>
            <Select value={clientId} onChange={(event) => setClientId(event.target.value)}>
              <option value="">Sélectionner un client…</option>
              {(clientsQuery.data?.items ?? []).map((client: ClientProfile) => (
                <option key={client.id} value={client.id}>
                  {client.zengoId} · {client.fullName} · {client.primaryPhone}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Durée" hint="Une remise s’applique sur 90 et 180 jours.">
              <Select value={String(duration)} onChange={(event) => setDuration(Number(event.target.value) as SubscriptionDuration)}>
                {DURATIONS.map((value) => (
                  <option key={value} value={value}>
                    {value} jours
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Moyen de paiement">
              <Select value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod)}>
                {METHODS.map((value) => (
                  <option key={value} value={value}>
                    {describe(PAYMENT_METHOD, value).label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Devise encaissée">
              <Select value={currency} onChange={(event) => setCurrency(event.target.value as 'USD' | 'CDF')}>
                <option value="USD">Dollars (USD)</option>
                <option value="CDF">Francs congolais (CDF)</option>
              </Select>
            </Field>
            <Field label="Référence opérateur" hint="Numéro de transaction Mobile Money, si applicable.">
              <Input
                value={operatorReference}
                onChange={(event) => setOperatorReference(event.target.value)}
                placeholder="MP240…"
              />
            </Field>
          </div>

          <Field label="Note de caisse">
            <Textarea
              rows={2}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Règlement partiel complété par virement…"
            />
          </Field>

          {clientId ? <ClientSubscriptionHint clientId={clientId} /> : null}
        </div>
      </Modal>

      {/* Activation */}
      <Modal
        open={activateOpen}
        onClose={() => setActivateOpen(false)}
        title="Activer un code d’abonnement"
        description="Le client a reçu son code par SMS. L’activation ajoute la durée du code à sa période en cours : aucun jour restant n’est perdu."
        footer={
          <>
            <Button variant="ghost" onClick={() => setActivateOpen(false)}>
              Annuler
            </Button>
            <Button
              icon={<KeyRound className="h-4 w-4" />}
              loading={activate.isPending}
              disabled={codeDraft.trim().length < 8}
              onClick={() => activate.mutate()}
            >
              Activer le code
            </Button>
          </>
        }
      >
        <Field label="Code reçu par SMS" required hint="Format ZG-XXXX-XXXX — les tirets et les minuscules sont acceptés.">
          <Input
            className="font-mono uppercase"
            value={codeDraft}
            onChange={(event) => setCodeDraft(event.target.value)}
            placeholder="ZG-K4PM-7RTQ"
          />
        </Field>
      </Modal>
    </div>
  );
};

/** Rappel de l'état d'abonnement du client sélectionné, avant encaissement. */
const ClientSubscriptionHint = ({ clientId }: { clientId: string }) => {
  const { data, isLoading } = useClientSubscription(clientId);

  if (isLoading) return <Skeleton className="h-10 w-full" />;
  if (!data) return <InlineEmpty>État d’abonnement indisponible.</InlineEmpty>;

  return (
    <div className="rounded-xl border border-slate-200 p-3 text-xs dark:border-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-slate-600 dark:text-slate-300">
          État actuel : {data.validity}
          {data.expiresAt ? ` · échéance ${formatDate(data.expiresAt)}` : ''}
        </span>
        <Badge tone={describe(SUBSCRIPTION_STATUS, data.effectiveStatus).tone}>
          {describe(SUBSCRIPTION_STATUS, data.effectiveStatus).label}
        </Badge>
      </div>
      {data.history.length > 0 ? (
        <p className="mt-1 text-slate-500 dark:text-slate-400">
          Dernier code : <span className="font-mono">{data.history[0].code}</span> (
          {describe(SUBSCRIPTION_CODE_STATUS, data.history[0].status).label})
        </p>
      ) : (
        <p className="mt-1 text-slate-500 dark:text-slate-400">
          Premier abonnement : les frais d’installation sont ajoutés automatiquement.
        </p>
      )}
    </div>
  );
};
