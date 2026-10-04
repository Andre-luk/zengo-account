import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  BellRing,
  CheckCircle2,
  Clock,
  DoorOpen,
  Flame,
  MapPin,
  PhoneCall,
  PhoneOff,
  PlayCircle,
  RadioTower,
  ShieldAlert,
  ShieldCheck,
  Siren,
  UserCog,
  Wind,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, DataRow, DescriptionList } from '@/components/ui/Card';
import { Field, Select } from '@/components/ui/Field';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback';
import { api } from '@/lib/api';
import { formatDateTime, formatRelative } from '@/lib/format';
import {
  ALERT_SEVERITY,
  ALERT_SOURCE,
  ALERT_STATUS,
  ALERT_TYPE,
  ARM_MODE,
  DEVICE_STATUS,
  SUB_DEVICE_CODE,
  VOICE_CALL_OUTCOME,
  VOICE_CALL_STATUS,
  describe,
} from '@/lib/labels';
import { useAlert, useAlertTimeline, useAlertVoiceCalls, useSimulationKits } from '@/hooks/queries';
import { queryKeys } from '@/lib/queryClient';
import { useUiStore } from '@/store/ui';
import type { Alert, SimulatedDeviceState, SimulationKit, SimulationScenario } from '@/types/api';

/** Scénarios proposés à l'opérateur : un clic = un capteur qui se déclenche. */
const SCENARIOS: Array<{
  id: SimulationScenario;
  label: string;
  hint: string;
  icon: typeof DoorOpen;
  tone: 'primary' | 'danger';
}> = [
  {
    id: 'INTRUSION_DOOR',
    label: 'Ouverture de porte',
    hint: 'Intrusion · contact de porte',
    icon: DoorOpen,
    tone: 'primary',
  },
  {
    id: 'INTRUSION_MOTION',
    label: 'Mouvement détecté',
    hint: 'Intrusion · détecteur de présence',
    icon: Activity,
    tone: 'primary',
  },
  {
    id: 'FIRE_SMOKE',
    label: 'Fumée détectée',
    hint: 'Incendie · détecteur de fumée',
    icon: Flame,
    tone: 'danger',
  },
  {
    id: 'GAS_LEAK',
    label: 'Fuite de gaz',
    hint: 'Gaz · détecteur dédié',
    icon: Wind,
    tone: 'danger',
  },
  {
    id: 'WATER_LEAK',
    label: "Fuite d'eau",
    hint: 'Dégât des eaux',
    icon: ShieldAlert,
    tone: 'primary',
  },
  {
    id: 'PANIC_BUTTON',
    label: "Bouton d'alerte",
    hint: 'Panique · télécommande',
    icon: Siren,
    tone: 'danger',
  },
];

/** États de capteur jouables depuis la console. */
const DEVICE_STATES: Array<{ value: SimulatedDeviceState; label: string }> = [
  { value: 'NORMAL', label: 'Normal (tout est fermé)' },
  { value: 'OPEN', label: 'Ouvert (contact déclenché)' },
  { value: 'TAMPER', label: 'Sabotage (capot forcé)' },
  { value: 'LOW_BATTERY', label: 'Batterie faible' },
];

/**
 * Banc d'essai du matériel SafAlert.
 *
 * L'écran joue le rôle du kit installé chez un client : mise en ligne, armement,
 * déclenchement d'un capteur, puis réponse à l'appel de vérification. Rien n'est
 * simulé côté serveur : les requêtes empruntent exactement le même chemin que la
 * passerelle MQTT, donc l'alerte, l'appel vocal, l'escalade et la chronologie
 * sont ceux d'un vrai déclenchement. Indispensable pour les démonstrations,
 * quand aucun matériel n'est disponible.
 */
