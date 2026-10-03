import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  BadgeCheck,
  Ban,
  Car,
  CircleDot,
  ClipboardList,
  Clock,
  Gauge,
  MapPin,
  Navigation,
  Plus,
  Radio,
  Route,
  Search,
  Send,
  Siren,
  Timer,
  Users,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, DataRow, DescriptionList, StatCard } from '@/components/ui/Card';
import { EmptyState, ErrorState, InlineEmpty, Skeleton, TableSkeleton } from '@/components/ui/Feedback';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Drawer, Modal } from '@/components/ui/Modal';
import { Pagination, TBody, TD, TH, THead, TR, TableWrap } from '@/components/ui/Table';
import {
  useAlerts,
  useFieldTeams,
  useIntervention,
  useInterventionStats,
  useInterventionTrack,
  useInterventions,
} from '@/hooks/queries';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDistance, formatDuration, formatNumber, formatRelative, formatTime } from '@/lib/format';
import {
  ALERT_SEVERITY,
  ALERT_TYPE,
  FIELD_TEAM_STATUS,
  INTERVENTION_ABORT_REASON,
  INTERVENTION_OUTCOME,
  INTERVENTION_STATUS,
  STATION_TYPE,
  TEAM_POSITION_SOURCE,
  describe,
} from '@/lib/labels';
import { useAuthStore } from '@/store/auth';
import { useUiStore } from '@/store/ui';
import type { InterventionAbortReason, InterventionOutcome, InterventionStatus } from '@/types/api';

