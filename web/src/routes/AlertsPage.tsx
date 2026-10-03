import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BellRing,
  Filter,
  Flame,
  HeartPulse,
  PhoneCall,
  RotateCcw,
  Search,
  ShieldAlert,
  Siren,
  TriangleAlert,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AlertDetailDrawer } from '@/components/alerts/AlertDetailDrawer';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/Feedback';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Pagination, TBody, TD, TH, THead, TR, TableWrap } from '@/components/ui/Table';
import { useAlerts, useAlertStats, useClients } from '@/hooks/queries';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatRelative } from '@/lib/format';
import {
  ALERT_SEVERITY,
  ALERT_SOURCE,
  ALERT_STATUS,
  ALERT_TYPE,
  DISPATCH_STATUS,
  VOICE_CALL_OUTCOME,
  describe,
} from '@/lib/labels';
import { useAuthStore } from '@/store/auth';
import { useUiStore } from '@/store/ui';
import type { AlertSeverity, AlertStatus, AlertType } from '@/types/api';

const ALERT_TYPES: AlertType[] = ['INTRUSION', 'FIRE', 'MEDICAL', 'SABOTAGE', 'PANIC', 'GAS_LEAK', 'WATER_LEAK', 'SYSTEM'];
const SEVERITIES: AlertSeverity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const STATUSES: AlertStatus[] = ['NEW', 'ACKNOWLEDGED', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'FALSE_ALARM', 'CANCELLED'];

const OPERATOR_ROLES = [
  'SUPER_ADMIN',
  'NATIONAL_DIRECTOR',
  'TECHNICAL_DIRECTOR',
  'PLATFORM_MANAGER',
  'REGION_MANAGER',
  'AGENCY_MANAGER',
  'OPERATOR',
  'SUPERVISOR',
  'STATION_AGENT',
] as const;

const TypeIcon = ({ type }: { type: AlertType }) => {
  const className = 'h-4 w-4';
  if (type === 'FIRE') return <Flame className={cn(className, 'text-red-500')} />;
  if (type === 'MEDICAL') return <HeartPulse className={cn(className, 'text-rose-500')} />;
  if (type === 'GAS_LEAK' || type === 'WATER_LEAK') return <TriangleAlert className={cn(className, 'text-orange-500')} />;
  if (type === 'PANIC') return <Siren className={cn(className, 'text-red-600')} />;
  return <ShieldAlert className={cn(className, 'text-amber-500')} />;
};

