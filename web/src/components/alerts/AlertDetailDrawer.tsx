import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BadgeCheck,
  Ban,
  CheckCircle2,
  ChevronRight,
  Clock,
  Flame,
  HeartPulse,
  MapPin,
  MessageSquarePlus,
  Phone,
  PhoneCall,
  Radio,
  Route,
  Send,
  ShieldAlert,
  Siren,
  TriangleAlert,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, DataRow, DescriptionList } from '@/components/ui/Card';
import { EmptyState, ErrorState, InlineEmpty, Skeleton } from '@/components/ui/Feedback';
import { Field, Select, Textarea } from '@/components/ui/Field';
import { Drawer, Modal } from '@/components/ui/Modal';
import { Tabs } from '@/components/ui/Tabs';
import { useAlert, useAlertStations, useAlertTimeline, useAlertVoiceCalls, useInterventionsByAlert } from '@/hooks/queries';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatCoordinates, formatDateTime, formatDistance, formatDuration, formatRelative, formatTime } from '@/lib/format';
import {
  ALERT_EVENT,
  ALERT_RESOLUTION,
  ALERT_SEVERITY,
  ALERT_SOURCE,
  ALERT_STATUS,
  ALERT_TYPE,
  ARM_MODE,
  DEVICE_STATUS,
  DISPATCH_STATUS,
  INTERVENTION_STATUS,
  LANGUAGE,
  SUB_DEVICE_CODE,
  SUBSCRIPTION_STATUS,
  STATION_TYPE,
  VOICE_CALL_OUTCOME,
  VOICE_CALL_STATUS,
  describe,
} from '@/lib/labels';
import { useAuthStore } from '@/store/auth';
import { useUiStore } from '@/store/ui';
import type { Alert, AlertResolution, DispatchStatus } from '@/types/api';

const OPEN_STATUSES: Alert['status'][] = ['NEW', 'ACKNOWLEDGED', 'ASSIGNED', 'IN_PROGRESS'];

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

const RESOLUTIONS: AlertResolution[] = [
  'CLIENT_CONFIRMED',
  'HANDLED_BY_TEAM',
  'NO_ACTION_REQUIRED',
  'TECHNICAL_ISSUE',
  'MAINTENANCE_TEST',
];

const TypeGlyph = ({ type }: { type: Alert['type'] }) => {
  const className = 'h-5 w-5';
  if (type === 'FIRE') return <Flame className={cn(className, 'text-red-500')} />;
  if (type === 'MEDICAL') return <HeartPulse className={cn(className, 'text-rose-500')} />;
  if (type === 'GAS_LEAK' || type === 'WATER_LEAK') return <TriangleAlert className={cn(className, 'text-orange-500')} />;
  if (type === 'PANIC') return <Siren className={cn(className, 'text-red-600')} />;
  return <ShieldAlert className={cn(className, 'text-amber-500')} />;
};

