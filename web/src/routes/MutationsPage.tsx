import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRightLeft, CheckCheck, ClipboardCheck, Plus, RotateCcw, ShieldQuestion, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, DataRow, DescriptionList, StatCard } from '@/components/ui/Card';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { EmptyState, ErrorState, Skeleton, TableSkeleton } from '@/components/ui/Feedback';
import { Drawer, Modal } from '@/components/ui/Modal';
import { TBody, TD, TH, THead, TR, TableWrap } from '@/components/ui/Table';
import { useClients, useMutationDetail, useMutationStats, useMutations, useOrganizations } from '@/hooks/queries';
import { api } from '@/lib/api';
import { formatDateTime, formatNumber, formatRelative } from '@/lib/format';
import { INTEGRATION_OUTCOME, MUTATION_REASON, MUTATION_STATUS, describe } from '@/lib/labels';
import { useAuthStore } from '@/store/auth';
import { useUiStore } from '@/store/ui';
import type { ClientMutation, ClientProfile, IntegrationOutcome, MutationReason } from '@/types/api';

/** Profils habilites a la seconde validation. */
const REVIEW_ROLES = ['QUALITY_DIRECTOR', 'NATIONAL_DIRECTOR', 'TECHNICAL_DIRECTOR', 'SUPER_ADMIN'] as const;
/** Profils habilites a appliquer le transfert ou a revenir en arriere. */
const APPLY_ROLES = [
  'SUPER_ADMIN',
  'NATIONAL_DIRECTOR',
  'TECHNICAL_DIRECTOR',
  'PLATFORM_MANAGER',
  'QUALITY_DIRECTOR',
  'REGION_MANAGER',
  'AGENCY_MANAGER',
] as const;

const REASONS: MutationReason[] = [
  'CLIENT_MOVED',
  'CLIENT_REQUEST',
  'ASSIGNMENT_ERROR',
  'COVERAGE_OPTIMISATION',
  'COMMERCIAL_DISPUTE',
  'OTHER',
];

/**
 * Mutations géographiques des dossiers clients.
 *
 * L'écran porte le parcours complet du cahier des charges : une agence demande
 * le transfert, le contrôle qualité valide ou refuse (double validation), le
 * transfert est appliqué, puis les rapports d'intégration à 7 et 30 jours sont
 * saisis. Chaque étape affiche qui l'a posée et quand.
 */
