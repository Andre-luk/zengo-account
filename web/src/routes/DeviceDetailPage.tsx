import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Cpu,
  DownloadCloud,
  KeyRound,
  Lock,
  LockOpen,
  Power,
  ShieldCheck,
  ShieldHalf,
  Copy,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, DataRow, DescriptionList } from '@/components/ui/Card';
import { EmptyState, ErrorState, InlineEmpty, Skeleton, TableSkeleton } from '@/components/ui/Feedback';
import { Field, Input } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { TBody, TD, TH, THead, TR, TableWrap } from '@/components/ui/Table';
import { useAlerts, useDevice } from '@/hooks/queries';
import { api } from '@/lib/api';
import { formatDateTime, formatRelative } from '@/lib/format';
import { ALERT_STATUS, ALERT_TYPE, ARM_MODE, DEVICE_STATUS, LANGUAGE, SUB_DEVICE_CODE, describe } from '@/lib/labels';
import { useAuthStore } from '@/store/auth';
import { useUiStore } from '@/store/ui';
import type { ArmMode, DeviceStatus } from '@/types/api';

const MANAGER_ROLES = [
  'SUPER_ADMIN',
  'NATIONAL_DIRECTOR',
  'TECHNICAL_DIRECTOR',
  'PLATFORM_MANAGER',
  'TECHNICIAN',
  'AGENCY_MANAGER',
] as const;

const TOKEN_ROLES = ['SUPER_ADMIN', 'TECHNICAL_DIRECTOR'] as const;