export const SimulationPage = () => {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((state) => state.pushToast);

  const [deviceId, setDeviceId] = useState('');
  const [state, setState] = useState<SimulatedDeviceState>('NORMAL');
  const [alertId, setAlertId] = useState<string | null>(null);

  const kitsQuery = useSimulationKits();
  const kits = kitsQuery.data ?? [];

  // Le premier kit rattaché à un client est sélectionné d'office : l'écran est
  // utilisable immédiatement en démonstration.
  useEffect(() => {
    if (!deviceId && kits.length > 0) {
      setDeviceId((kits.find((kit) => kit.client) ?? kits[0]).id);
    }
  }, [deviceId, kits]);

  const kit: SimulationKit | undefined = useMemo(
    () => kits.find((item) => item.id === deviceId),
    [kits, deviceId],
  );

  // Le dossier créé est suivi en direct : appel, escalade et chronologie se
  // mettent à jour sans action de l'opérateur.
  const alertQuery = useAlert(alertId ?? undefined);
  const callsQuery = useAlertVoiceCalls(alertId ?? undefined);
  const timelineQuery = useAlertTimeline(alertId ?? undefined);
  const alert = alertQuery.data;
  const calls = callsQuery.data ?? [];
  const activeCall = calls.find((call) => ['QUEUED', 'RINGING', 'IN_PROGRESS'].includes(call.status));

  const refreshKit = () => {
    void queryClient.invalidateQueries({ queryKey: ['simulation'] });
    void queryClient.invalidateQueries({ queryKey: queryKeys.devices() });
  };

  const refreshAlert = () => {
    void queryClient.invalidateQueries({ queryKey: ['alerts'] });
  };

  const heartbeat = useMutation({
    mutationFn: () =>
      api.post<SimulationKit>(`/simulation/kits/${deviceId}/heartbeat`, {
        subDeviceCode: kit?.subDevices[0]?.code,
        state,
      }),
    onSuccess: (updated) => {
      pushToast({
        tone: 'success',
        title: 'Kit en ligne',
        description: `${updated.serialNumber} remonte ${updated.subDevices.length} capteur(s) — état ${state}.`,
      });
      refreshKit();
    },
    onError: (error: Error) =>
      pushToast({ tone: 'danger', title: 'Heartbeat refusé', description: error.message }),
  });

  const setArmMode = useMutation({
    mutationFn: (armMode: number) => api.post<SimulationKit>(`/simulation/kits/${deviceId}/arm-mode`, { armMode }),
    onSuccess: (updated) => {
      pushToast({
        tone: 'brand',
        title: 'Mode d’armement annoncé',
        description: `${updated.serialNumber} — ${describe(ARM_MODE, String(updated.armMode)).label}.`,
      });
      refreshKit();
    },
    onError: (error: Error) =>
      pushToast({ tone: 'danger', title: 'Changement refusé', description: error.message }),
  });

  const trigger = useMutation({
    mutationFn: (scenario: SimulationScenario) =>
      api.post<Alert>(`/simulation/kits/${deviceId}/alarm`, { scenario }),
    onSuccess: (created) => {
      setAlertId(created.id);
      pushToast({
        tone: created.severity === 'CRITICAL' ? 'critical' : 'warning',
        title: `Alerte ${created.reference}`,
        description: `${describe(ALERT_TYPE, created.type).label} — dossier ouvert dans le ZMC.`,
      });
      refreshKit();
      refreshAlert();
    },
    onError: (error: Error) =>
      pushToast({ tone: 'danger', title: 'Déclenchement refusé', description: error.message }),
  });

  const answerCall = useMutation({
    mutationFn: ({ voiceCallId, dtmf }: { voiceCallId: string; dtmf: '1' | '2' }) =>
      api.post(`/voice-calls/${voiceCallId}/simulate/input`, { dtmf }),
    onSuccess: (_result, variables) => {
      pushToast({
        tone: variables.dtmf === '1' ? 'danger' : 'success',
        title: variables.dtmf === '1' ? 'Le client dit « ce n’est pas moi »' : 'Le client dit « c’est moi »',
        description:
          variables.dtmf === '1'
            ? 'Intrusion confirmée : escalade immédiate à toutes les stations du PDC.'
            : 'Fausse alerte : le dossier est classé, aucune équipe engagée.',
      });
      refreshAlert();
    },
    onError: (error: Error) =>
      pushToast({ tone: 'danger', title: 'Réponse refusée', description: error.message }),
  });

  const notAnswered = useMutation({
    mutationFn: (voiceCallId: string) => api.post(`/voice-calls/${voiceCallId}/simulate/status`, { status: 'no-answer' }),
    onSuccess: () => {
      pushToast({
        tone: 'warning',
        title: 'Appel sans réponse',
        description: 'Le minuteur du ZMC décide désormais de l’escalade.',
      });
      refreshAlert();
    },
    onError: (error: Error) =>
      pushToast({ tone: 'danger', title: 'Simulation refusée', description: error.message }),
  });

  if (kitsQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (kitsQuery.isError) {
    return (
      <ErrorState message="Le banc d'essai est indisponible. Vérifiez que le module de simulation est activé (SIMULATION_ENABLED=true)." />
    );
  }

  if (kits.length === 0) {
    return (
      <EmptyState
        title="Aucun kit disponible"
        description="Installez un dispositif puis rattachez-le à un client pour utiliser le banc d'essai."
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Banc d'essai du matériel</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Jouez un kit SafAlert comme s'il était posé chez le client : mise en ligne, armement, déclenchement d'un
            capteur et réponse à l'appel de vérification.
          </p>
        </div>
        <Badge tone="brand" icon={<RadioTower className="h-3.5 w-3.5" />}>
          {kits.length} kit(s) jouable(s)
        </Badge>
      </div>

      {/* Le kit : ce que l'opérateur manipule */}
      <Card>
        <CardHeader
          title="Le kit et son client"
          description="Le déclenchement se fait sur le vrai dispositif enregistré : l'alerte est rattachée au bon client."
          icon={<RadioTower className="h-4 w-4" />}
          actions={
            <Field label="Kit SafAlert">
              <Select value={deviceId} onChange={(event) => setDeviceId(event.target.value)}>
                {kits.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.serialNumber} · {item.client ? `${item.client.zengoId} — ${item.client.fullName}` : 'non rattaché'}
                  </option>
                ))}
              </Select>
            </Field>
          }
        />
        {kit ? (
          <CardBody className="space-y-4">
            <DescriptionList>
              <DataRow label="Client" value={kit.client ? `${kit.client.fullName} (${kit.client.zengoId})` : '—'} />
              <DataRow label="Téléphone" value={kit.client?.phone ?? '—'} />
              <DataRow
                label="Adresse"
                value={kit.client ? [kit.client.address, kit.client.city].filter(Boolean).join(', ') || '—' : '—'}
              />
              <DataRow label="Agence / zone" value={kit.organizationName ?? '—'} />
              <DataRow
                label="État du kit"
                value={
                  <Badge tone={describe(DEVICE_STATUS, kit.status).tone} dot>
                    {describe(DEVICE_STATUS, kit.status).label}
                  </Badge>
                }
              />
              <DataRow
                label="Armement"
                value={
                  <Badge tone={describe(ARM_MODE, String(kit.armMode)).tone}>
                    {describe(ARM_MODE, String(kit.armMode)).label}
                  </Badge>
                }
              />
              <DataRow label="Firmware" value={kit.firmwareVersion ?? '—'} />
              <DataRow
                label="Dernier heartbeat"
                value={
                  kit.lastHeartbeatAt
                    ? `${formatRelative(kit.lastHeartbeatAt)} (${formatDateTime(kit.lastHeartbeatAt)})`
                    : 'jamais'
                }
              />
            </DescriptionList>

            <div className="flex flex-wrap items-end gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
              <Field label="Ce que le kit annonce">
                <Select value={state} onChange={(event) => setState(event.target.value as SimulatedDeviceState)}>
                  {DEVICE_STATES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button
                variant="secondary"
                icon={<RadioTower className="h-4 w-4" />}
                loading={heartbeat.isPending}
                onClick={() => heartbeat.mutate()}
              >
                Kit en ligne (heartbeat)
              </Button>
              <Button
                variant="secondary"
                icon={<ShieldCheck className="h-4 w-4" />}
                loading={setArmMode.isPending}
                onClick={() => setArmMode.mutate(1)}
              >
                Armer (absence)
              </Button>
              <Button
                variant="ghost"
                loading={setArmMode.isPending}
                onClick={() => setArmMode.mutate(0)}
              >
                Désarmer
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {kit.subDevices.map((subDevice) => (
                <div
                  key={subDevice.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-700"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                      {subDevice.name}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {describe(SUB_DEVICE_CODE, subDevice.code).label}
                      {subDevice.areaName ? ` · ${subDevice.areaName}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <code className="text-[11px] text-slate-500 dark:text-slate-400">{subDevice.state}</code>
                    {subDevice.decoded.open ? (
                      <Badge tone="warning">Ouvert</Badge>
                    ) : subDevice.decoded.tamper ? (
                      <Badge tone="danger">Sabotage</Badge>
                    ) : subDevice.decoded.lowBattery ? (
                      <Badge tone="warning">Batterie</Badge>
                    ) : (
                      <Badge tone="success">Normal</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardBody>
        ) : null}
      </Card>

      {/* Le déclenchement */}
      <Card>
        <CardHeader
          title="Déclencher un capteur"
          description="Le kit publie une alarme : alerte créée, appel de vérification au client, temporisation d'escalade."
          icon={<PlayCircle className="h-4 w-4" />}
        />
        <CardBody>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {SCENARIOS.map((scenario) => (
              <button
                key={scenario.id}
                type="button"
                disabled={!deviceId || trigger.isPending}
                onClick={() => trigger.mutate(scenario.id)}
                className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-brand-400 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-brand-500 dark:hover:bg-brand-500/10"
              >
                <span
                  className={
                    scenario.tone === 'danger'
                      ? 'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-300'
                      : 'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
                  }
                >
                  <scenario.icon className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {scenario.label}
                  </span>
                  <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{scenario.hint}</span>
                </span>
              </button>
            ))}
          </div>
          {!kit?.client ? (
            <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">
              Ce kit n'est rattaché à aucun client : l'alerte sera créée sans dossier client. Choisissez un kit rattaché
              pour une démonstration complète.
            </p>
          ) : null}
        </CardBody>
      </Card>

      {/* Le dossier créé, suivi en direct */}
      {alertId ? (
        <Card>
          <CardHeader
            title="Ce que voit le Zengo Monitoring Center"
            description="Dossier ouvert par le déclenchement : l'opérateur n'a plus qu'à confirmer ou engager les secours."
            icon={<BellRing className="h-4 w-4" />}
            actions={
              <Badge tone={describe(ALERT_STATUS, alert?.status).tone} dot>
                {describe(ALERT_STATUS, alert?.status).label}
              </Badge>
            }
          />
          <CardBody className="space-y-4">
            {alert ? (
              <>
                <DescriptionList>
                  <DataRow label="Référence" value={alert.reference} />
                  <DataRow
                    label="Nature"
                    value={
                      <Badge tone={describe(ALERT_TYPE, alert.type).tone}>
                        {describe(ALERT_TYPE, alert.type).label}
                      </Badge>
                    }
                  />
                  <DataRow
                    label="Gravité"
                    value={
                      <Badge tone={describe(ALERT_SEVERITY, alert.severity).tone} dot>
                        {describe(ALERT_SEVERITY, alert.severity).label}
                      </Badge>
                    }
                  />
                  <DataRow
                    label="Origine"
                    value={`${describe(ALERT_SOURCE, alert.source).label}${
                      alert.subDeviceCode ? ` · ${describe(SUB_DEVICE_CODE, alert.subDeviceCode).label}` : ''
                    }`}
                  />
                  <DataRow label="Occurrences" value={alert.occurrenceCount} />
                  <DataRow label="Ouverte à" value={formatDateTime(alert.openedAt)} />
                  <DataRow
                    label="Escalade"
                    value={
                      alert.escalatedAt
                        ? `niveau ${alert.escalationLevel} à ${formatDateTime(alert.escalatedAt)}`
                        : 'aucune pour l’instant (minuteur en cours)'
                    }
                  />
                  <DataRow
                    label="Équipes notifiées"
                    value={
                      alert.dispatches?.length
                        ? alert.dispatches
                            .map(
                              (dispatch) =>
                                `${dispatch.station?.name ?? '—'}${dispatch.isEscalation ? ' (escalade)' : ''}`,
                            )
                            .join(', ')
                        : '—'
                    }
                  />
                  {alert.resolution ? (
                    <DataRow
                      label="Clôture"
                      value={<>{alert.resolutionNote ?? alert.resolution}</>}
                    />
                  ) : null}
                </DescriptionList>

                <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <PhoneCall className="h-4 w-4 text-brand-600 dark:text-brand-300" />
                      <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                        Appel de vérification au client
                      </span>
                    </div>
                    {calls[0] ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={describe(VOICE_CALL_STATUS, calls[0].status).tone}>
                          {describe(VOICE_CALL_STATUS, calls[0].status).label}
                        </Badge>
                        {calls[0].outcome ? (
                          <Badge tone={describe(VOICE_CALL_OUTCOME, calls[0].outcome).tone}>
                            {describe(VOICE_CALL_OUTCOME, calls[0].outcome).label}
                          </Badge>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  {calls.length === 0 ? (
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Aucun appel enregistré.</p>
                  ) : (
                    <>
                      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                        Le client entend : « Bonjour, ici le centre de surveillance Zengo… Appuyez sur 1 si ce n’est pas
                        vous, sur 2 si c’est vous. » — appel vers {calls[0].toNumber} ({calls[0].language}).
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          variant="danger"
                          icon={<XCircle className="h-4 w-4" />}
                          disabled={!activeCall || answerCall.isPending}
                          onClick={() => activeCall && answerCall.mutate({ voiceCallId: activeCall.id, dtmf: '1' })}
                        >
                          Touche 1 — ce n’est pas moi
                        </Button>
                        <Button
                          variant="success"
                          icon={<CheckCircle2 className="h-4 w-4" />}
                          disabled={!activeCall || answerCall.isPending}
                          onClick={() => activeCall && answerCall.mutate({ voiceCallId: activeCall.id, dtmf: '2' })}
                        >
                          Touche 2 — c’est moi
                        </Button>
                        <Button
                          variant="secondary"
                          icon={<PhoneOff className="h-4 w-4" />}
                          disabled={!activeCall || notAnswered.isPending}
                          onClick={() => activeCall && notAnswered.mutate(activeCall.id)}
                        >
                          Ne pas répondre
                        </Button>
                      </div>
                      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                        Touche 1 : alerte CRITIQUE et escalade immédiate. Touche 2 : fausse alerte classée sans suite.
                        Sans réponse, le minuteur du ZMC déclenche l'escalade.
                      </p>
                    </>
                  )}
                </div>

                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <Clock className="h-4 w-4 text-slate-400" />
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">Chronologie</span>
                  </div>
                  <ol className="space-y-2">
                    {(timelineQuery.data ?? []).map((event) => (
                      <li key={event.id} className="flex gap-3 text-sm">
                        <span className="w-20 shrink-0 text-xs text-slate-500 dark:text-slate-400">
                          {formatDateTime(event.createdAt).slice(-8)}
                        </span>
                        <span className="min-w-0">
                          <span className="font-medium text-slate-700 dark:text-slate-200">{event.type}</span>
                          {event.message ? (
                            <span className="text-slate-500 dark:text-slate-400"> — {event.message}</span>
                          ) : null}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              </>
            ) : (
              <Skeleton className="h-40" />
            )}
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardBody>
            <div className="flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
              <UserCog className="h-4 w-4" />
              <span>
                Déclenchez un capteur ci-dessus : le dossier d'alerte, l'appel de vérification et la chronologie
                apparaîtront ici, et l'alerte rejoindra la file du ZMC comme un vrai déclenchement.
              </span>
            </div>
          </CardBody>
        </Card>
      )}

      <p className="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
        <MapPin className="h-3.5 w-3.5" />
        Le module est réservé aux postes de supervision et se désactive automatiquement en production
        (NODE_ENV=production).
      </p>
    </div>
  );
};