const PILOT_ROLES = [
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

const FIELD_ROLES = [...PILOT_ROLES, 'FIELD_AGENT', 'HEALTH_STAFF'] as const;

const STATUSES: InterventionStatus[] = ['ASSIGNED', 'EN_ROUTE', 'ON_SITE', 'COMPLETED', 'ABORTED'];

const OUTCOMES: InterventionOutcome[] = [
  'RESOLVED_ON_SITE',
  'FALSE_ALARM_ON_SITE',
  'NO_ACTION_REQUIRED',
  'DAMAGE_REPORTED',
  'HANDOVER_TO_AUTHORITIES',
  'CLIENT_ABSENT',
  'EQUIPMENT_ISSUE',
];

const ABORT_REASONS: InterventionAbortReason[] = [
  'FALSE_ALARM',
  'CLIENT_CANCELLED',
  'NO_TEAM_AVAILABLE',
  'DUPLICATE',
  'OTHER',
];

const isOpen = (status: InterventionStatus) => ['ASSIGNED', 'EN_ROUTE', 'ON_SITE'].includes(status);

export const MissionsPage = () => {
  const navigate = useNavigate();
  const { missionId } = useParams<{ missionId?: string }>();
  const queryClient = useQueryClient();
  const pushToast = useUiStore((state) => state.pushToast);
  const hasRole = useAuthStore((state) => state.hasRole);
  const canPilot = hasRole(...PILOT_ROLES);
  const canAdvance = hasRole(...FIELD_ROLES);

  const [page, setPage] = useState(1);
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [openOnly, setOpenOnly] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignAlertId, setAssignAlertId] = useState('');
  const [assignTeamId, setAssignTeamId] = useState('');
  const [assignNote, setAssignNote] = useState('');

  const params = useMemo(
    () => ({
      page,
      limit: 20,
      order: 'desc' as const,
      ...(search ? { search } : {}),
      ...(status ? { status } : {}),
      ...(openOnly ? { openOnly: 'true' } : {}),
    }),
    [page, search, status, openOnly],
  );

  const missionsQuery = useInterventions(params);
  const statsQuery = useInterventionStats();
  const teamsQuery = useFieldTeams({ limit: 50 });
  const availableTeams = (teamsQuery.data?.items ?? []).filter((team) => team.status === 'AVAILABLE');
  const openAlertsQuery = useAlerts({ openOnly: true, limit: 50, order: 'asc' });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['interventions'] });
  const invalidateTeams = () => void queryClient.invalidateQueries({ queryKey: ['field-teams'] });

  const assign = useMutation({
    mutationFn: async () =>
      api.post<{ reference: string }>('/interventions', {
        alertId: assignAlertId,
        ...(assignTeamId ? { teamId: assignTeamId } : {}),
        ...(assignNote ? { note: assignNote } : {}),
      }),
    onSuccess: (data) => {
      invalidate();
      invalidateTeams();
      void queryClient.invalidateQueries({ queryKey: ['alerts'] });
      setAssignOpen(false);
      setAssignAlertId('');
      setAssignTeamId('');
      setAssignNote('');
      pushToast({
        tone: 'brand',
        title: 'Mission engagée',
        description: data?.reference ? `Mission ${data.reference} transmise à l'équipe.` : undefined,
      });
    },
    onError: (error: Error) => pushToast({ tone: 'danger', title: 'Engagement refusé', description: error.message }),
  });

  const stats = statsQuery.data;
  const completionRate = stats?.completionRate !== null && stats?.completionRate !== undefined
    ? `${Math.round(stats.completionRate * 100)} %`
    : '—';

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Missions en cours"
          value={stats ? formatNumber(stats.open) : '—'}
          hint="Équipes engagées sur le terrain"
          tone={stats && stats.open > 0 ? 'brand' : 'success'}
          icon={<Siren className="h-4 w-4" />}
          onClick={() => {
            setOpenOnly(true);
            setStatus('');
            setPage(1);
          }}
        />
        <StatCard
          label="Missions en retard"
          value={stats ? formatNumber(stats.delayed) : '—'}
          hint="Départ ou arrivée hors délai"
          tone={stats && stats.delayed > 0 ? 'critical' : 'success'}
          icon={<Timer className="h-4 w-4" />}
        />
        <StatCard
          label="Délai moyen d'arrivée"
          value={formatDuration(stats?.averageResponseSeconds ?? null)}
          hint="De l'affectation à l'arrivée sur site"
          tone="info"
          icon={<Gauge className="h-4 w-4" />}
        />
        <StatCard
          label="Taux de réalisation"
          value={completionRate}
          hint={stats ? `${formatNumber(stats.last24h)} mission(s) sur 24 h` : undefined}
          tone="success"
          icon={<BadgeCheck className="h-4 w-4" />}
        />
      </div>

      <Card>
        <CardBody className="space-y-3 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <form
              className="relative min-w-[240px] flex-1"
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
                placeholder="Référence de mission, alerte, équipe, client..."
                className="pl-9"
              />
            </form>

            <button
              type="button"
              onClick={() => {
                setOpenOnly((current) => !current);
                setPage(1);
              }}
              className={cn(
                'rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                openOnly
                  ? 'border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-500/40 dark:bg-brand-500/10 dark:text-brand-300'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800/50',
              )}
            >
              Missions en cours uniquement
            </button>

            {canPilot ? (
              <Button icon={<Plus className="h-4 w-4" />} onClick={() => setAssignOpen(true)}>
                Engager une équipe
              </Button>
            ) : null}
          </div>

          <Select
            className="sm:w-72"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Tous les statuts</option>
            {STATUSES.map((value) => (
              <option key={value} value={value}>
                {describe(INTERVENTION_STATUS, value).label}
              </option>
            ))}
          </Select>
        </CardBody>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <Card className="overflow-hidden">
          <CardHeader
            title="Journal des missions"
            description="Missions en cours d'abord, puis historique"
            icon={<ClipboardList className="h-4 w-4" />}
          />
          {missionsQuery.isLoading ? (
            <TableSkeleton rows={8} columns={6} />
          ) : missionsQuery.isError ? (
            <ErrorState onRetry={() => void missionsQuery.refetch()} />
          ) : (missionsQuery.data?.items.length ?? 0) === 0 ? (
            <EmptyState
              title="Aucune mission"
              description="Engagez une équipe depuis une alerte pour lancer une intervention."
              icon={<Siren className="h-5 w-5" />}
              action={
                canPilot ? (
                  <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setAssignOpen(true)}>
                    Engager une équipe
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <TableWrap>
                <THead>
                  <TH>Mission</TH>
                  <TH>Alerte</TH>
                  <TH>Équipe</TH>
                  <TH>Statut</TH>
                  <TH className="text-right">Trajet</TH>
                  <TH className="text-right">Engagée</TH>
                </THead>
                <TBody>
                  {missionsQuery.data?.items.map((mission) => (
                    <TR key={mission.id} onClick={() => navigate(`/missions/${mission.id}`)}>
                      <TD className="font-mono text-xs font-semibold text-slate-900 dark:text-white">
                        {mission.reference}
                        {mission.autoAssigned ? (
                          <span className="ml-1.5 rounded bg-slate-100 px-1 text-[10px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                            auto
                          </span>
                        ) : null}
                      </TD>
                      <TD className="text-xs">
                        <span className="block font-mono">{mission.alert?.reference ?? '—'}</span>
                        <span className="block text-slate-500 dark:text-slate-400">
                          {mission.alert ? describe(ALERT_TYPE, mission.alert.type).label : ''}
                        </span>
                      </TD>
                      <TD className="text-xs">
                        <span className="block font-medium text-slate-800 dark:text-slate-100">
                          {mission.team?.name ?? '—'}
                        </span>
                        <span className="block truncate text-slate-500 dark:text-slate-400">
                          {mission.team?.station?.name ?? mission.station?.name ?? ''}
                        </span>
                      </TD>
                      <TD>
                        <Badge tone={describe(INTERVENTION_STATUS, mission.status).tone} dot={isOpen(mission.status)}>
                          {describe(INTERVENTION_STATUS, mission.status).label}
                        </Badge>
                      </TD>
                      <TD className="text-right text-xs whitespace-nowrap">
                        {mission.distanceMeters !== null ? (
                          <>
                            <span className="block">{formatDistance(mission.distanceMeters)}</span>
                            <span className="block text-slate-400">
                              {mission.etaMinutes !== null ? `${mission.etaMinutes} min` : ''}
                            </span>
                          </>
                        ) : (
                          '—'
                        )}
                      </TD>
                      <TD className="text-right text-xs whitespace-nowrap text-slate-500 dark:text-slate-400">
                        {formatRelative(mission.assignedAt)}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </TableWrap>
              {missionsQuery.data ? <Pagination page={missionsQuery.data} onPageChange={setPage} /> : null}
            </>
          )}
        </Card>

        <Card className="overflow-hidden">
          <CardHeader
            title="Équipes disponibles"
            description={`${availableTeams.length} équipe(s) prête(s) à partir`}
            icon={<Users className="h-4 w-4" />}
          />
          {teamsQuery.isLoading ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : (teamsQuery.data?.items.length ?? 0) === 0 ? (
            <InlineEmpty>Aucune équipe déclarée sur votre périmètre.</InlineEmpty>
          ) : (
            <ul className="max-h-[520px] divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
              {availableTeams.map((team) => (
                <li key={team.id} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{team.name}</p>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                      {describe(STATION_TYPE, team.speciality).label} · {team.station?.name ?? '—'}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-400">
                      <MapPin className="h-3 w-3" />
                      {team.currentLatitude !== null
                        ? `${team.currentLatitude.toFixed(4)}, ${team.currentLongitude?.toFixed(4)}`
                        : 'position inconnue'}
                      {team.lastPositionAt ? ` · ${formatRelative(team.lastPositionAt)}` : ''}
                    </p>
                  </div>
                  <Badge tone={describe(FIELD_TEAM_STATUS, team.status).tone}>
                    {describe(FIELD_TEAM_STATUS, team.status).label}
                  </Badge>
                </li>
              ))}
              {availableTeams.length === 0 ? (
                <InlineEmpty>Toutes les équipes du périmètre sont engagées.</InlineEmpty>
              ) : null}
            </ul>
          )}
        </Card>
      </div>

      {/* Engagement manuel */}
      <Modal
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        title="Engager une équipe"
        description="Sans sélection d'équipe, le système engage automatiquement la plus proche du lieu de l'alerte."
        footer={
          <>
            <Button variant="ghost" onClick={() => setAssignOpen(false)}>
              Annuler
            </Button>
            <Button
              icon={<Send className="h-4 w-4" />}
              loading={assign.isPending}
              disabled={!assignAlertId}
              onClick={() => assign.mutate()}
            >
              {assignTeamId ? "Engager l'équipe" : 'Affectation automatique'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Alerte à traiter" required>
            <Select value={assignAlertId} onChange={(event) => setAssignAlertId(event.target.value)}>
              <option value="">Sélectionner une alerte ouverte…</option>
              {openAlertsQuery.data?.items.map((alert) => (
                <option key={alert.id} value={alert.id}>
                  {alert.reference} · {describe(ALERT_TYPE, alert.type).label} ·{' '}
                  {describe(ALERT_SEVERITY, alert.severity).label} · {alert.client?.fullName ?? 'client inconnu'}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Équipe" hint="Laisser vide pour l'affectation automatique (équipe la plus proche)">
            <Select value={assignTeamId} onChange={(event) => setAssignTeamId(event.target.value)}>
              <option value="">Affectation automatique</option>
              {availableTeams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name} — {describe(STATION_TYPE, team.speciality).label} ({team.station?.name ?? '—'})
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Consigne pour l'équipe">
            <Textarea
              rows={3}
              value={assignNote}
              onChange={(event) => setAssignNote(event.target.value)}
              placeholder="Accès par l'arrière du bâtiment, code portail 4412..."
            />
          </Field>
        </div>
      </Modal>

      <MissionDrawer
        missionId={missionId ?? null}
        canPilot={canPilot}
        canAdvance={canAdvance}
        onClose={() => navigate('/missions', { replace: true })}
        onChanged={() => {
          invalidate();
          invalidateTeams();
        }}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Panneau de detail d'une mission
// ---------------------------------------------------------------------------

const MissionDrawer = ({
  missionId,
  canPilot,
  canAdvance,
  onClose,
  onChanged,
}: {
  missionId: string | null;
  canPilot: boolean;
  canAdvance: boolean;
  onClose: () => void;
  onChanged: () => void;
}) => {
  const pushToast = useUiStore((state) => state.pushToast);
  const missionQuery = useIntervention(missionId ?? undefined);
  const mission = missionQuery.data;
  const trackQuery = useInterventionTrack(missionId ?? undefined, Boolean(missionId));
  const [reportOpen, setReportOpen] = useState(false);
  const [abortOpen, setAbortOpen] = useState(false);
  const [report, setReport] = useState({
    outcome: 'RESOLVED_ON_SITE' as InterventionOutcome,
    summary: '',
    actionsTaken: '',
    damages: '',
    peopleAssisted: 0,
    photos: '',
    signatureName: '',
    closeAlert: true,
    clientNotified: false,
  });
  const [abortReason, setAbortReason] = useState<InterventionAbortReason>('FALSE_ALARM');
  const [abortNote, setAbortNote] = useState('');

  const reportError = (error: Error) =>
    pushToast({ tone: 'danger', title: 'Action refusée', description: error.message });

  const advance = useMutation({
    mutationFn: async (target: 'en-route' | 'on-site') => api.post(`/interventions/${missionId}/${target}`, {}),
    onSuccess: (_data, target) => {
      onChanged();
      pushToast({
        tone: 'brand',
        title: target === 'en-route' ? 'Départ confirmé' : 'Arrivée confirmée',
      });
    },
    onError: reportError,
  });

  const submitReport = useMutation({
    mutationFn: async () =>
      api.post(`/interventions/${missionId}/report`, {
        outcome: report.outcome,
        summary: report.summary.trim(),
        ...(report.actionsTaken ? { actionsTaken: report.actionsTaken } : {}),
        ...(report.damages ? { damages: report.damages } : {}),
        peopleAssisted: Number(report.peopleAssisted) || 0,
        photos: report.photos
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean),
        ...(report.signatureName ? { signatureName: report.signatureName } : {}),
        closeAlert: report.closeAlert,
        clientNotified: report.clientNotified,
      }),
    onSuccess: () => {
      onChanged();
      setReportOpen(false);
      pushToast({ tone: 'success', title: 'Rapport enregistré', description: 'La mission est clôturée.' });
    },
    onError: reportError,
  });

  const abort = useMutation({
    mutationFn: async () => api.post(`/interventions/${missionId}/abort`, { reason: abortReason, note: abortNote }),
    onSuccess: () => {
      onChanged();
      setAbortOpen(false);
      pushToast({ tone: 'neutral', title: 'Mission abandonnée' });
    },
    onError: reportError,
  });

  const track = trackQuery.data;

  return (
    <>
      <Drawer open={Boolean(missionId)} onClose={onClose} width="lg">
        {missionQuery.isLoading ? (
          <div className="space-y-3 p-6">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : missionQuery.isError || !mission ? (
          <div className="p-6">
            <ErrorState message="Mission introuvable ou hors de votre périmètre." onRetry={() => void missionQuery.refetch()} />
          </div>
        ) : (
          <>
            <header className="border-b border-slate-200 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800">
                    <Siren className="h-5 w-5 text-amber-500" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-mono text-sm font-semibold text-slate-900 dark:text-white">
                        {mission.reference}
                      </h2>
                      <Badge tone={describe(INTERVENTION_STATUS, mission.status).tone} dot={isOpen(mission.status)}>
                        {describe(INTERVENTION_STATUS, mission.status).label}
                      </Badge>
                      {mission.autoAssigned ? <Badge tone="info">Affectation automatique</Badge> : null}
                    </div>
                    <p className="mt-1 truncate text-sm text-slate-600 dark:text-slate-300">
                      {mission.team?.name} · {mission.team?.station?.name ?? mission.station?.name}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      Engagée {formatRelative(mission.assignedAt)} par {mission.assignedByLabel ?? 'le système'}
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fermer">
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {canAdvance && isOpen(mission.status) ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {mission.status === 'ASSIGNED' ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<Navigation className="h-3.5 w-3.5" />}
                      loading={advance.isPending}
                      onClick={() => advance.mutate('en-route')}
                    >
                      Confirmer le départ
                    </Button>
                  ) : null}
                  {mission.status !== 'ON_SITE' ? (
                    <Button
                      size="sm"
                      variant="outline"
                      icon={<MapPin className="h-3.5 w-3.5" />}
                      loading={advance.isPending}
                      onClick={() => advance.mutate('on-site')}
                    >
                      Arrivée sur site
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="success"
                    icon={<ClipboardList className="h-3.5 w-3.5" />}
                    onClick={() => setReportOpen(true)}
                  >
                    Rapport d'intervention
                  </Button>
                  {canPilot ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Ban className="h-3.5 w-3.5" />}
                      onClick={() => setAbortOpen(true)}
                    >
                      Abandonner
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </header>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {/* Suivi GPS */}
              <Card>
                <CardHeader
                  title="Suivi GPS"
                  description="Position de l'équipe et distance restante"
                  icon={<Route className="h-4 w-4" />}
                  actions={<Badge tone="info">{TEAM_POSITION_SOURCE[track?.positions[0]?.source ?? 'APP']}</Badge>}
                />
                <CardBody className="space-y-3 pt-3">
                  <DescriptionList>
                    <DataRow
                      label="Position de l'équipe"
                      value={
                        track?.teamPosition ? (
                          <span className="font-mono text-xs">
                            {track.teamPosition.latitude.toFixed(5)}, {track.teamPosition.longitude.toFixed(5)}
                          </span>
                        ) : (
                          'Non transmise'
                        )
                      }
                    />
                    <DataRow
                      label="Lieu d'intervention"
                      value={
                        track?.destination ? (
                          <span className="font-mono text-xs">
                            {track.destination.latitude.toFixed(5)}, {track.destination.longitude.toFixed(5)}
                          </span>
                        ) : (
                          '—'
                        )
                      }
                    />
                    <DataRow
                      label="Distance restante"
                      value={
                        track?.remainingMeters !== null && track?.remainingMeters !== undefined ? (
                          <span className="flex items-center justify-end gap-2">
                            {formatDistance(track.remainingMeters)}
                            {track.remainingEtaMinutes !== null ? (
                              <Badge tone="warning">{track.remainingEtaMinutes} min</Badge>
                            ) : null}
                          </span>
                        ) : (
                          '—'
                        )
                      }
                    />
                  </DescriptionList>

                  {track?.positions.length ? (
                    <ol className="space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                      {track.positions.slice(-6).reverse().map((position) => (
                        <li key={position.id} className="flex items-center justify-between gap-3 text-xs">
                          <span className="flex items-center gap-2">
                            <CircleDot className="h-3.5 w-3.5 text-brand-500" />
                            <span className="font-mono">
                              {position.latitude.toFixed(4)}, {position.longitude.toFixed(4)}
                            </span>
                          </span>
                          <span className="text-slate-500 dark:text-slate-400">
                            {position.speedKmh !== null ? `${position.speedKmh.toFixed(0)} km/h · ` : ''}
                            {formatTime(position.recordedAt)}
                          </span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <InlineEmpty>Aucun relevé GPS pour cette mission.</InlineEmpty>
                  )}
                </CardBody>
              </Card>

              {/* Rapport */}
              {mission.report ? (
                <Card>
                  <CardHeader
                    title="Rapport d'intervention"
                    description={describe(INTERVENTION_OUTCOME, mission.report.outcome).label}
                    icon={<ClipboardList className="h-4 w-4" />}
                  />
                  <CardBody className="space-y-2 pt-3">
                    <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:bg-slate-800/60 dark:text-slate-200">
                      {mission.report.summary}
                    </p>
                    {mission.report.actionsTaken ? (
                      <DataRow label="Actions menées" value={mission.report.actionsTaken} />
                    ) : null}
                    {mission.report.damages ? <DataRow label="Dégâts" value={mission.report.damages} /> : null}
                    <DataRow label="Personnes prises en charge" value={mission.report.peopleAssisted} />
                    <DataRow label="Durée" value={formatDuration(mission.report.durationSeconds)} />
                    <DataRow label="Bon de réception" value={mission.report.signatureName ?? 'Non signé'} />
                    <DataRow label="Photos" value={mission.report.photos.length} />
                    <DataRow label="Déposé par" value={mission.report.createdByLabel ?? '—'} />
                    <DataRow label="Client informé" value={mission.report.clientNotified ? 'Oui' : 'Non'} />
                  </CardBody>
                </Card>
              ) : null}

              {/* Alerte et équipe */}
              <div className="grid gap-4 sm:grid-cols-2">
                <Card>
                  <CardHeader title="Alerte traitée" icon={<Siren className="h-4 w-4" />} />
                  <CardBody className="pt-2">
                    <DescriptionList>
                      <DataRow
                        label="Référence"
                        value={
                          mission.alert ? (
                            <Link
                              to={`/alertes/${mission.alert.id}`}
                              className="inline-flex items-center gap-1 font-mono text-xs text-brand-600 hover:underline dark:text-brand-400"
                            >
                              {mission.alert.reference}
                              <ArrowRight className="h-3 w-3" />
                            </Link>
                          ) : (
                            '—'
                          )
                        }
                      />
                      <DataRow label="Nature" value={mission.alert ? describe(ALERT_TYPE, mission.alert.type).label : '—'} />
                      <DataRow label="Gravité" value={mission.alert ? describe(ALERT_SEVERITY, mission.alert.severity).label : '—'} />
                      <DataRow label="Client" value={mission.alert?.client?.fullName ?? '—'} />
                      <DataRow label="Adresse" value={mission.destinationLabel ?? '—'} />
                      <DataRow label="Ville" value={mission.city ?? '—'} />
                    </DescriptionList>
                  </CardBody>
                </Card>

                <Card>
                  <CardHeader title="Équipe et véhicule" icon={<Car className="h-4 w-4" />} />
                  <CardBody className="pt-2">
                    <DescriptionList>
                      <DataRow label="Chef d'équipe" value={mission.team?.leaderName ?? '—'} />
                      <DataRow label="Téléphone" value={mission.team?.leaderPhone ?? '—'} />
                      <DataRow label="Effectif" value={mission.team?.membersCount ?? '—'} />
                      <DataRow label="Véhicule" value={mission.team?.vehiclePlate ?? '—'} />
                      <DataRow
                        label="Spécialité"
                        value={mission.team ? describe(STATION_TYPE, mission.team.speciality).label : '—'}
                      />
                      <DataRow label="Départ" value={mission.enRouteAt ? formatTime(mission.enRouteAt) : 'Non confirmé'} />
                      <DataRow label="Arrivée" value={mission.onSiteAt ? formatTime(mission.onSiteAt) : 'Non confirmée'} />
                      <DataRow label="Clôture" value={mission.completedAt ? formatTime(mission.completedAt) : '—'} />
                      {mission.abortedAt ? (
                        <DataRow
                          label="Abandon"
                          value={describe(INTERVENTION_ABORT_REASON, mission.abortReason).label}
                        />
                      ) : null}
                    </DescriptionList>
                  </CardBody>
                </Card>
              </div>

              {mission.notes ? (
                <Card>
                  <CardHeader title="Consignes et notes" icon={<Radio className="h-4 w-4" />} />
                  <CardBody className="pt-3">
                    <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:bg-slate-800/60 dark:text-slate-200">
                      {mission.notes}
                    </p>
                  </CardBody>
                </Card>
              ) : null}

              <p className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <Clock className="h-3.5 w-3.5" />
                {mission.report
                  ? `Mission clôturée ${formatRelative(mission.completedAt ?? mission.assignedAt)}`
                  : 'Mission en cours : le rapport clôturera la mission et l’alerte associée.'}
              </p>
            </div>
          </>
        )}
      </Drawer>

      {/* Rapport de fin d'intervention */}
      <Modal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        title="Rapport d'intervention"
        description="Ce rapport devient le compte rendu officiel de l'alerte."
        footer={
          <>
            <Button variant="ghost" onClick={() => setReportOpen(false)}>
              Annuler
            </Button>
            <Button
              variant="success"
              loading={submitReport.isPending}
              disabled={report.summary.trim().length < 5}
              onClick={() => submitReport.mutate()}
            >
              Clôturer la mission
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Conclusion" required>
            <Select
              value={report.outcome}
              onChange={(event) => setReport({ ...report, outcome: event.target.value as InterventionOutcome })}
            >
              {OUTCOMES.map((value) => (
                <option key={value} value={value}>
                  {describe(INTERVENTION_OUTCOME, value).label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Synthèse" hint="Visible par le contrôle qualité et reprise dans le dossier client." required>
            <Textarea
              rows={3}
              value={report.summary}
              onChange={(event) => setReport({ ...report, summary: event.target.value })}
              placeholder="Intrusion confirmée au rez-de-chaussée, portail forcé, aucun dégât majeur."
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Actions menées">
              <Textarea
                rows={2}
                value={report.actionsTaken}
                onChange={(event) => setReport({ ...report, actionsTaken: event.target.value })}
              />
            </Field>
            <Field label="Dégâts constatés">
              <Textarea
                rows={2}
                value={report.damages}
                onChange={(event) => setReport({ ...report, damages: event.target.value })}
              />
            </Field>
            <Field label="Personnes prises en charge">
              <Input
                type="number"
                min={0}
                value={report.peopleAssisted}
                onChange={(event) => setReport({ ...report, peopleAssisted: Number(event.target.value) })}
              />
            </Field>
            <Field label="Bon de réception signé par">
              <Input
                value={report.signatureName}
                onChange={(event) => setReport({ ...report, signatureName: event.target.value })}
                placeholder="Nom du client ou du témoin"
              />
            </Field>
          </div>

          <Field label="Photos" hint="Une référence par ligne (URL de stockage).">
            <Textarea
              rows={2}
              value={report.photos}
              onChange={(event) => setReport({ ...report, photos: event.target.value })}
              placeholder="https://storage.zengo.cd/rapports/2026-10-03-001.jpg"
            />
          </Field>

          <div className="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                checked={report.closeAlert}
                onChange={(event) => setReport({ ...report, closeAlert: event.target.checked })}
              />
              Clôturer l'alerte associée
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                checked={report.clientNotified}
                onChange={(event) => setReport({ ...report, clientNotified: event.target.checked })}
              />
              Le client a été informé de la clôture
            </label>
          </div>
        </div>
      </Modal>

      {/* Abandon */}
      <Modal
        open={abortOpen}
        onClose={() => setAbortOpen(false)}
        title="Abandonner la mission"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAbortOpen(false)}>
              Annuler
            </Button>
            <Button variant="danger" loading={abort.isPending} onClick={() => abort.mutate()}>
              Abandonner la mission
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Motif" required>
            <Select
              value={abortReason}
              onChange={(event) => setAbortReason(event.target.value as InterventionAbortReason)}
            >
              {ABORT_REASONS.map((value) => (
                <option key={value} value={value}>
                  {describe(INTERVENTION_ABORT_REASON, value).label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Précisions">
            <Textarea
              rows={3}
              value={abortNote}
              onChange={(event) => setAbortNote(event.target.value)}
              placeholder="Le client a confirmé au téléphone qu'il est à l'origine du déclenchement."
            />
          </Field>
        </div>
      </Modal>
    </>
  );
};