export const DeviceDetailPage = () => {
  const { deviceId } = useParams<{ deviceId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pushToast = useUiStore((state) => state.pushToast);
  const hasRole = useAuthStore((state) => state.hasRole);

  const [firmwareOpen, setFirmwareOpen] = useState(false);
  const [firmwareVersion, setFirmwareVersion] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const deviceQuery = useDevice(deviceId);
  const device = deviceQuery.data;
  const alertsQuery = useAlerts({ deviceId: deviceId ?? '', limit: 10 });

  const canManage = hasRole(...MANAGER_ROLES);
  const canRotateToken = hasRole(...TOKEN_ROLES);

  const reportError = (message: string) =>
    pushToast({ tone: 'danger', title: 'Opération refusée', description: message });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['devices'] });

  const setArm = useMutation({
    mutationFn: async (mode: ArmMode) => api.post(`/devices/${deviceId}/arm-mode`, { mode }),
    onSuccess: (_data, mode) => {
      invalidate();
      pushToast({ tone: 'brand', title: `Commande ${describe(ARM_MODE, mode).label} transmise` });
    },
    onError: (error: Error) => reportError(error.message),
  });

  const changeStatus = useMutation({
    mutationFn: async (status: DeviceStatus) => api.patch(`/devices/${deviceId}/status`, { status }),
    onSuccess: () => {
      invalidate();
      pushToast({ tone: 'success', title: 'État du dispositif mis à jour' });
    },
    onError: (error: Error) => reportError(error.message),
  });

  const rotateToken = useMutation({
    mutationFn: async () => api.post<{ token: string }>(`/devices/${deviceId}/token`, {}),
    onSuccess: (data) => {
      invalidate();
      setToken(data.token);
    },
    onError: (error: Error) => reportError(error.message),
  });

  const pushFirmware = useMutation({
    mutationFn: async () => api.patch(`/devices/${deviceId}`, { firmwareTargetVersion: Number(firmwareVersion) }),
    onSuccess: () => {
      invalidate();
      setFirmwareOpen(false);
      setFirmwareVersion('');
      pushToast({
        tone: 'info',
        title: 'Mise à jour OTA programmee',
        description: 'La centrale téléchargera le firmware à sa prochaine synchronisation.',
      });
    },
    onError: (error: Error) => reportError(error.message),
  });

  if (deviceQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (deviceQuery.isError || !device) {
    return <ErrorState message="Dispositif introuvable ou hors de votre périmètre." onRetry={() => void deviceQuery.refetch()} />;
  }

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/dispositifs')} aria-label="Retour">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-mono text-lg font-semibold text-slate-900 dark:text-white">{device.serialNumber}</h2>
                <Badge tone={describe(DEVICE_STATUS, device.status).tone} dot={device.status === 'OFFLINE'}>
                  {describe(DEVICE_STATUS, device.status).label}
                </Badge>
                <Badge tone={describe(ARM_MODE, device.armMode).tone}>{describe(ARM_MODE, device.armMode).label}</Badge>
              </div>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                {device.model} · firmware {device.firmwareVersion ?? '—'}
                {device.firmwareTargetVersion ? ` → cible ${device.firmwareTargetVersion}` : ''}
              </p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Dernier signe de vie : {formatDateTime(device.lastHeartbeatAt ?? device.lastSeenAt)} ·{' '}
                {device.organization?.name ?? 'Stock national'}
              </p>
            </div>
          </div>

          {canManage ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                icon={<Lock className="h-3.5 w-3.5" />}
                disabled={device.armMode === 1}
                onClick={() => setArm.mutate(1)}
              >
                Armer
              </Button>
              <Button
                size="sm"
                variant="secondary"
                icon={<ShieldHalf className="h-3.5 w-3.5" />}
                disabled={device.armMode === 2}
                onClick={() => setArm.mutate(2)}
              >
                Armer partiel
              </Button>
              <Button
                size="sm"
                variant="outline"
                icon={<LockOpen className="h-3.5 w-3.5" />}
                disabled={device.armMode === 0}
                onClick={() => setArm.mutate(0)}
              >
                Désarmer
              </Button>
              <Button size="sm" variant="ghost" icon={<DownloadCloud className="h-3.5 w-3.5" />} onClick={() => setFirmwareOpen(true)}>
                Firmware
              </Button>
              {canRotateToken ? (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<KeyRound className="h-3.5 w-3.5" />}
                  loading={rotateToken.isPending}
                  onClick={() => rotateToken.mutate()}
                >
                  Token
                </Button>
              ) : null}
              <Button
                size="sm"
                variant={device.status === 'DISABLED' ? 'success' : 'danger'}
                icon={<Power className="h-3.5 w-3.5" />}
                loading={changeStatus.isPending}
                onClick={() => changeStatus.mutate(device.status === 'DISABLED' ? 'PROVISIONED' : 'DISABLED')}
              >
                {device.status === 'DISABLED' ? 'Réactiver' : 'Désactiver'}
              </Button>
            </div>
          ) : null}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Sous-appareils déclarés"
            description="État décodé des entrees de la centrale"
            icon={<Cpu className="h-4 w-4" />}
          />
          {!device.subDevices?.length ? (
            <EmptyState
              title="Aucun sous-appareil"
              description="Les capteurs sont déclarés automatiquement par la centrale lors de la synchronisation."
            />
          ) : (
            <TableWrap>
              <THead>
                <TH>Identifiant</TH>
                <TH>Libelle</TH>
                <TH>Type</TH>
                <TH>Zone</TH>
                <TH>État</TH>
                <TH className="text-right">Dernier signe</TH>
              </THead>
              <TBody>
                {device.subDevices.map((subDevice) => (
                  <TR key={subDevice.id}>
                    <TD className="font-mono text-xs">{subDevice.subId}</TD>
                    <TD>{subDevice.name}</TD>
                    <TD className="text-xs">{describe(SUB_DEVICE_CODE, subDevice.code).label}</TD>
                    <TD className="text-xs">{subDevice.areaName ?? '—'}</TD>
                    <TD>
                      {subDevice.decodedState ? (
                        <span className="flex flex-wrap gap-1">
                          {subDevice.decodedState.offline ? <Badge tone="neutral">Hors ligne</Badge> : null}
                          {subDevice.decodedState.open ? <Badge tone="warning">Ouvert</Badge> : null}
                          {subDevice.decodedState.tamper ? <Badge tone="danger">Sabotage</Badge> : null}
                          {subDevice.decodedState.lowBattery ? <Badge tone="warning">Batterie faible</Badge> : null}
                          {!subDevice.decodedState.offline &&
                          !subDevice.decodedState.open &&
                          !subDevice.decodedState.tamper &&
                          !subDevice.decodedState.lowBattery ? (
                            <Badge tone="success">Normal</Badge>
                          ) : null}
                        </span>
                      ) : (
                        '—'
                      )}
                    </TD>
                    <TD className="text-right text-xs text-slate-500 dark:text-slate-400">
                      {formatRelative(subDevice.lastSeenAt)}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </TableWrap>
          )}
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Caracteristiques" icon={<ShieldCheck className="h-4 w-4" />} />
            <CardBody className="pt-2">
              <DescriptionList>
                <DataRow label="IMEI" value={<span className="font-mono text-xs">{device.imei ?? '—'}</span>} />
                <DataRow label="SIM data" value={<span className="font-mono text-xs">{device.simNumber ?? '—'}</span>} />
                <DataRow label="Numéro d'alarme" value={<span className="font-mono text-xs">{device.alarmPhoneNumber ?? '—'}</span>} />
                <DataRow label="Firmware" value={device.firmwareVersion ?? '—'} />
                <DataRow label="Langue" value={LANGUAGE[device.language] ?? device.language} />
                <DataRow label="Agence" value={device.organization?.name ?? 'Stock national'} />
                <DataRow label="Provisionne le" value={formatDateTime(device.createdAt)} />
              </DescriptionList>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Client detenteur" />
            <CardBody className="pt-2">
              {device.client ? (
                <DescriptionList>
                  <DataRow
                    label="Titulaire"
                    value={
                      <Link
                        to={`/clients/${device.client.id}`}
                        className="text-brand-600 hover:underline dark:text-brand-400"
                      >
                        {device.client.fullName}
                      </Link>
                    }
                  />
                  <DataRow label="ID Zengo" value={<span className="font-mono text-xs">{device.client.zengoId}</span>} />
                  <DataRow label="Téléphone" value={device.client.primaryPhone} />
                  <DataRow label="Ville" value={device.client.city ?? '—'} />
                </DescriptionList>
              ) : (
                <InlineEmpty>Ce kit est en stock et n'est rattaché à aucun compte client.</InlineEmpty>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      <Card className="overflow-hidden">
        <CardHeader title="Dernières alertes du dispositif" description="Les 10 plus récentes" />
        {alertsQuery.isLoading ? (
          <TableSkeleton rows={4} columns={4} />
        ) : (alertsQuery.data?.items.length ?? 0) === 0 ? (
          <EmptyState title="Aucune alerte" description="Ce dispositif n'a pas déclenche d'alerte." />
        ) : (
          <TableWrap>
            <THead>
              <TH>Référence</TH>
              <TH>Nature</TH>
              <TH>Statut</TH>
              <TH className="text-right">Déclenchée</TH>
            </THead>
            <TBody>
              {alertsQuery.data?.items.map((alert) => (
                <TR key={alert.id} onClick={() => navigate(`/alertes/${alert.id}`)}>
                  <TD className="font-mono text-xs font-semibold">{alert.reference}</TD>
                  <TD className="text-xs">{describe(ALERT_TYPE, alert.type).label}</TD>
                  <TD>
                    <Badge tone={describe(ALERT_STATUS, alert.status).tone}>{describe(ALERT_STATUS, alert.status).label}</Badge>
                  </TD>
                  <TD className="text-right text-xs text-slate-500 dark:text-slate-400">
                    {formatRelative(alert.openedAt)}
                  </TD>
                </TR>
              ))}
            </TBody>
          </TableWrap>
        )}
      </Card>

      {/* Firmware OTA */}
      <Modal
        open={firmwareOpen}
        onClose={() => setFirmwareOpen(false)}
        title="Mise à jour du firmware"
        description="La centrale Telecharge et applique le firmware cible lors de sa prochaine synchronisation MQTT."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setFirmwareOpen(false)}>
              Annuler
            </Button>
            <Button
              loading={pushFirmware.isPending}
              disabled={!firmwareVersion}
              onClick={() => pushFirmware.mutate()}
            >
              Programmer
            </Button>
          </>
        }
      >
        <Field label="Version cible" hint={`Version actuelle : ${device.firmwareVersion ?? 'inconnue'}`} required>
          <Input
            type="number"
            min={1}
            value={firmwareVersion}
            onChange={(event) => setFirmwareVersion(event.target.value)}
            placeholder="2"
          />
        </Field>
      </Modal>

      {/* Token régénéré */}
      <Modal
        open={Boolean(token)}
        onClose={() => {
          setToken(null);
          setCopied(false);
        }}
        title="Nouveau token du dispositif"
        description="Ce token ne sera plus affiché. Il doit être injecté dans la centrale avant sa prochaine connexion."
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              icon={<Copy className="h-4 w-4" />}
              onClick={async () => {
                await navigator.clipboard.writeText(token ?? '');
                setCopied(true);
              }}
            >
              {copied ? 'Copie dans le presse-papier' : 'Copier le token'}
            </Button>
            <Button
              onClick={() => {
                setToken(null);
                setCopied(false);
              }}
            >
              Terminer
            </Button>
          </>
        }
      >
        <code className="block break-all rounded-lg bg-slate-900 p-3 font-mono text-xs text-emerald-300">
          {token}
        </code>
      </Modal>
    </div>
  );
};