export const MutationsPage = () => {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((state) => state.pushToast);
  const hasRole = useAuthStore((state) => state.hasRole);
  const canReview = hasRole(...REVIEW_ROLES);
  const canApply = hasRole(...APPLY_ROLES);

  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [openOnly, setOpenOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [requestOpen, setRequestOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [clientId, setClientId] = useState('');
  const [toOrganizationId, setToOrganizationId] = useState('');
  const [reason, setReason] = useState<MutationReason>('CLIENT_MOVED');
  const [note, setNote] = useState('');

  const statsQuery = useMutationStats(90);
  const listQuery = useMutations({
    page,
    limit: 15,
    status: statusFilter || undefined,
    openOnly: openOnly || undefined,
    search: search || undefined,
  });
  const clientsQuery = useClients({ limit: 100, status: 'ACTIVE' });
  const agenciesQuery = useOrganizations({ type: 'AGENCY', limit: 100 });

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil((listQuery.data?.total ?? 0) / 15)),
    [listQuery.data],
  );

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['mutations'] });
    void queryClient.invalidateQueries({ queryKey: ['clients'] });
    void queryClient.invalidateQueries({ queryKey: ['organizations'] });
  };

  const request = useMutation({
    mutationFn: () =>
      api.post<ClientMutation>('/client-mutations', {
        clientId,
        toOrganizationId,
        reason,
        note: note || undefined,
      }),
    onSuccess: (created) => {
      pushToast({
        tone: 'success',
        title: `Demande ${created.reference}`,
        description: 'La demande part au contrôle qualité pour la seconde validation.',
      });
      setRequestOpen(false);
      setClientId('');
      setToOrganizationId('');
      setNote('');
      invalidate();
    },
    onError: (error: Error) =>
      pushToast({ tone: 'danger', title: 'Demande refusée', description: error.message }),
  });

  const stats = statsQuery.data;
  const items = listQuery.data?.items ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Mutations géographiques</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Transfert d&apos;un dossier vers une autre agence : double validation, redirection des alertes et suivi de
            l&apos;intégration
          </p>
        </div>
        <Button icon={<Plus className="h-4 w-4" />} onClick={() => setRequestOpen(true)}>
          Demander une mutation
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Demandes"
          value={stats ? formatNumber(stats.total) : '—'}
          hint={`sur ${stats?.windowDays ?? 90} jours`}
          icon={<ArrowRightLeft className="h-4 w-4" />}
          tone="brand"
        />
        <StatCard
          label="Transférées"
          value={stats ? formatNumber(stats.applied) : '—'}
          hint={`${stats?.reverted ?? 0} retour(s) à l&apos;agence d&apos;origine`}
          icon={<CheckCheck className="h-4 w-4" />}
          tone="success"
        />
        <StatCard
          label="Délai moyen d&apos;instruction"
          value={stats?.averageProcessingHours === null || stats?.averageProcessingHours === undefined ? '—' : `${stats.averageProcessingHours} h`}
          hint="De la demande à l&apos;application du transfert"
          icon={<ShieldQuestion className="h-4 w-4" />}
          tone="info"
        />
        <StatCard
          label="Rapports d&apos;intégration"
          value={stats ? formatNumber(stats.integrationPending) : '—'}
          hint={`${stats?.integrationLate ?? 0} en retard`}
          icon={<ClipboardCheck className="h-4 w-4" />}
          tone={stats && stats.integrationLate > 0 ? 'warning' : 'neutral'}
        />
      </div>

      <Card>
        <CardHeader
          title="Journal des mutations"
          description="Demandes en cours d&apos;abord, puis historique des transferts et des retours."
          icon={<ArrowRightLeft className="h-4 w-4" />}
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
                  {Object.entries(MUTATION_STATUS).map(([value, entry]) => (
                    <option key={value} value={value}>
                      {entry.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Recherche">
                <Input
                  value={search}
                  placeholder="MU-… ou nom du client"
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(1);
                  }}
                />
              </Field>
              <label className="flex items-center gap-2 pb-1.5 text-xs text-slate-600 dark:text-slate-300">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300"
                  checked={openOnly}
                  onChange={(event) => {
                    setOpenOnly(event.target.checked);
                    setPage(1);
                  }}
                />
                En cours d&apos;instruction
              </label>
            </div>
          }
        />

        {listQuery.isLoading ? (
          <TableSkeleton rows={6} columns={6} />
        ) : listQuery.isError ? (
          <ErrorState onRetry={() => void listQuery.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState
            title="Aucune mutation"
            description="Aucun transfert ne correspond à ces filtres."
            icon={<ArrowRightLeft className="h-5 w-5" />}
          />
        ) : (
          <>
            <TableWrap>
              <THead>
                <TR>
                  <TH>Demande</TH>
                  <TH>Client</TH>
                  <TH>Trajet</TH>
                  <TH>Motif</TH>
                  <TH>Statut</TH>
                  <TH>Suivi</TH>
                </TR>
              </THead>
              <TBody>
                {items.map((mutation) => (
                  <TR key={mutation.id} className="cursor-pointer" onClick={() => setSelectedId(mutation.id)}>
                    <TD>
                      <span className="font-mono text-xs font-medium text-slate-800 dark:text-slate-100">
                        {mutation.reference}
                      </span>
                      <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                        {mutation.requestedByLabel ?? '—'} · {formatRelative(mutation.requestedAt)}
                      </p>
                    </TD>
                    <TD>
                      <span className="text-sm text-slate-700 dark:text-slate-200">
                        {mutation.client?.fullName ?? '—'}
                      </span>
                      <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                        {mutation.client?.zengoId ?? '—'}
                      </p>
                    </TD>
                    <TD>
                      <span className="text-xs text-slate-600 dark:text-slate-300">
                        {mutation.from.name}
                        {mutation.from.city ? ` (${mutation.from.city})` : ''} → {mutation.to.name}
                        {mutation.to.city ? ` (${mutation.to.city})` : ''}
                      </span>
                      {mutation.regionChanged ? (
                        <p className="mt-0.5 text-[11px] text-amber-600 dark:text-amber-400">
                          changement de région · {mutation.alertsRedirected} alerte(s) redirigée(s)
                        </p>
                      ) : null}
                    </TD>
                    <TD>
                      <span className="text-xs text-slate-600 dark:text-slate-300">
                        {describe(MUTATION_REASON, mutation.reason).label}
                      </span>
                    </TD>
                    <TD>
                      <Badge tone={describe(MUTATION_STATUS, mutation.status).tone}>
                        {describe(MUTATION_STATUS, mutation.status).label}
                      </Badge>
                    </TD>
                    <TD>
                      {mutation.integration.map((entry) => (
                        <p key={entry.horizon} className="text-[11px] text-slate-500 dark:text-slate-400">
                          J+{entry.horizon} :{' '}
                          {entry.reportedAt
                            ? describe(INTEGRATION_OUTCOME, entry.outcome).label
                            : entry.late
                              ? 'en retard'
                              : 'attendu'}
                        </p>
                      ))}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </TableWrap>

            <div className="flex items-center justify-between px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
              <span>
                {items.length} sur {listQuery.data?.total ?? 0} demande(s)
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

      {/* Demande de mutation */}
      <Modal
        open={requestOpen}
        onClose={() => setRequestOpen(false)}
        title="Demander une mutation"
        description="Le dossier part au contrôle qualité, qui valide ou refuse. Le transfert n'est effectif qu'après cette seconde validation."
        footer={
          <>
            <Button variant="ghost" onClick={() => setRequestOpen(false)}>
              Annuler
            </Button>
            <Button
              icon={<ArrowRightLeft className="h-4 w-4" />}
              loading={request.isPending}
              disabled={!clientId || !toOrganizationId}
              onClick={() => request.mutate()}
            >
              Envoyer la demande
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Dossier client" required>
            <Select value={clientId} onChange={(event) => setClientId(event.target.value)}>
              <option value="">Sélectionner un client…</option>
              {(clientsQuery.data?.items ?? []).map((client: ClientProfile) => (
                <option key={client.id} value={client.id}>
                  {client.zengoId} · {client.fullName} · {client.city ?? '—'}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Agence de destination" required hint="Le dossier sera repris par cette agence et sa région.">
            <Select value={toOrganizationId} onChange={(event) => setToOrganizationId(event.target.value)}>
              <option value="">Sélectionner une agence…</option>
              {(agenciesQuery.data?.items ?? []).map((agency) => (
                <option key={agency.id} value={agency.id}>
                  {agency.name}
                  {agency.city ? ` — ${agency.city}` : ''}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Motif">
            <Select value={reason} onChange={(event) => setReason(event.target.value as MutationReason)}>
              {REASONS.map((value) => (
                <option key={value} value={value}>
                  {describe(MUTATION_REASON, value).label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Précisions pour le contrôle qualité">
            <Textarea
              rows={3}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Nouvelle adresse, date du déménagement, contacts déjà prévenus…"
            />
          </Field>
        </div>
      </Modal>

      <MutationDrawer
        mutationId={selectedId}
        canReview={canReview}
        canApply={canApply}
        onClose={() => setSelectedId(null)}
        onChanged={invalidate}
      />
    </div>
  );
};

/** Panneau de détail : double validation, transfert, suivi et actions. */
const MutationDrawer = ({
  mutationId,
  canReview,
  canApply,
  onClose,
  onChanged,
}: {
  mutationId: string | null;
  canReview: boolean;
  canApply: boolean;
  onClose: () => void;
  onChanged: () => void;
}) => {
  const pushToast = useUiStore((state) => state.pushToast);
  const detailQuery = useMutationDetail(mutationId ?? undefined);
  const [comment, setComment] = useState('');
  const [revertReason, setRevertReason] = useState('');
  const [revertOpen, setRevertOpen] = useState(false);
  const [integrationHorizon, setIntegrationHorizon] = useState('7');
  const [integrationOutcome, setIntegrationOutcome] = useState<IntegrationOutcome>('SATISFACTORY');
  const [integrationNote, setIntegrationNote] = useState('');

  const mutation = detailQuery.data;

  const act = useMutation({
    mutationFn: async (action: { path: string; body?: unknown }) =>
      api.patch(`/client-mutations/${mutationId}${action.path}`, action.body ?? {}),
    onSuccess: () => {
      pushToast({ tone: 'success', title: 'Mise à jour enregistrée' });
      setComment('');
      setRevertOpen(false);
      onChanged();
      void detailQuery.refetch();
    },
    onError: (error: Error) =>
      pushToast({ tone: 'danger', title: 'Action refusée', description: error.message }),
  });

  const report = useMutation({
    mutationFn: async () =>
      api.post(`/client-mutations/${mutationId}/integration-report`, {
        horizon: Number(integrationHorizon),
        outcome: integrationOutcome,
        note: integrationNote || undefined,
      }),
    onSuccess: () => {
      pushToast({ tone: 'success', title: "Rapport d'intégration enregistré" });
      setIntegrationNote('');
      onChanged();
      void detailQuery.refetch();
    },
    onError: (error: Error) =>
      pushToast({ tone: 'danger', title: 'Rapport refusé', description: error.message }),
  });

  return (
    <>
      <Drawer open={Boolean(mutationId)} onClose={onClose} width="lg">
        {detailQuery.isLoading || !mutation ? (
          <div className="p-5">
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <div className="flex h-full flex-col">
            <header className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-sm text-slate-500 dark:text-slate-400">{mutation.reference}</p>
                  <h2 className="mt-0.5 text-lg font-semibold text-slate-900 dark:text-white">
                    {mutation.client?.fullName ?? 'Dossier client'}
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {mutation.from.name} → {mutation.to.name} · {describe(MUTATION_REASON, mutation.reason).label}
                  </p>
                </div>
                <Badge tone={describe(MUTATION_STATUS, mutation.status).tone}>
                  {describe(MUTATION_STATUS, mutation.status).label}
                </Badge>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {canReview && mutation.canBeReviewed ? (
                  <>
                    <Button
                      size="sm"
                      icon={<CheckCheck className="h-4 w-4" />}
                      loading={act.isPending}
                      onClick={() =>
                        act.mutate({
                          path: '/review',
                          body: { approve: true, comment: comment || 'Dossier conforme.' },
                        })
                      }
                    >
                      Valider le transfert
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<XCircle className="h-4 w-4" />}
                      disabled={comment.trim().length < 3}
                      onClick={() =>
                        act.mutate({ path: '/review', body: { approve: false, comment: comment.trim() } })
                      }
                    >
                      Refuser
                    </Button>
                  </>
                ) : null}

                {canApply && mutation.canBeApplied ? (
                  <Button
                    size="sm"
                    icon={<ArrowRightLeft className="h-4 w-4" />}
                    loading={act.isPending}
                    onClick={() => act.mutate({ path: '/apply' })}
                  >
                    Appliquer le transfert
                  </Button>
                ) : null}

                {canApply && mutation.canBeReverted ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<RotateCcw className="h-4 w-4" />}
                    onClick={() => setRevertOpen(true)}
                  >
                    Retour à l&apos;agence d&apos;origine
                  </Button>
                ) : null}

                {mutation.canBeReviewed ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={comment.trim().length < 3}
                    onClick={() => act.mutate({ path: '/cancel', body: { reason: comment.trim() } })}
                  >
                    Retirer la demande
                  </Button>
                ) : null}
              </div>

              {canReview && mutation.canBeReviewed ? (
                <div className="mt-3">
                  <Field label="Commentaire de décision" hint="Obligatoire pour un refus ou un retrait.">
                    <Input value={comment} onChange={(event) => setComment(event.target.value)} />
                  </Field>
                </div>
              ) : null}
            </header>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <Card>
                <CardHeader title="Double validation" icon={<ShieldQuestion className="h-4 w-4" />} />
                <CardBody className="pt-2">
                  <DescriptionList>
                    <DataRow label="Demandée par" value={mutation.requestedByLabel ?? '—'} />
                    <DataRow label="Le" value={formatDateTime(mutation.requestedAt)} />
                    <DataRow label="Instruite par" value={mutation.reviewedByLabel ?? '—'} />
                    <DataRow label="Le" value={mutation.reviewedAt ? formatDateTime(mutation.reviewedAt) : '—'} />
                    <DataRow label="Commentaire" value={mutation.reviewComment ?? '—'} />
                    {mutation.rejectionReason ? <DataRow label="Motif de refus" value={mutation.rejectionReason} /> : null}
                  </DescriptionList>
                </CardBody>
              </Card>

              <Card>
                <CardHeader title="Transfert" icon={<ArrowRightLeft className="h-4 w-4" />} />
                <CardBody className="pt-2">
                  <DescriptionList>
                    <DataRow label="Charge du dossier" value={mutation.caseLoadSummary ?? '—'} />
                    <DataRow
                      label="Changement de région"
                      value={mutation.regionChanged ? 'oui — alertes redirigées' : 'non — même région'}
                    />
                    <DataRow label="Alertes redirigées" value={String(mutation.alertsRedirected)} />
                    <DataRow
                      label="Services informés"
                      value={mutation.servicesNotified.length > 0 ? mutation.servicesNotified.join(', ') : '—'}
                    />
                    <DataRow label="Client informé (SMS)" value={mutation.clientNotifiedAt ? formatDateTime(mutation.clientNotifiedAt) : 'non'} />
                    <DataRow label="Appliqué par" value={mutation.appliedByLabel ?? '—'} />
                    <DataRow label="Le" value={mutation.appliedAt ? formatDateTime(mutation.appliedAt) : '—'} />
                    {mutation.revertedAt ? (
                      <>
                        <DataRow label="Retour effectué" value={formatDateTime(mutation.revertedAt)} />
                        <DataRow label="Motif du retour" value={mutation.revertReason ?? '—'} />
                      </>
                    ) : null}
                  </DescriptionList>
                </CardBody>
              </Card>

              <Card>
                <CardHeader
                  title="Suivi de l'intégration"
                  description="L'agence d'accueil confirme la prise en charge à 7 et 30 jours."
                  icon={<ClipboardCheck className="h-4 w-4" />}
                />
                <CardBody className="space-y-3 pt-2">
                  {mutation.integration.map((entry) => (
                    <div
                      key={entry.horizon}
                      className="rounded-xl border border-slate-200 p-3 text-xs dark:border-slate-800"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium text-slate-700 dark:text-slate-200">
                          J+{entry.horizon}
                          {entry.dueAt ? ` · échéance ${formatDateTime(entry.dueAt)}` : ''}
                        </span>
                        <Badge
                          tone={
                            entry.reportedAt
                              ? describe(INTEGRATION_OUTCOME, entry.outcome).tone
                              : entry.late
                                ? 'danger'
                                : 'neutral'
                          }
                        >
                          {entry.reportedAt
                            ? describe(INTEGRATION_OUTCOME, entry.outcome).label
                            : entry.late
                              ? 'En retard'
                              : 'Attendu'}
                        </Badge>
                      </div>
                      {entry.note ? <p className="mt-1 text-slate-500 dark:text-slate-400">{entry.note}</p> : null}
                    </div>
                  ))}

                  {canApply && mutation.status === 'APPLIED' && mutation.pendingIntegration.length > 0 ? (
                    <div className="space-y-3 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Horizon">
                          <Select value={integrationHorizon} onChange={(event) => setIntegrationHorizon(event.target.value)}>
                            {mutation.pendingIntegration.map((horizon) => (
                              <option key={horizon} value={String(horizon)}>
                                J+{horizon}
                              </option>
                            ))}
                          </Select>
                        </Field>
                        <Field label="Conclusion">
                          <Select
                            value={integrationOutcome}
                            onChange={(event) => setIntegrationOutcome(event.target.value as IntegrationOutcome)}
                          >
                            <option value="SATISFACTORY">Intégration satisfaisante</option>
                            <option value="ISSUES_REPORTED">Difficultés signalées</option>
                            <option value="CLIENT_LOST">Client perdu</option>
                          </Select>
                        </Field>
                      </div>
                      <Field label="Observations">
                        <Textarea
                          rows={2}
                          value={integrationNote}
                          onChange={(event) => setIntegrationNote(event.target.value)}
                          placeholder="Client contacté, installation vérifiée, aucune alerte depuis le transfert…"
                        />
                      </Field>
                      <div className="flex justify-end">
                        <Button size="sm" loading={report.isPending} onClick={() => report.mutate()}>
                          Enregistrer le rapport
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </CardBody>
              </Card>
            </div>
          </div>
        )}
      </Drawer>

      <Modal
        open={revertOpen}
        onClose={() => setRevertOpen(false)}
        title="Retour à l'agence d'origine"
        description="Le dossier revient à son agence précédente, avec ses équipements et ses alertes en cours."
        footer={
          <>
            <Button variant="ghost" onClick={() => setRevertOpen(false)}>
              Annuler
            </Button>
            <Button
              variant="danger"
              loading={act.isPending}
              disabled={revertReason.trim().length < 3}
              onClick={() => act.mutate({ path: '/revert', body: { reason: revertReason.trim() } })}
            >
              Confirmer le retour
            </Button>
          </>
        }
      >
        <Field label="Motif du retour" required>
          <Textarea
            rows={3}
            value={revertReason}
            onChange={(event) => setRevertReason(event.target.value)}
            placeholder="Erreur d'affectation, difficulté d'intervention dans la nouvelle zone…"
          />
        </Field>
      </Modal>
    </>
  );
};