export const AlertDetailDrawer = ({ alertId, onClose }: { alertId: string | null; onClose: () => void }) => {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((state) => state.pushToast);
  const hasRole = useAuthStore((state) => state.hasRole);
  const canOperate = hasRole(...OPERATOR_ROLES);

  const [tab, setTab] = useState('dossier');
  const [noteDraft, setNoteDraft] = useState('');
  const [resolveOpen, setResolveOpen] = useState(false);
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [resolution, setResolution] = useState<AlertResolution>('HANDLED_BY_TEAM');
  const [resolutionNote, setResolutionNote] = useState('');
  const [selectedStations, setSelectedStations] = useState<string[]>([]);

  const alertQuery = useAlert(alertId ?? undefined);
  const timelineQuery = useAlertTimeline(alertId ?? undefined);
  const callsQuery = useAlertVoiceCalls(alertId ?? undefined);
  const missionsQuery = useInterventionsByAlert(alertId ?? undefined);
  const alert = alertQuery.data;

  const stationsQuery = useAlertStations(dispatchOpen ? alert?.organizationId : null);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['alerts'] });
  };

  const reportError = (message: string) => pushToast({ tone: 'danger', title: 'Action refusée', description: message });

  const action = useMutation({
    mutationFn: async (input: { path: 'acknowledge' | 'escalate' | 'cancel' | 'false-alarm' | 'notes'; body?: unknown }) =>
      api.post(`/alerts/${alertId}/${input.path}`, input.body ?? {}),
    onSuccess: (_data, variables) => {
      invalidate();
      const labels: Record<string, string> = {
        acknowledge: 'Alerte prise en charge',
        escalate: 'Escalade transmise',
        cancel: "Alerte annulée",
        'false-alarm': 'Classée en faux positif',
        notes: 'Note ajoutée au dossier',
      };
      pushToast({ tone: 'success', title: labels[variables.path] ?? 'Action enregistrée' });
    },
    onError: (error: Error) => reportError(error.message),
  });

  const dispatch = useMutation({
    mutationFn: async (stationIds: string[]) =>
      api.post(`/alerts/${alertId}/dispatch`, stationIds.length ? { stationIds } : {}),
    onSuccess: () => {
      invalidate();
      setDispatchOpen(false);
      setSelectedStations([]);
      pushToast({
        tone: 'brand',
        title: 'Mission transmise',
        description: 'Les stations selectionnees ont ete notifiées.',
      });
    },
    onError: (error: Error) => reportError(error.message),
  });

  const resolve = useMutation({
    mutationFn: async () => api.post(`/alerts/${alertId}/resolve`, { resolution, note: resolutionNote || undefined }),
    onSuccess: () => {
      invalidate();
      setResolveOpen(false);
      setResolutionNote('');
      pushToast({ tone: 'success', title: 'Alerte clôturée', description: 'Le compte rendu a été enregistré.' });
    },
    onError: (error: Error) => reportError(error.message),
  });

  const updateDispatch = useMutation({
    mutationFn: async (input: { dispatchId: string; status: DispatchStatus }) =>
      api.patch(`/alerts/${alertId}/dispatches/${input.dispatchId}`, { status: input.status }),
    onSuccess: () => {
      invalidate();
      pushToast({ tone: 'success', title: 'Statut de mission mis à jour' });
    },
    onError: (error: Error) => reportError(error.message),
  });

  const isOpen = alert ? OPEN_STATUSES.includes(alert.status) : false;

  return (
    <>
      <Drawer open={Boolean(alertId)} onClose={onClose} width="lg">
        {alertQuery.isLoading ? (
          <div className="space-y-3 p-6">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : alertQuery.isError || !alert ? (
          <div className="p-6">
            <ErrorState message="Cette alerte est introuvable ou hors de votre périmètre." onRetry={() => void alertQuery.refetch()} />
          </div>
        ) : (
          <>
            {/* En-tete */}
            <header className="border-b border-slate-200 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800">
                    <TypeGlyph type={alert.type} />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-mono text-sm font-semibold text-slate-900 dark:text-white">{alert.reference}</h2>
                      <Badge tone={describe(ALERT_SEVERITY, alert.severity).tone}>
                        {describe(ALERT_SEVERITY, alert.severity).label}
                      </Badge>
                      <Badge tone={describe(ALERT_STATUS, alert.status).tone} dot>
                        {describe(ALERT_STATUS, alert.status).label}
                      </Badge>
                      {alert.occurrenceCount > 1 ? <Badge tone="warning">×{alert.occurrenceCount} déclenchements</Badge> : null}
                    </div>
                    <p className="mt-1 truncate text-sm text-slate-600 dark:text-slate-300">
                      {describe(ALERT_TYPE, alert.type).label} · {alert.client?.fullName ?? 'Client non rattaché'}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      Déclenchée {formatRelative(alert.openedAt)} ({formatDateTime(alert.openedAt)}) ·{' '}
                      {describe(ALERT_SOURCE, alert.source).label}
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fermer">
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Barre d'actions opérateur */}
              {canOperate ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<BadgeCheck className="h-3.5 w-3.5" />}
                    disabled={!isOpen || alert.status !== 'NEW' || action.isPending}
                    onClick={() => action.mutate({ path: 'acknowledge' })}
                  >
                    Prendre en charge
                  </Button>
                  <Button
                    size="sm"
                    icon={<Send className="h-3.5 w-3.5" />}
                    disabled={!isOpen}
                    onClick={() => setDispatchOpen(true)}
                  >
                    Engager les secours
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    icon={<Radio className="h-3.5 w-3.5" />}
                    disabled={!isOpen || action.isPending}
                    onClick={() => action.mutate({ path: 'escalate', body: { reason: 'Escalade manuelle depuis la console.' } })}
                  >
                    Escalader
                  </Button>
                  <Button
                    size="sm"
                    variant="success"
                    icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                    disabled={!isOpen}
                    onClick={() => setResolveOpen(true)}
                  >
                    Clôturer
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Ban className="h-3.5 w-3.5" />}
                    disabled={!isOpen || action.isPending}
                    onClick={() => action.mutate({ path: 'false-alarm', body: { resolution: 'TECHNICAL_ISSUE' } })}
                  >
                    Faux positif
                  </Button>
                </div>
              ) : null}
            </header>

            <div className="px-5 pt-3">
              <Tabs
                items={[
                  { id: 'dossier', label: 'Dossier' },
                  { id: 'chronologie', label: 'Chronologie', count: timelineQuery.data?.length },
                  { id: 'appels', label: 'Appels IA', count: callsQuery.data?.length },
                ]}
                value={tab}
                onChange={setTab}
              />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {tab === 'dossier' ? (
                <div className="space-y-4">
                  {/* Missions engagees (iteration 3) */}
                  <Card>
                    <CardHeader
                      title="Missions engagées"
                      description="Équipes terrain en charge de cette alerte"
                      icon={<Route className="h-4 w-4" />}
                      actions={
                        <Link
                          to={`/missions?search=${encodeURIComponent(alert.reference)}`}
                          className="text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400"
                        >
                          Suivi des missions
                        </Link>
                      }
                    />
                    {missionsQuery.isLoading ? (
                      <div className="p-4">
                        <Skeleton className="h-12 w-full" />
                      </div>
                    ) : (missionsQuery.data?.length ?? 0) === 0 ? (
                      <InlineEmpty>
                        Aucune équipe engagée. Utilisez « Engager les secours » puis l'écran Missions pour désigner
                        une équipe.
                      </InlineEmpty>
                    ) : (
                      <CardBody className="space-y-2 pt-3">
                        {missionsQuery.data?.map((mission) => (
                          <Link
                            key={mission.id}
                            to={`/missions/${mission.id}`}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                                {mission.team?.name ?? 'Équipe'}{' '}
                                <span className="font-mono text-xs text-slate-400">{mission.reference}</span>
                              </p>
                              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                {mission.distanceMeters !== null ? `${formatDistance(mission.distanceMeters)} · ` : ''}
                                engagée {formatRelative(mission.assignedAt)}
                                {mission.report ? ' · rapport déposé' : ''}
                              </p>
                            </div>
                            <Badge tone={describe(INTERVENTION_STATUS, mission.status).tone} dot={!mission.completedAt}>
                              {describe(INTERVENTION_STATUS, mission.status).label}
                            </Badge>
                          </Link>
                        ))}
                      </CardBody>
                    )}
                  </Card>

                  {/* Affectations */}
                  <Card>
                    <CardHeader
                      title="Équipes engagees"
                      description="Stations du point de distribution notifiées"
                      icon={<Siren className="h-4 w-4" />}
                    />
                    {alert.dispatches?.length ? (
                      <CardBody className="space-y-2 pt-3">
                        {alert.dispatches.map((item) => (
                          <div
                            key={item.id}
                            className="rounded-xl border border-slate-200 p-3 dark:border-slate-800"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                                  {item.station?.name ?? 'Station'}
                                  {item.isEscalation ? (
                                    <span className="ml-2 align-middle">
                                      <Badge tone="critical">Escalade</Badge>
                                    </span>
                                  ) : null}
                                </p>
                                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                  Notifiée {formatRelative(item.notifiedAt)}
                                  {item.respondedAt ? ` · réponse ${formatRelative(item.respondedAt)}` : ''}
                                </p>
                              </div>
                              <Badge tone={describe(DISPATCH_STATUS, item.status).tone}>
                                {describe(DISPATCH_STATUS, item.status).label}
                              </Badge>
                            </div>

                            {canOperate && isOpen && item.status !== 'COMPLETED' && item.status !== 'DECLINED' ? (
                              <div className="mt-3 flex flex-wrap gap-1.5">
                                {(['ACKNOWLEDGED', 'ARRIVED', 'COMPLETED', 'DECLINED'] as DispatchStatus[]).map((status) => (
                                  <Button
                                    key={status}
                                    size="sm"
                                    variant="outline"
                                    disabled={updateDispatch.isPending}
                                    onClick={() => updateDispatch.mutate({ dispatchId: item.id, status })}
                                  >
                                    {describe(DISPATCH_STATUS, status).label}
                                  </Button>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </CardBody>
                    ) : (
                      <InlineEmpty>Aucune équipe engagée pour l'instant.</InlineEmpty>
                    )}
                  </Card>

                  {/* Client & localisation */}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Card>
                      <CardHeader title="Client" icon={<Phone className="h-4 w-4" />} />
                      <CardBody className="pt-2">
                        <DescriptionList>
                          <DataRow
                            label="Titulaire"
                            value={
                              alert.client ? (
                                <Link
                                  to={`/clients/${alert.client.id}`}
                                  className="inline-flex items-center gap-1 text-brand-600 hover:underline dark:text-brand-400"
                                >
                                  {alert.client.fullName}
                                  <ChevronRight className="h-3.5 w-3.5" />
                                </Link>
                              ) : (
                                '—'
                              )
                            }
                          />
                          <DataRow label="ID Zengo" value={<span className="font-mono">{alert.client?.zengoId ?? '—'}</span>} />
                          <DataRow label="Téléphone" value={alert.client?.primaryPhone ?? '—'} />
                          <DataRow label="Langue" value={LANGUAGE[alert.client?.preferredLanguage ?? 'fr'] ?? '—'} />
                          <DataRow
                            label="Abonnement"
                            value={
                              alert.client ? (
                                <Badge tone={describe(SUBSCRIPTION_STATUS, alert.client.subscriptionStatus).tone}>
                                  {describe(SUBSCRIPTION_STATUS, alert.client.subscriptionStatus).label}
                                </Badge>
                              ) : (
                                '—'
                              )
                            }
                          />
                        </DescriptionList>
                      </CardBody>
                    </Card>

                    <Card>
                      <CardHeader title="Localisation & equipement" icon={<MapPin className="h-4 w-4" />} />
                      <CardBody className="pt-2">
                        <DescriptionList>
                          <DataRow label="Adresse" value={alert.address ?? alert.client?.address ?? '—'} />
                          <DataRow label="Ville" value={alert.city ?? alert.client?.city ?? '—'} />
                          <DataRow
                            label="Coordonnees"
                            value={
                              <span className="font-mono text-xs">
                                {formatCoordinates(alert.latitude ?? alert.client?.latitude, alert.longitude ?? alert.client?.longitude)}
                              </span>
                            }
                          />
                          <DataRow
                            label="Centrale"
                            value={alert.device ? <span className="font-mono">{alert.device.serialNumber}</span> : '—'}
                          />
                          <DataRow
                            label="État"
                            value={
                              alert.device ? (
                                <span className="flex items-center justify-end gap-1.5">
                                  <Badge tone={describe(DEVICE_STATUS, alert.device.status).tone}>
                                    {describe(DEVICE_STATUS, alert.device.status).label}
                                  </Badge>
                                  <Badge tone={describe(ARM_MODE, alert.device.armMode).tone}>
                                    {describe(ARM_MODE, alert.device.armMode).label}
                                  </Badge>
                                </span>
                              ) : (
                                '—'
                              )
                            }
                          />
                          <DataRow
                            label="Sous-appareil"
                            value={
                              alert.subDeviceCode
                                ? `${describe(SUB_DEVICE_CODE, alert.subDeviceCode).label} (${alert.subDeviceCode})`
                                : (alert.rawType ?? '—')
                            }
                          />
                        </DescriptionList>
                      </CardBody>
                    </Card>
                  </div>

                  {/* Contexte et notes */}
                  <Card>
                    <CardHeader title="Contexte de l'alerte" icon={<MessageSquarePlus className="h-4 w-4" />} />
                    <CardBody className="space-y-3 pt-3">
                      <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:bg-slate-800/60 dark:text-slate-200">
                        {alert.triggerMessage ?? 'Aucun message transmis par le dispositif.'}
                      </p>
                      {alert.resolutionNote ? (
                        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
                          <strong className="font-semibold">Compte rendu :</strong> {alert.resolutionNote}
                        </p>
                      ) : null}
                      {alert.resolution ? (
                        <DataRow label="Classement" value={describe(ALERT_RESOLUTION, alert.resolution).label} />
                      ) : null}
                      <DataRow label="Confirmation client" value={alert.clientConfirmed ? 'Confirmée' : 'Non confirmée'} />
                      <DataRow label="Appel vocal" value={describe(VOICE_CALL_OUTCOME, alert.voiceCallOutcome).label} />

                      {canOperate ? (
                        <div className="space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                          <Textarea
                            rows={2}
                            value={noteDraft}
                            onChange={(event) => setNoteDraft(event.target.value)}
                            placeholder="Ajouter une note au dossier d'intervention (visite, contact, contrainte terrain...)"
                          />
                          <div className="flex justify-end">
                            <Button
                              size="sm"
                              variant="secondary"
                              icon={<MessageSquarePlus className="h-3.5 w-3.5" />}
                              disabled={noteDraft.trim().length === 0 || action.isPending}
                              onClick={() => {
                                action.mutate({ path: 'notes', body: { note: noteDraft.trim() } });
                                setNoteDraft('');
                              }}
                            >
                              Enregistrer la note
                            </Button>
                          </div>
                        </div>
                      ) : null}
                    </CardBody>
                  </Card>
                </div>
              ) : null}

              {tab === 'chronologie' ? (
                timelineQuery.isLoading ? (
                  <Skeleton className="h-40 w-full" />
                ) : (timelineQuery.data?.length ?? 0) === 0 ? (
                  <EmptyState title="Aucun événement" icon={<Clock className="h-5 w-5" />} />
                ) : (
                  <ol className="relative space-y-4 border-l border-slate-200 pl-5 dark:border-slate-800">
                    {timelineQuery.data?.map((event) => {
                      const meta = describe(ALERT_EVENT, event.type);
                      return (
                        <li key={event.id} className="relative">
                          <span
                            className={cn(
                              'absolute top-1.5 -left-[27px] h-3 w-3 rounded-full ring-4 ring-slate-50 dark:ring-slate-950',
                              meta.tone === 'critical'
                                ? 'bg-red-600'
                                : meta.tone === 'success'
                                  ? 'bg-emerald-500'
                                  : meta.tone === 'brand'
                                    ? 'bg-brand-500'
                                    : 'bg-slate-400',
                            )}
                          />
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge tone={meta.tone}>{meta.label}</Badge>
                            <span className="text-xs text-slate-400">{formatDateTime(event.createdAt)}</span>
                          </div>
                          {event.message ? (
                            <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">{event.message}</p>
                          ) : null}
                          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                            {event.actorLabel ?? 'Système automatique'}
                          </p>
                        </li>
                      );
                    })}
                  </ol>
                )
              ) : null}

              {tab === 'appels' ? (
                callsQuery.isLoading ? (
                  <Skeleton className="h-32 w-full" />
                ) : (callsQuery.data?.length ?? 0) === 0 ? (
                  <EmptyState
                    title="Aucun appel vocal"
                    description="L appel IA n'a pas ete déclenche pour cette alerte."
                    icon={<PhoneCall className="h-5 w-5" />}
                  />
                ) : (
                  <div className="space-y-3">
                    {callsQuery.data?.map((call) => (
                      <Card key={call.id}>
                        <CardBody className="space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                                {call.toNumber}
                                <span className="ml-2 text-xs font-normal text-slate-500 dark:text-slate-400">
                                  tentative {call.attemptNumber} · {LANGUAGE[call.language] ?? call.language}
                                </span>
                              </p>
                              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                {call.provider} · lance {formatRelative(call.startedAt ?? call.createdAt)}
                                {call.durationSeconds ? ` · ${formatDuration(call.durationSeconds)}` : ''}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge tone={describe(VOICE_CALL_STATUS, call.status).tone}>
                                {describe(VOICE_CALL_STATUS, call.status).label}
                              </Badge>
                              <Badge tone={describe(VOICE_CALL_OUTCOME, call.outcome).tone}>
                                {describe(VOICE_CALL_OUTCOME, call.outcome).label}
                              </Badge>
                            </div>
                          </div>

                          <div className="grid gap-1 text-xs text-slate-600 dark:text-slate-300 sm:grid-cols-3">
                            <span>
                              Touche DTMF : <strong className="font-mono">{call.dtmfDigit ?? '—'}</strong>
                            </span>
                            <span>
                              Intention détectée : <strong>{call.detectedIntent ?? '—'}</strong>
                            </span>
                            <span>
                              Fin : <strong>{call.endedAt ? formatTime(call.endedAt) : '—'}</strong>
                            </span>
                          </div>

                          {call.transcript ? (
                            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 italic dark:bg-slate-800/60 dark:text-slate-300">
                              « {call.transcript} »
                            </p>
                          ) : null}
                          {call.errorMessage ? (
                            <p className="text-xs text-rose-600 dark:text-rose-400">{call.errorMessage}</p>
                          ) : null}
                        </CardBody>
                      </Card>
                    ))}
                  </div>
                )
              ) : null}
            </div>
          </>
        )}
      </Drawer>

      {/* Sélection des stations à engager */}
      <Modal
        open={dispatchOpen}
        onClose={() => setDispatchOpen(false)}
        title="Engager les secours"
        description="Sélectionnez les stations à notifier. Sans sélection, le système applique la règle de dispatch automatique du type d'alerte."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDispatchOpen(false)}>
              Annuler
            </Button>
            <Button
              icon={<Send className="h-4 w-4" />}
              loading={dispatch.isPending}
              onClick={() => dispatch.mutate(selectedStations)}
            >
              {selectedStations.length ? `Notifier ${selectedStations.length} station(s)` : 'Dispatch automatique'}
            </Button>
          </>
        }
      >
        {stationsQuery.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (stationsQuery.data?.length ?? 0) === 0 ? (
          <EmptyState
            title="Aucune station disponible"
            description="L'agence de rattachement du client ne possède pas encore de station d'intervention."
          />
        ) : (
          <div className="space-y-2">
            {stationsQuery.data?.map((station) => {
              const checked = selectedStations.includes(station.id);
              return (
                <label
                  key={station.id}
                  className={cn(
                    'flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-3 py-2.5 transition-colors',
                    checked
                      ? 'border-brand-300 bg-brand-50 dark:border-brand-500/40 dark:bg-brand-500/10'
                      : 'border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50',
                  )}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{station.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {station.stationType ? describe(STATION_TYPE, station.stationType).label : 'Station'}
                      {station.city ? ` · ${station.city}` : ''}
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    checked={checked}
                    onChange={() =>
                      setSelectedStations((current) =>
                        current.includes(station.id)
                          ? current.filter((id) => id !== station.id)
                          : [...current, station.id],
                      )
                    }
                  />
                </label>
              );
            })}
          </div>
        )}
      </Modal>

      {/* Clôture */}
      <Modal
        open={resolveOpen}
        onClose={() => setResolveOpen(false)}
        title="Clôturer l'alerte"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setResolveOpen(false)}>
              Annuler
            </Button>
            <Button variant="success" loading={resolve.isPending} onClick={() => resolve.mutate()}>
              Clôturer le dossier
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Classement" required>
            <Select value={resolution} onChange={(event) => setResolution(event.target.value as AlertResolution)}>
              {RESOLUTIONS.map((value) => (
                <option key={value} value={value}>
                  {describe(ALERT_RESOLUTION, value).label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Compte rendu" hint="Visible par le controle qualité et le client.">
            <Textarea
              rows={4}
              value={resolutionNote}
              onChange={(event) => setResolutionNote(event.target.value)}
              placeholder="Intervention réalisée, observations, matériel utilisé..."
            />
          </Field>
        </div>
      </Modal>
    </>
  );
};
