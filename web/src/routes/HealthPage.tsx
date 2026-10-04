import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  HeartPulse,
  Lock,
  MessageSquarePlus,
  Plus,
  Send,
  ShieldCheck,
  Siren,
  Stethoscope,
  Unlock,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, DataRow, DescriptionList, StatCard } from '@/components/ui/Card';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { EmptyState, ErrorState, Skeleton, TableSkeleton } from '@/components/ui/Feedback';
import { Drawer, Modal } from '@/components/ui/Modal';
import { TBody, TD, TH, THead, TR, TableWrap } from '@/components/ui/Table';
import { Tabs } from '@/components/ui/Tabs';
import {
  useClientHealth,
  useClientHealthAccessLogs,
  useClientHealthConsents,
  useClientHealthHistory,
  useClients,
  useHealthcareStats,
  useNurseRequests,
} from '@/hooks/queries';
import { api } from '@/lib/api';
import { formatDateTime, formatNumber, formatRelative } from '@/lib/format';
import {
  HEALTH_ACCESS_ACTION,
  HEALTH_CONSENT_CHANNEL,
  HEALTH_CONSENT_SCOPE,
  HEALTH_CONSENT_STATUS,
  HEALTH_METRIC,
  HEALTH_READING_STATUS,
  HEALTH_SOURCE,
  HEALTH_TREND,
  NURSE_REQUEST_PRIORITY,
  NURSE_REQUEST_STATUS,
  describe,
} from '@/lib/labels';
import { useAuthStore } from '@/store/auth';
import { useUiStore } from '@/store/ui';
import type {
  ClientProfile,
  HealthConsentScope,
  HealthMeasurement,
  HealthMetric,
  NurseRequest,
  NurseRequestPriority,
} from '@/types/api';

/** Grandeurs saisissables depuis la console (ordre clinique d'usage). */
const METRICS: HealthMetric[] = [
  'BLOOD_PRESSURE',
  'HEART_RATE',
  'SPO2',
  'BLOOD_GLUCOSE',
  'TEMPERATURE',
  'WEIGHT',
];

const CONSENT_SCOPES: HealthConsentScope[] = ['DATA_SHARING', 'NURSE_CONTACT', 'EMERGENCY_DISCLOSURE'];

const PRIORITIES: NurseRequestPriority[] = ['ROUTINE', 'URGENT', 'EMERGENCY'];

/**
 * Santé connectée (e-santé préventive).
 *
 * Deux usages dans le même écran : le **dossier de santé** d'un client (dernières
 * valeurs, tendances, consentements, journal d'accès) et la **file des demandes
 * de soin** du centre de santé. Une mesure critique ouvre automatiquement une
 * alerte MEDICALE dans le pipeline du ZMC, que l'opérateur retrouve dans la file
 * d'alertes.
 */