export const AlertsPage = () => {
  const navigate = useNavigate();
  const { alertId } = useParams<{ alertId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const pushToast = useUiStore((state) => state.pushToast);
  const hasRole = useAuthStore((state) => state.hasRole);

  const [page, setPage] = useState(1);
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [manualOpen, setManualOpen] = useState(false);
  const [manualClientId, setManualClientId] = useState('');
  const [manualType, setManualType] = useState<AlertType>('INTRUSION');
  const [manualNote, setManualNote] = useState('');
  const [manualSeverity, setManualSeverity] = useState<AlertSeverity | ''>('');

  const openOnly = searchParams.get('openOnly') === 'true';
  const status = searchParams.get('status') ?? '';
  const type = searchParams.get('type') ?? '';
  const severity = searchParams.get('severity') ?? '';

  const setFilter = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(searchParams);
      if (value) next.set(key, value);
      else next.delete(key);
      setSearchParams(next, { replace: true });
      setPage(1);
    },
    [searchParams, setSearchParams],
  );

  const params = useMemo(
    () => ({
      page,
      limit: 20,
      order: 'desc' as const,
      ...(openOnly ? { openOnly: 'true' } : {}),
      ...(status ? { status } : {}),
      ...(type ? { type } : {}),
      ...(severity ? { severity } : {}),
      ...(search ? { search } : {}),
    }),
    [page, openOnly, status, type, severity, search],
  );

  const alertsQuery = useAlerts(params);
  const statsQuery = useAlertStats();
  const clientsQuery = useClients({ limit: 100, status: 'ACTIVE' });

  const trigger = useMutation({
    mutationFn: async () =>
      api.post('/alerts', {
        type: manualType,
        clientId: manualClientId,
        note: manualNote || undefined,
        ...(manualSeverity ? { severity: manualSeverity } : {}),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['alerts'] });
      setManualOpen(false);
      setManualNote('');
      pushToast({ tone: 'warning', title: 'Alerte déclenchée', description: 'Le protocole de qualification a démarré.' });
    },
    onError: (error: Error) =>
      pushToast({ tone: 'danger', title: 'Déclenchement refusé', description: error.message }),
  });

  const hasFilters = Boolean(openOnly || status || type || severity || search);
  const resetFilters = () => {
    setSearchParams(new URLSearchParams(), { replace: true });
    setSearchDraft('');
    setSearch('');
    setPage(1);
  };

  return (
    <div className="space-y-5">
      {/* Compteurs rapides */}
      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {[
          { label: 'Ouvertes', value: statsQuery.data?.open ?? 0, tone: 'critical' as const },
          { label: 'Nouvelles', value: statsQuery.data?.byStatus.find((row) => row.status === 'NEW')?.count ?? 0, tone: 'danger' as const },
          { label: 'En intervention', value: statsQuery.data?.byStatus.find((row) => row.status === 'IN_PROGRESS')?.count ?? 0, tone: 'warning' as const },
          { label: 'Cloturees', value: statsQuery.data?.byStatus.find((row) => row.status === 'RESOLVED')?.count ?? 0, tone: 'success' as const },
          { label: 'Dernières 24 h', value: statsQuery.data?.last24h ?? 0, tone: 'info' as const },
        ].map((item) => (
          <Card key={item.label} className="p-3">
            <p className="text-[11px] font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
              {item.label}
            </p>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-xl font-semibold text-slate-900 tabular-nums dark:text-white">{item.value}</span>
              <Badge tone={item.tone} dot={item.tone === 'critical'} />
            </div>
          </Card>
        ))}
      </div>

      {/* Barre de filtres */}
      <Card>
        <CardBody className="space-y-3 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <form
              className="relative min-w-[220px] flex-1"
              onSubmit={(event) => {
                event.preventDefault();
                setSearch(searchDraft.trim());
                setPage(1);
              }}
            >
              <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-slate-400" />
              <Input
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
                placeholder="Référence, client, ID Zengo, ville, message..."
                className="pl-9"
              />
            </form>

            <button
              type="button"
              onClick={() => setFilter('openOnly', openOnly ? '' : 'true')}
              className={cn(
                'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                openOnly
                  ? 'border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-500/40 dark:bg-brand-500/10 dark:text-brand-300'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800/50',
              )}
            >
              <Filter className="h-3.5 w-3.5" />
              Uniquement les alertes ouvertes
            </button>

            {hasFilters ? (
              <Button variant="ghost" size="sm" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={resetFilters}>
                Réinitialiser
              </Button>
            ) : null}

            {hasRole(...OPERATOR_ROLES) ? (
              <Button icon={<BellRing className="h-4 w-4" />} onClick={() => setManualOpen(true)}>
                Declencher une alerte
              </Button>
            ) : null}
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <Select value={status} onChange={(event) => setFilter('status', event.target.value)}>
              <option value="">Tous les statuts</option>
              {STATUSES.map((value) => (
                <option key={value} value={value}>
                  {describe(ALERT_STATUS, value).label}
                </option>
              ))}
            </Select>

            <Select value={type} onChange={(event) => setFilter('type', event.target.value)}>
              <option value="">Toutes les natures</option>
              {ALERT_TYPES.map((value) => (
                <option key={value} value={value}>
                  {describe(ALERT_TYPE, value).label}
                </option>
              ))}
            </Select>

            <Select value={severity} onChange={(event) => setFilter('severity', event.target.value)}>
              <option value="">Toutes les gravites</option>
              {SEVERITIES.map((value) => (
                <option key={value} value={value}>
                  {describe(ALERT_SEVERITY, value).label}
                </option>
              ))}
            </Select>
          </div>
        </CardBody>
      </Card>

      {/* File d'alertes */}
      <Card className="overflow-hidden">
        {alertsQuery.isLoading ? (
          <TableSkeleton rows={8} columns={6} />
        ) : alertsQuery.isError ? (
          <ErrorState onRetry={() => void alertsQuery.refetch()} />
        ) : (alertsQuery.data?.items.length ?? 0) === 0 ? (
          <EmptyState
            title="Aucune alerte ne correspond aux filtres"
            description="Ajustez la période ou reinitialisez les filtres pour elargir la recherche."
            icon={<BellRing className="h-5 w-5" />}
            action={
              hasFilters ? (
                <Button variant="secondary" size="sm" onClick={resetFilters}>
                  Réinitialiser les filtres
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <TableWrap>
              <THead>
                <TH>Référence</TH>
                <TH>Nature</TH>
                <TH>Gravité</TH>
                <TH>Statut</TH>
                <TH>Client</TH>
                <TH>Source</TH>
                <TH>Engagement</TH>
                <TH>Appel IA</TH>
                <TH className="text-right">Déclenchée</TH>
              </THead>
              <TBody>
                {alertsQuery.data?.items.map((alert) => (
                  <TR key={alert.id} onClick={() => navigate(`/alertes/${alert.id}`)}>
                    <TD className="font-mono text-xs font-semibold text-slate-900 dark:text-white">
                      {alert.reference}
                      {alert.occurrenceCount > 1 ? (
                        <span className="ml-1.5 rounded bg-amber-100 px-1 text-[10px] text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                          ×{alert.occurrenceCount}
                        </span>
                      ) : null}
                    </TD>
                    <TD>
                      <span className="flex items-center gap-2 whitespace-nowrap">
                        <TypeIcon type={alert.type} />
                        {describe(ALERT_TYPE, alert.type).label}
                      </span>
                    </TD>
                    <TD>
                      <Badge tone={describe(ALERT_SEVERITY, alert.severity).tone}>
                        {describe(ALERT_SEVERITY, alert.severity).label}
                      </Badge>
                    </TD>
                    <TD>
                      <Badge tone={describe(ALERT_STATUS, alert.status).tone} dot={alert.status === 'NEW'}>
                        {describe(ALERT_STATUS, alert.status).label}
                      </Badge>
                    </TD>
                    <TD className="max-w-[200px]">
                      <span className="block truncate">{alert.client?.fullName ?? '—'}</span>
                      <span className="block truncate font-mono text-[11px] text-slate-400">
                        {alert.city ?? alert.client?.zengoId ?? ''}
                      </span>
                    </TD>
                    <TD className="whitespace-nowrap text-xs">{describe(ALERT_SOURCE, alert.source).label}</TD>
                    <TD>
                      {alert.dispatches?.length ? (
                        <span className="flex flex-wrap gap-1">
                          {alert.dispatches.slice(0, 2).map((item) => (
                            <Badge key={item.id} tone={describe(DISPATCH_STATUS, item.status).tone}>
                              {item.station?.name ?? 'Station'}
                            </Badge>
                          ))}
                          {alert.dispatches.length > 2 ? (
                            <Badge tone="neutral">+{alert.dispatches.length - 2}</Badge>
                          ) : null}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </TD>
                    <TD>
                      {alert.voiceCallOutcome ? (
                        <span className="flex items-center gap-1.5 whitespace-nowrap text-xs">
                          <PhoneCall className="h-3.5 w-3.5 text-slate-400" />
                          {describe(VOICE_CALL_OUTCOME, alert.voiceCallOutcome).label}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </TD>
                    <TD className="text-right text-xs whitespace-nowrap text-slate-500 dark:text-slate-400">
                      {formatRelative(alert.openedAt)}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </TableWrap>
            {alertsQuery.data ? (
              <Pagination page={alertsQuery.data} onPageChange={setPage} />
            ) : null}
          </>
        )}
      </Card>

      <AlertDetailDrawer alertId={alertId ?? null} onClose={() => navigate('/alertes', { replace: true })} />

      {/* Déclenchement manuel */}
      <Modal
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        title="Declencher une alerte"
        description="À utiliser lorsque le client signale un incident par téléphone ou lors d'une vérification terrain."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setManualOpen(false)}>
              Annuler
            </Button>
            <Button
              variant="danger"
              loading={trigger.isPending}
              disabled={!manualClientId}
              icon={<BellRing className="h-4 w-4" />}
              onClick={() => trigger.mutate()}
            >
              Declencher
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Client concerne" required>
            <Select value={manualClientId} onChange={(event) => setManualClientId(event.target.value)}>
              <option value="">Sélectionner un compte client…</option>
              {clientsQuery.data?.items.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.fullName} — {client.zengoId} ({client.city ?? 'ville inconnue'})
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nature de l'alerte" required>
              <Select value={manualType} onChange={(event) => setManualType(event.target.value as AlertType)}>
                {ALERT_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {describe(ALERT_TYPE, value).label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Gravité" hint="Laisser vide pour le calcul automatique">
              <Select value={manualSeverity} onChange={(event) => setManualSeverity(event.target.value as AlertSeverity | '')}>
                <option value="">Automatique</option>
                {SEVERITIES.map((value) => (
                  <option key={value} value={value}>
                    {describe(ALERT_SEVERITY, value).label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Commentaire" hint="Contexte transmis aux équipes d'intervention.">
            <Textarea
              rows={3}
              value={manualNote}
              onChange={(event) => setManualNote(event.target.value)}
              placeholder="Appel du client : fumée signalée au niveau du dépôt arrière."
            />
          </Field>

          <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Un appel vocal de qualification peut être déclenche automatiquement après création.
          </p>
        </div>
      </Modal>
    </div>
  );
};