export const HealthPage = () => {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((state) => state.pushToast);
  const hasRole = useAuthStore((state) => state.hasRole);
  const isHealthStaff = hasRole(
    'HEALTH_STAFF',
    'SUPER_ADMIN',
    'NATIONAL_DIRECTOR',
    'TECHNICAL_DIRECTOR',
  );

  const [tab, setTab] = useState('dossier');
  const [clientId, setClientId] = useState('');
  const [emergency, setEmergency] = useState(false);
  const [measureOpen, setMeasureOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);

  // Formulaire de mesure
  const [metric, setMetric] = useState<HealthMetric>('BLOOD_PRESSURE');
  const [primaryValue, setPrimaryValue] = useState('');
  const [secondaryValue, setSecondaryValue] = useState('');
  const [fasting, setFasting] = useState(false);
  const [measureNote, setMeasureNote] = useState('');

  // Formulaire de demande de soin
  const [requestReason, setRequestReason] = useState('');
  const [requestSymptoms, setRequestSymptoms] = useState('');
  const [requestPriority, setRequestPriority] = useState('');
  const [requestMessage, setRequestMessage] = useState('');

  const [openOnly, setOpenOnly] = useState(false);

  const clientsQuery = useClients({ limit: 100, status: 'ACTIVE' });
  const statsQuery = useHealthcareStats();
  const requestsQuery = useNurseRequests({ page: 1, limit: 20, openOnly: openOnly || undefined });
  const clients = clientsQuery.data?.items ?? [];
  const stats = statsQuery.data;
  const requests = requestsQuery.data?.items ?? [];

  // Le premier client de la liste est sélectionné automatiquement : l'écran est
  // immédiatement exploitable en démonstration.
  useEffect(() => {
    if (!clientId && clients.length > 0) setClientId(clients[0].id);
  }, [clientId, clients]);

  const selectedClient = useMemo(
    () => clients.find((client) => client.id === clientId) ?? null,
    [clients, clientId],
  );

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['healthcare'] });
  };

  const recordMeasurement = useMutation({
    mutationFn: () =>
      api.post<HealthMeasurement>('/healthcare/measurements', {
        clientId,
        metric,
        value: Number(primaryValue),
        secondaryValue: secondaryValue === '' ? undefined : Number(secondaryValue),
        fasting: metric === 'BLOOD_GLUCOSE' ? fasting : undefined,
        note: measureNote || undefined,
      }),
    onSuccess: (measurement) => {
      pushToast({
        tone: measurement.status === 'CRITICAL' ? 'danger' : 'success',
        title: measurement.label,
        description:
          measurement.status === 'CRITICAL'
            ? `${measurement.advice}${measurement.alertId ? ' — alerte médicale ouverte dans le ZMC.' : ''}`
            : measurement.advice,
      });
      setMeasureOpen(false);
      setPrimaryValue('');
      setSecondaryValue('');
      setMeasureNote('');
      setFasting(false);
      invalidate();
    },
    onError: (error: Error) =>
      pushToast({ tone: 'danger', title: 'Mesure refusée', description: error.message }),
  });

  const createRequest = useMutation({
    mutationFn: () =>
      api.post<NurseRequest>('/healthcare/nurse-requests', {
        clientId,
        reason: requestReason,
        symptoms: requestSymptoms || undefined,
        priority: requestPriority || undefined,
        message: requestMessage || undefined,
      }),
    onSuccess: (request) => {
      pushToast({
        tone: request.priority === 'EMERGENCY' ? 'danger' : 'success',
        title: `Demande ${request.reference}`,
        description:
          request.priority === 'EMERGENCY'
            ? 'Urgence vitale : alerte médicale ouverte, équipes mobilisables depuis la file ZMC.'
            : 'La demande est transmise au personnel de santé.',
      });
      setRequestOpen(false);
      setRequestReason('');
      setRequestSymptoms('');
      setRequestPriority('');
      setRequestMessage('');
      setTab('demandes');
      invalidate();
    },
    onError: (error: Error) =>
      pushToast({ tone: 'danger', title: 'Demande refusée', description: error.message }),
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Santé connectée</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Mesures préventives, consentement du client et demandes de soin du centre de santé
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            icon={<MessageSquarePlus className="h-4 w-4" />}
            disabled={!clientId}
            onClick={() => setRequestOpen(true)}
          >
            Ouvrir une demande de soin
          </Button>
          <Button icon={<Plus className="h-4 w-4" />} disabled={!isHealthStaff} onClick={() => setMeasureOpen(true)}>
            Saisir une mesure
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Mesures suivies"
          value={stats ? formatNumber(stats.measurements.totalMeasurements) : '—'}
          hint={`${stats?.measurements.clientsFollowed ?? 0} client(s) suivi(s)`}
          icon={<Activity className="h-4 w-4" />}
          tone="brand"
        />
        <StatCard
          label="Valeurs critiques"
          value={stats ? formatNumber(stats.measurements.criticalLast24h) : '—'}
          hint={`sur 24 h · ${stats?.measurements.criticalClients ?? 0} client(s) à risque`}
          icon={<AlertTriangle className="h-4 w-4" />}
          tone={stats && stats.measurements.criticalLast24h > 0 ? 'danger' : 'neutral'}
        />
        <StatCard
          label="Demandes de soin"
          value={stats ? formatNumber(stats.nurseRequests.open) : '—'}
          hint={`${stats?.nurseRequests.late ?? 0} hors délai de prise en charge`}
          icon={<Stethoscope className="h-4 w-4" />}
          tone={stats && stats.nurseRequests.late > 0 ? 'warning' : 'info'}
        />
        <StatCard
          label="Délai moyen de prise en charge"
          value={
            stats?.nurseRequests.averageResponseMinutes === null ||
            stats?.nurseRequests.averageResponseMinutes === undefined
              ? '—'
              : `${stats.nurseRequests.averageResponseMinutes} min`
          }
          hint={`${stats?.nurseRequests.completedLast30Days ?? 0} demande(s) clôturée(s) sur 30 j`}
          icon={<HeartPulse className="h-4 w-4" />}
          tone="success"
        />
      </div>

      <Card>
        <CardHeader
          title="Dossier de santé"
          description="Sélectionnez un client pour consulter ses dernières mesures et ses consentements."
          icon={<HeartPulse className="h-4 w-4" />}
          actions={
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Client">
                <Select value={clientId} onChange={(event) => setClientId(event.target.value)}>
                  <option value="">Sélectionner un client…</option>
                  {clients.map((client: ClientProfile) => (
                    <option key={client.id} value={client.id}>
                      {client.zengoId} · {client.fullName}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          }
        />
      </Card>

      <Tabs
        items={[
          { id: 'dossier', label: 'Dossier client' },
          { id: 'demandes', label: 'Demandes de soin', count: stats?.nurseRequests.open ?? 0 },
          { id: 'journal', label: 'Traçabilité' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'dossier' ? (
        <ClientHealthPanel
          clientId={clientId || undefined}
          client={selectedClient}
          emergency={emergency}
          onEmergencyChange={setEmergency}
          isHealthStaff={isHealthStaff}
          onGrantConsent={(scope) => {
            if (!clientId) return;
            setEmergency(false);
            void api
              .post(`/healthcare/clients/${clientId}/consents`, {
                scope,
                channel: 'CLIENT_APP',
                months: 24,
              })
              .then(() => {
                pushToast({
                  tone: 'success',
                  title: 'Consentement enregistré',
                  description: `${describe(HEALTH_CONSENT_SCOPE, scope).label} — trace conservée comme preuve.`,
                });
                invalidate();
              })
              .catch((error: Error) =>
                pushToast({ tone: 'danger', title: 'Consentement refusé', description: error.message }),
              );
          }}
          onRevokeConsent={(scope) => {
            if (!clientId) return;
            void api
              .patch(`/healthcare/clients/${clientId}/consents/revoke`, {
                scope,
                reason: 'Retrait demandé par le client depuis la console.',
              })
              .then(() => {
                pushToast({
                  tone: 'info',
                  title: 'Consentement retiré',
                  description: 'Tout accès aux données est désormais refusé, sauf urgence vitale.',
                });
                invalidate();
              })
              .catch((error: Error) =>
                pushToast({ tone: 'danger', title: 'Retrait refusé', description: error.message }),
              );
          }}
          onOpenRequest={() => {
            setRequestOpen(true);
          }}
        />
      ) : null}

      {tab === 'demandes' ? (
        <Card>
          <CardHeader
            title="File du centre de santé"
            description="Appels infirmiers et demandes de soin, priorités les plus urgentes suivies en premier."
            icon={<Stethoscope className="h-4 w-4" />}
            actions={
              <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300"
                  checked={openOnly}
                  onChange={(event) => setOpenOnly(event.target.checked)}
                />
                Non clôturées
              </label>
            }
          />
          {requestsQuery.isLoading ? (
            <TableSkeleton rows={6} columns={6} />
          ) : requestsQuery.isError ? (
            <ErrorState onRetry={() => void requestsQuery.refetch()} />
          ) : requests.length === 0 ? (
            <EmptyState
              title="Aucune demande de soin"
              description="Aucun appel infirmier ne correspond à ces filtres."
              icon={<Stethoscope className="h-5 w-5" />}
            />
          ) : (
            <TableWrap>
              <THead>
                <TR>
                  <TH>Référence</TH>
                  <TH>Client</TH>
                  <TH>Motif</TH>
                  <TH>Priorité</TH>
                  <TH>Statut</TH>
                  <TH>Prise en charge</TH>
                </TR>
              </THead>
              <TBody>
                {requests.map((request) => (
                  <TR
                    key={request.id}
                    className="cursor-pointer"
                    onClick={() => setSelectedRequestId(request.id)}
                  >
                    <TD>
                      <span className="font-mono text-xs font-medium text-slate-800 dark:text-slate-100">
                        {request.reference}
                      </span>
                      <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                        {request.requestedByLabel ?? '—'} · {formatRelative(request.createdAt)}
                      </p>
                    </TD>
                    <TD>
                      <span className="text-sm text-slate-700 dark:text-slate-200">
                        {request.client.fullName}
                      </span>
                      <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                        {request.client.zengoId}
                      </p>
                    </TD>
                    <TD>
                      <span className="text-xs text-slate-600 dark:text-slate-300">{request.reason}</span>
                      {request.symptoms ? (
                        <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                          {request.symptoms.slice(0, 60)}
                        </p>
                      ) : null}
                    </TD>
                    <TD>
                      <Badge tone={describe(NURSE_REQUEST_PRIORITY, request.priority).tone}>
                        {describe(NURSE_REQUEST_PRIORITY, request.priority).label}
                      </Badge>
                    </TD>
                    <TD>
                      <Badge tone={describe(NURSE_REQUEST_STATUS, request.status).tone}>
                        {describe(NURSE_REQUEST_STATUS, request.status).label}
                      </Badge>
                    </TD>
                    <TD>
                      <span className="text-xs text-slate-600 dark:text-slate-300">
                        {request.assignedToLabel ?? 'non prise en charge'}
                      </span>
                      {request.status !== 'COMPLETED' && request.status !== 'CANCELLED' ? (
                        <p
                          className={
                            request.late
                              ? 'mt-0.5 text-[11px] text-rose-600 dark:text-rose-400'
                              : 'mt-0.5 text-[11px] text-slate-500 dark:text-slate-400'
                          }
                        >
                          échéance {formatRelative(request.responseDueAt)}
                        </p>
                      ) : null}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </TableWrap>
          )}
        </Card>
      ) : null}

      {tab === 'journal' ? <HealthAccessLogCard clientId={clientId || undefined} /> : null}

      {/* Saisie d'une mesure */}
      <Modal
        open={measureOpen}
        onClose={() => setMeasureOpen(false)}
        title="Saisir une mesure de santé"
        description="La valeur est qualifiée automatiquement (normale, à surveiller, critique). Une valeur critique ouvre une alerte médicale dans le ZMC."
        footer={
          <>
            <Button variant="ghost" onClick={() => setMeasureOpen(false)}>
              Annuler
            </Button>
            <Button
              icon={<Plus className="h-4 w-4" />}
              loading={recordMeasurement.isPending}
              disabled={!clientId || primaryValue === ''}
              onClick={() => recordMeasurement.mutate()}
            >
              Enregistrer la mesure
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Grandeur" required>
            <Select value={metric} onChange={(event) => setMetric(event.target.value as HealthMetric)}>
              {METRICS.map((value) => (
                <option key={value} value={value}>
                  {describe(HEALTH_METRIC, value).label}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label={
                metric === 'BLOOD_PRESSURE'
                  ? 'Systolique (mmHg)'
                  : metric === 'WEIGHT'
                    ? 'Poids (kg)'
                    : metric === 'TEMPERATURE'
                      ? 'Température (°C)'
                      : metric === 'BLOOD_GLUCOSE'
                        ? 'Glycémie (mg/dL)'
                        : metric === 'SPO2'
                          ? 'Saturation (%)'
                          : 'Fréquence cardiaque (bpm)'
              }
              required
            >
              <Input
                type="number"
                inputMode="decimal"
                value={primaryValue}
                onChange={(event) => setPrimaryValue(event.target.value)}
              />
            </Field>
            <Field
              label={
                metric === 'BLOOD_PRESSURE'
                  ? 'Diastolique (mmHg)'
                  : metric === 'WEIGHT'
                    ? 'Taille (cm) — pour l’IMC'
                    : 'Valeur secondaire (facultative)'
              }
              required={metric === 'BLOOD_PRESSURE'}
              hint={
                metric === 'BLOOD_PRESSURE'
                  ? 'Obligatoire pour qualifier la tension.'
                  : metric === 'WEIGHT'
                    ? 'Renseignée, elle donne l’interprétation de l’IMC.'
                    : undefined
              }
            >
              <Input
                type="number"
                inputMode="decimal"
                value={secondaryValue}
                disabled={!['BLOOD_PRESSURE', 'WEIGHT'].includes(metric)}
                onChange={(event) => setSecondaryValue(event.target.value)}
              />
            </Field>
          </div>

          {metric === 'BLOOD_GLUCOSE' ? (
            <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300"
                checked={fasting}
                onChange={(event) => setFasting(event.target.checked)}
              />
              Mesure à jeun (référentiel OMS : le seuil critique est plus bas)
            </label>
          ) : null}

          <Field label="Observation">
            <Textarea
              rows={2}
              value={measureNote}
              onChange={(event) => setMeasureNote(event.target.value)}
              placeholder="Contexte de la mesure, symptômes signalés…"
            />
          </Field>
        </div>
      </Modal>

      {/* Demande de soin */}
      <Modal
        open={requestOpen}
        onClose={() => setRequestOpen(false)}
        title="Ouvrir une demande de soin"
        description="Le personnel de santé prend la demande en charge selon la priorité. Sans priorité choisie, elle est déduite des dernières mesures."
        footer={
          <>
            <Button variant="ghost" onClick={() => setRequestOpen(false)}>
              Annuler
            </Button>
            <Button
              icon={<Send className="h-4 w-4" />}
              loading={createRequest.isPending}
              disabled={!clientId || requestReason.trim().length < 3}
              onClick={() => createRequest.mutate()}
            >
              Transmettre la demande
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Motif de l’appel" required>
            <Input
              value={requestReason}
              onChange={(event) => setRequestReason(event.target.value)}
              placeholder="Maux de tête persistants, question sur le traitement…"
            />
          </Field>
          <Field label="Symptômes déclarés">
            <Textarea
              rows={3}
              value={requestSymptoms}
              onChange={(event) => setRequestSymptoms(event.target.value)}
              placeholder="Depuis quand, intensité, signes associés…"
            />
          </Field>
          <Field label="Priorité" hint="« Automatique » suit la gravité des dernières mesures du client.">
            <Select value={requestPriority} onChange={(event) => setRequestPriority(event.target.value)}>
              <option value="">Automatique (déduite des mesures)</option>
              {PRIORITIES.map((value) => (
                <option key={value} value={value}>
                  {describe(NURSE_REQUEST_PRIORITY, value).label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Premier message au personnel de santé">
            <Textarea
              rows={2}
              value={requestMessage}
              onChange={(event) => setRequestMessage(event.target.value)}
              placeholder="Éléments utiles à la prise en charge…"
            />
          </Field>
        </div>
      </Modal>

      <NurseRequestDrawer
        requestId={selectedRequestId}
        onClose={() => setSelectedRequestId(null)}
        onChanged={invalidate}
      />
    </div>
  );
};

/** Dossier de santé d'un client : vitals, consentements, historique. */
const ClientHealthPanel = ({
  clientId,
  client,
  emergency,
  onEmergencyChange,
  isHealthStaff,
  onGrantConsent,
  onRevokeConsent,
  onOpenRequest,
}: {
  clientId: string | undefined;
  client: ClientProfile | null;
  emergency: boolean;
  onEmergencyChange: (value: boolean) => void;
  isHealthStaff: boolean;
  onGrantConsent: (scope: HealthConsentScope) => void;
  onRevokeConsent: (scope: HealthConsentScope) => void;
  onOpenRequest: () => void;
}) => {
  const dossierQuery = useClientHealth(clientId, { emergency });
  const consentsQuery = useClientHealthConsents(clientId);
  const historyQuery = useClientHealthHistory(clientId, { limit: 15, order: 'desc' });

  if (!clientId) {
    return (
      <Card>
        <EmptyState
          title="Aucun client sélectionné"
          description="Choisissez un dossier client pour afficher son suivi de santé."
          icon={<HeartPulse className="h-5 w-5" />}
        />
      </Card>
    );
  }

  const consents = consentsQuery.data ?? [];
  const activeScopes = consents.filter((consent) => consent.active).map((consent) => consent.scope);
  const consentRefused =
    dossierQuery.isError && String((dossierQuery.error as Error)?.message ?? '').includes('consentement');
  const hasHistory = (historyQuery.data?.total ?? 0) > 0;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Consentement du client"
          description="Sans consentement valide, l'accès aux données de santé est refusé au personnel — sauf urgence vitale, alors tracée."
          icon={activeScopes.length > 0 ? <ShieldCheck className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                icon={emergency ? <Unlock className="h-4 w-4" /> : <Siren className="h-4 w-4" />}
                onClick={() => onEmergencyChange(!emergency)}
                disabled={!isHealthStaff}
              >
                {emergency ? 'Quitter le mode urgence' : "Accès d'urgence"}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon={<Stethoscope className="h-4 w-4" />}
                onClick={onOpenRequest}
              >
                Demande de soin
              </Button>
            </div>
          }
        />
        <CardBody className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {CONSENT_SCOPES.map((scope) => {
              const active = activeScopes.includes(scope);
              return (
                <div
                  key={scope}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-800"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-800 dark:text-slate-200">
                      {describe(HEALTH_CONSENT_SCOPE, scope).label}
                    </p>
                    <Badge tone={active ? 'success' : 'neutral'}>{active ? 'Actif' : 'Absent'}</Badge>
                  </div>
                  <Button
                    variant={active ? 'ghost' : 'secondary'}
                    size="sm"
                    onClick={() => (active ? onRevokeConsent(scope) : onGrantConsent(scope))}
                  >
                    {active ? 'Retirer' : 'Accorder'}
                  </Button>
                </div>
              );
            })}
          </div>

          {consents.length > 0 ? (
            <div className="space-y-2">
              {consents.slice(0, 4).map((consent) => (
                <div
                  key={consent.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs dark:bg-slate-800/60"
                >
                  <span className="text-slate-600 dark:text-slate-300">
                    {describe(HEALTH_CONSENT_SCOPE, consent.scope).label} ·{' '}
                    {describe(HEALTH_CONSENT_CHANNEL, consent.channel).label}
                  </span>
                  <span className="text-slate-500 dark:text-slate-400">
                    {formatDateTime(consent.grantedAt)}
                    {consent.expiresAt ? ` → ${formatDateTime(consent.expiresAt)}` : ' · sans limite'}
                  </span>
                  <Badge tone={describe(HEALTH_CONSENT_STATUS, consent.status).tone}>
                    {describe(HEALTH_CONSENT_STATUS, consent.status).label}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Aucun consentement enregistré pour ce client.
            </p>
          )}

          {consentRefused ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
              Accès refusé : le client n&apos;a pas donné son consentement. Accordez le partage des mesures, ou
              utilisez l&apos;accès d&apos;urgence (motif vital, accès journalisé).
            </div>
          ) : null}
        </CardBody>
      </Card>

      {dossierQuery.isLoading ? (
        <Skeleton className="h-52 w-full" />
      ) : dossierQuery.isError || !dossierQuery.data ? (
        !consentRefused ? (
          <Card>
            <ErrorState onRetry={() => void dossierQuery.refetch()} />
          </Card>
        ) : null
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {dossierQuery.data.vitals.length === 0 ? (
              <Card className="sm:col-span-2 xl:col-span-3">
                <EmptyState
                  title="Aucune mesure enregistrée"
                  description="Saisissez une première mesure pour ouvrir le suivi préventif de ce client."
                  icon={<Activity className="h-5 w-5" />}
                />
              </Card>
            ) : (
              dossierQuery.data.vitals.map((vital) => (
                <Card key={vital.metric} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
                        {describe(HEALTH_METRIC, vital.metric).label}
                      </p>
                      <p className="mt-1 text-2xl font-semibold text-slate-900 tabular-nums dark:text-white">
                        {vital.metric === 'BLOOD_PRESSURE'
                          ? `${vital.value}/${vital.secondaryValue ?? '—'}`
                          : vital.value}{' '}
                        <span className="text-sm font-normal text-slate-500 dark:text-slate-400">
                          {vital.unit}
                        </span>
                      </p>
                    </div>
                    <Badge tone={describe(HEALTH_READING_STATUS, vital.status).tone}>
                      {describe(HEALTH_READING_STATUS, vital.status).label}
                    </Badge>
                  </div>
                  <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">{vital.label}</p>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{vital.advice}</p>
                  <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                    <span>{describe(HEALTH_TREND, vital.trend).label}</span>
                    <span>
                      {vital.sampleCount} mesure(s) · {formatRelative(vital.measuredAt)}
                    </span>
                  </div>
                </Card>
              ))
            )}
          </div>

          {dossierQuery.data.criticalReadings.length > 0 ? (
            <Card>
              <CardHeader
                title="Valeurs critiques récentes"
                description="Chaque valeur critique a ouvert (ou ouvert) une alerte MEDICALE dans la file du ZMC."
                icon={<AlertTriangle className="h-4 w-4" />}
              />
              <TableWrap>
                <THead>
                  <TR>
                    <TH>Date</TH>
                    <TH>Grandeur</TH>
                    <TH>Valeur</TH>
                    <TH>Qualification</TH>
                    <TH>Alerte ZMC</TH>
                  </TR>
                </THead>
                <TBody>
                  {dossierQuery.data.criticalReadings.map((measurement) => (
                    <TR key={measurement.id}>
                      <TD>{formatDateTime(measurement.measuredAt)}</TD>
                      <TD>{describe(HEALTH_METRIC, measurement.metric).label}</TD>
                      <TD>
                        {measurement.metric === 'BLOOD_PRESSURE'
                          ? `${measurement.value}/${measurement.secondaryValue ?? '—'}`
                          : measurement.value}{' '}
                        {measurement.unit}
                      </TD>
                      <TD>
                        <Badge tone={describe(HEALTH_READING_STATUS, measurement.status).tone}>
                          {measurement.label}
                        </Badge>
                      </TD>
                      <TD>
                        {measurement.alertId ? (
                          <span className="font-mono text-[11px] text-rose-600 dark:text-rose-400">
                            {measurement.alertId.slice(0, 8)}…
                          </span>
                        ) : (
                          <span className="text-xs text-slate-500 dark:text-slate-400">—</span>
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </TableWrap>
            </Card>
          ) : null}
        </>
      )}

      <Card>
        <CardHeader
          title="Historique des mesures"
          description={
            client
              ? `${client.zengoId} · ${client.fullName}`
              : 'Dernières mesures enregistrées pour ce dossier.'
          }
          icon={<Activity className="h-4 w-4" />}
        />
        {historyQuery.isLoading ? (
          <TableSkeleton rows={5} columns={5} />
        ) : hasHistory ? (
          <TableWrap>
            <THead>
              <TR>
                <TH>Date</TH>
                <TH>Grandeur</TH>
                <TH>Valeur</TH>
                <TH>Origine</TH>
                <TH>Qualification</TH>
              </TR>
            </THead>
            <TBody>
              {(historyQuery.data?.items ?? []).map((measurement) => (
                <TR key={measurement.id}>
                  <TD>{formatDateTime(measurement.measuredAt)}</TD>
                  <TD>{describe(HEALTH_METRIC, measurement.metric).label}</TD>
                  <TD>
                    {measurement.metric === 'BLOOD_PRESSURE'
                      ? `${measurement.value}/${measurement.secondaryValue ?? '—'}`
                      : measurement.value}{' '}
                    {measurement.unit}
                    {measurement.fasting ? (
                      <span className="ml-1 text-[11px] text-slate-500 dark:text-slate-400">à jeun</span>
                    ) : null}
                  </TD>
                  <TD>
                    <span className="text-xs text-slate-600 dark:text-slate-300">
                      {describe(HEALTH_SOURCE, measurement.source).label}
                    </span>
                    {measurement.recordedByLabel ? (
                      <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                        {measurement.recordedByLabel}
                      </p>
                    ) : null}
                  </TD>
                  <TD>
                    <Badge tone={describe(HEALTH_READING_STATUS, measurement.status).tone}>
                      {describe(HEALTH_READING_STATUS, measurement.status).label}
                    </Badge>
                    <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{measurement.label}</p>
                  </TD>
                </TR>
              ))}
            </TBody>
          </TableWrap>
        ) : (
          <EmptyState
            title="Aucune mesure"
            description="Ce dossier n'a pas encore de mesure de santé enregistrée."
            icon={<Activity className="h-5 w-5" />}
          />
        )}
      </Card>
    </div>
  );
};

/** Journal d'accès aux données de santé (contrepartie du consentement). */
const HealthAccessLogCard = ({ clientId }: { clientId: string | undefined }) => {
  const logsQuery = useClientHealthAccessLogs(clientId, { limit: 25 });

  if (!clientId) {
    return (
      <Card>
        <EmptyState
          title="Aucun client sélectionné"
          description="Le journal d'accès est propre à chaque dossier."
          icon={<ShieldCheck className="h-5 w-5" />}
        />
      </Card>
    );
  }

  const items = logsQuery.data?.items ?? [];

  return (
    <Card>
      <CardHeader
        title="Journal d'accès aux données de santé"
        description="Qui a consulté, exporté ou partagé le dossier, quand et pour quel motif. Les accès d'urgence sont distingués."
        icon={<ShieldCheck className="h-4 w-4" />}
      />
      {logsQuery.isLoading ? (
        <TableSkeleton rows={5} columns={4} />
      ) : logsQuery.isError ? (
        <ErrorState onRetry={() => void logsQuery.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          title="Aucun accès enregistré"
          description="Aucune consultation n'a encore été tracée pour ce dossier."
          icon={<ShieldCheck className="h-5 w-5" />}
        />
      ) : (
        <TableWrap>
          <THead>
            <TR>
              <TH>Date</TH>
              <TH>Action</TH>
              <TH>Acteur</TH>
              <TH>Motif</TH>
            </TR>
          </THead>
          <TBody>
            {items.map((log) => (
              <TR key={log.id}>
                <TD>{formatDateTime(log.occurredAt)}</TD>
                <TD>
                  <Badge tone={describe(HEALTH_ACCESS_ACTION, log.action).tone}>
                    {describe(HEALTH_ACCESS_ACTION, log.action).label}
                  </Badge>
                </TD>
                <TD>
                  <span className="text-xs text-slate-600 dark:text-slate-300">{log.actorLabel}</span>
                  <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{log.actorRole ?? '—'}</p>
                </TD>
                <TD>
                  <span className="text-xs text-slate-600 dark:text-slate-300">{log.reason}</span>
                  {log.detail ? (
                    <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{log.detail}</p>
                  ) : null}
                </TD>
              </TR>
            ))}
          </TBody>
        </TableWrap>
      )}
    </Card>
  );
};

/** Détail d'une demande de soin : fil de messages et actions de prise en charge. */
const NurseRequestDrawer = ({
  requestId,
  onClose,
  onChanged,
}: {
  requestId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) => {
  const pushToast = useUiStore((state) => state.pushToast);
  const hasRole = useAuthStore((state) => state.hasRole);
  const canManage = hasRole('HEALTH_STAFF', 'SUPER_ADMIN', 'NATIONAL_DIRECTOR');

  const requestsQuery = useNurseRequests({ page: 1, limit: 50 });
  const request = (requestsQuery.data?.items ?? []).find((item) => item.id === requestId) ?? null;

  const [message, setMessage] = useState('');
  const [resolution, setResolution] = useState('');
  const [advice, setAdvice] = useState('');
  const [completeOpen, setCompleteOpen] = useState(false);

  const act = useMutation({
    mutationFn: async (action: { path: string; body?: unknown }) =>
      api.patch(`/healthcare/nurse-requests/${requestId}${action.path}`, action.body ?? {}),
    onSuccess: () => {
      pushToast({ tone: 'success', title: 'Demande mise à jour' });
      setCompleteOpen(false);
      setResolution('');
      setAdvice('');
      onChanged();
    },
    onError: (error: Error) =>
      pushToast({ tone: 'danger', title: 'Action refusée', description: error.message }),
  });

  const sendMessage = useMutation({
    mutationFn: () =>
      api.post(`/healthcare/nurse-requests/${requestId}/messages`, { body: message }),
    onSuccess: () => {
      setMessage('');
      onChanged();
    },
    onError: (error: Error) =>
      pushToast({ tone: 'danger', title: 'Message refusé', description: error.message }),
  });

  return (
    <>
      <Drawer open={Boolean(requestId)} onClose={onClose} width="lg">
        {!request ? (
          <div className="p-5">
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <div className="flex h-full flex-col">
            <header className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-sm text-slate-500 dark:text-slate-400">{request.reference}</p>
                  <h2 className="mt-0.5 text-lg font-semibold text-slate-900 dark:text-white">
                    {request.client.fullName}
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {request.client.zengoId} · {request.client.primaryPhone}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge tone={describe(NURSE_REQUEST_PRIORITY, request.priority).tone}>
                    {describe(NURSE_REQUEST_PRIORITY, request.priority).label}
                  </Badge>
                  <Badge tone={describe(NURSE_REQUEST_STATUS, request.status).tone}>
                    {describe(NURSE_REQUEST_STATUS, request.status).label}
                  </Badge>
                </div>
              </div>
            </header>

            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
              <DescriptionList>
                <DataRow label="Motif" value={request.reason} />
                <DataRow label="Symptômes" value={request.symptoms ?? '—'} />
                <DataRow label="Demandeur" value={request.requestedByLabel ?? '—'} />
                <DataRow label="Ouverte" value={formatDateTime(request.createdAt)} />
                <DataRow
                  label="Échéance de prise en charge"
                  value={
                    <span className={request.late ? 'text-rose-600 dark:text-rose-400' : undefined}>
                      {formatDateTime(request.responseDueAt)}
                      {request.late ? ' (dépassée)' : ''}
                    </span>
                  }
                />
                <DataRow label="Prise en charge par" value={request.assignedToLabel ?? '—'} />
                <DataRow label="Alerte ZMC" value={request.alertId ? `${request.alertId.slice(0, 8)}…` : '—'} />
                {request.resolution ? <DataRow label="Conclusion" value={request.resolution} /> : null}
                {request.advice ? <DataRow label="Conseils au client" value={request.advice} /> : null}
              </DescriptionList>

              <div>
                <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
                  Fil de suivi
                </p>
                <div className="space-y-2">
                  {request.messages.map((entry, index) => (
                    <div
                      key={`${entry.at}-${index}`}
                      className={
                        entry.authorSide === 'SYSTEM'
                          ? 'rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 italic dark:bg-slate-800/60 dark:text-slate-400'
                          : 'rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-800'
                      }
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
                          {entry.authorLabel}
                        </span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                          {formatRelative(entry.at)}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">{entry.body}</p>
                    </div>
                  ))}
                </div>

                {request.status !== 'COMPLETED' && request.status !== 'CANCELLED' ? (
                  <div className="mt-3 flex items-end gap-2">
                    <div className="flex-1">
                      <Field label="Répondre au fil">
                        <Textarea
                          rows={2}
                          value={message}
                          onChange={(event) => setMessage(event.target.value)}
                          placeholder="Conseil, question complémentaire…"
                        />
                      </Field>
                    </div>
                    <Button
                      icon={<Send className="h-4 w-4" />}
                      loading={sendMessage.isPending}
                      disabled={message.trim().length === 0}
                      onClick={() => sendMessage.mutate()}
                    >
                      Envoyer
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>

            <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-5 py-3 dark:border-slate-800">
              {request.status !== 'COMPLETED' && request.status !== 'CANCELLED' ? (
                <>
                  {request.status === 'REQUESTED' ? (
                    <Button
                      variant="secondary"
                      icon={<Stethoscope className="h-4 w-4" />}
                      disabled={!canManage}
                      loading={act.isPending}
                      onClick={() => act.mutate({ path: '/accept' })}
                    >
                      Prendre en charge
                    </Button>
                  ) : null}
                  <Button
                    icon={<ShieldCheck className="h-4 w-4" />}
                    disabled={!canManage}
                    onClick={() => setCompleteOpen(true)}
                  >
                    Clôturer
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={!canManage && request.status !== 'REQUESTED'}
                    loading={act.isPending}
                    onClick={() =>
                      act.mutate({
                        path: '/cancel',
                        body: { reason: 'Annulée depuis la console de santé.' },
                      })
                    }
                  >
                    Annuler la demande
                  </Button>
                </>
              ) : (
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Demande close le {formatDateTime(request.completedAt ?? request.cancelledAt)}
                </span>
              )}
            </footer>
          </div>
        )}
      </Drawer>

      <Modal
        open={completeOpen}
        onClose={() => setCompleteOpen(false)}
        title="Clôturer la demande de soin"
        description="La conclusion et les conseils sont conservés dans le dossier et notifiés au client."
        footer={
          <>
            <Button variant="ghost" onClick={() => setCompleteOpen(false)}>
              Annuler
            </Button>
            <Button
              icon={<ShieldCheck className="h-4 w-4" />}
              loading={act.isPending}
              disabled={resolution.trim().length < 3}
              onClick={() =>
                act.mutate({
                  path: '/complete',
                  body: { resolution, advice: advice || undefined },
                })
              }
            >
              Clôturer la demande
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Conclusion" required>
            <Textarea
              rows={3}
              value={resolution}
              onChange={(event) => setResolution(event.target.value)}
              placeholder="Constat, actes réalisés, transmission éventuelle au médecin…"
            />
          </Field>
          <Field label="Conseils délivrés au client">
            <Textarea
              rows={2}
              value={advice}
              onChange={(event) => setAdvice(event.target.value)}
              placeholder="Surveillance, recontrôle, signes d'alerte…"
            />
          </Field>
        </div>
      </Modal>
    </>
  );
};
