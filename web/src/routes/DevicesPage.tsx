import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Cpu, Lock, LockOpen, Plus, Search, Wifi, WifiOff } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/Feedback';
import { Field, Input, Select } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Pagination, TBody, TD, TH, THead, TR, TableWrap } from '@/components/ui/Table';
import { useDevices, useOrganizations } from '@/hooks/queries';
import { api } from '@/lib/api';
import { formatRelative } from '@/lib/format';
import { ARM_MODE, DEVICE_STATUS, LANGUAGE, describe } from '@/lib/labels';
import { useAuthStore } from '@/store/auth';
import { useUiStore } from '@/store/ui';
import type { ArmMode, DeviceStatus, Language } from '@/types/api';

const MANAGER_ROLES = [
  'SUPER_ADMIN',
  'NATIONAL_DIRECTOR',
  'TECHNICAL_DIRECTOR',
  'PLATFORM_MANAGER',
  'TECHNICIAN',
  'AGENCY_MANAGER',
] as const;

const STATUSES: DeviceStatus[] = ['PROVISIONED', 'ACTIVE', 'OFFLINE', 'DISABLED'];
const ARM_MODES: ArmMode[] = [0, 1, 2];

const emptyDevice = {
  serialNumber: '',
  model: 'SafAlert Solar G1',
  imei: '',
  simNumber: '',
  alarmPhoneNumber: '',
  organizationId: '',
  language: 'fr' as Language,
};

export const DevicesPage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pushToast = useUiStore((state) => state.pushToast);
  const hasRole = useAuthStore((state) => state.hasRole);
  const canManage = hasRole(...MANAGER_ROLES);

  const [page, setPage] = useState(1);
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [armMode, setArmMode] = useState('');
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(emptyDevice);

  const params = useMemo(
    () => ({
      page,
      limit: 20,
      order: 'desc' as const,
      ...(search ? { search } : {}),
      ...(status ? { status } : {}),
      ...(armMode ? { armMode } : {}),
      ...(unassignedOnly ? { unassignedOnly: 'true' } : {}),
    }),
    [page, search, status, armMode, unassignedOnly],
  );

  const devicesQuery = useDevices(params);
  const agenciesQuery = useOrganizations({ limit: 100, type: 'AGENCY' });

  const provision = useMutation({
    mutationFn: async () =>
      api.post('/devices', {
        serialNumber: form.serialNumber.trim(),
        model: form.model.trim() || undefined,
        language: form.language,
        ...(form.imei ? { imei: form.imei.trim() } : {}),
        ...(form.simNumber ? { simNumber: form.simNumber.trim() } : {}),
        ...(form.alarmPhoneNumber ? { alarmPhoneNumber: form.alarmPhoneNumber.trim() } : {}),
        ...(form.organizationId ? { organizationId: form.organizationId } : {}),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['devices'] });
      setFormOpen(false);
      setForm(emptyDevice);
      pushToast({ tone: 'success', title: 'Dispositif provisionné', description: 'Il peut maintenant être rattaché à un client.' });
    },
    onError: (error: Error) => pushToast({ tone: 'danger', title: 'Provisionnement refusé', description: error.message }),
  });

  const setArm = useMutation({
    mutationFn: async (input: { deviceId: string; mode: ArmMode }) =>
      api.post(`/devices/${input.deviceId}/arm-mode`, { mode: input.mode }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['devices'] });
      pushToast({ tone: 'brand', title: 'Commande transmise', description: 'La centrale appliquera le mode des reception.' });
    },
    onError: (error: Error) => pushToast({ tone: 'danger', title: 'Commande refusée', description: error.message }),
  });

  return (
    <div className="space-y-5">
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
                placeholder="Numéro de série, IMEI, SIM, client..."
                className="pl-9"
              />
            </form>

            <button
              type="button"
              onClick={() => {
                setUnassignedOnly((current) => !current);
                setPage(1);
              }}
              className={
                unassignedOnly
                  ? 'rounded-lg border border-brand-300 bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700 dark:border-brand-500/40 dark:bg-brand-500/10 dark:text-brand-300'
                  : 'rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800/50'
              }
            >
              Stock non installe
            </button>

            {canManage ? (
              <Button icon={<Plus className="h-4 w-4" />} onClick={() => setFormOpen(true)}>
                Provisionner
              </Button>
            ) : null}
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <Select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="">Tous les états</option>
              {STATUSES.map((value) => (
                <option key={value} value={value}>
                  {describe(DEVICE_STATUS, value).label}
                </option>
              ))}
            </Select>
            <Select
              value={armMode}
              onChange={(event) => {
                setArmMode(event.target.value);
                setPage(1);
              }}
            >
              <option value="">Tous les modes</option>
              {ARM_MODES.map((value) => (
                <option key={value} value={value}>
                  {describe(ARM_MODE, value).label}
                </option>
              ))}
            </Select>
          </div>
        </CardBody>
      </Card>

      <Card className="overflow-hidden">
        {devicesQuery.isLoading ? (
          <TableSkeleton rows={8} columns={6} />
        ) : devicesQuery.isError ? (
          <ErrorState onRetry={() => void devicesQuery.refetch()} />
        ) : (devicesQuery.data?.items.length ?? 0) === 0 ? (
          <EmptyState
            title="Aucun dispositif"
            description="Provisionnez les kits SafAlert Solar G1 avant de les rattacher aux comptes clients."
            icon={<Cpu className="h-5 w-5" />}
            action={
              canManage ? (
                <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setFormOpen(true)}>
                  Provisionner un dispositif
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <TableWrap>
              <THead>
                <TH>Numéro de série</TH>
                <TH>Modèle</TH>
                <TH>Client</TH>
                <TH>Agence</TH>
                <TH>État</TH>
                <TH>Armement</TH>
                <TH>Firmware</TH>
                <TH className="text-right">Dernier signe</TH>
                <TH className="text-right">Actions</TH>
              </THead>
              <TBody>
                {devicesQuery.data?.items.map((device) => (
                  <TR key={device.id} onClick={() => navigate(`/dispositifs/${device.id}`)}>
                    <TD className="font-mono text-xs font-semibold text-slate-900 dark:text-white">
                      <span className="flex items-center gap-2">
                        {device.status === 'ACTIVE' ? (
                          <Wifi className="h-3.5 w-3.5 text-emerald-500" />
                        ) : (
                          <WifiOff className="h-3.5 w-3.5 text-slate-400" />
                        )}
                        {device.serialNumber}
                      </span>
                    </TD>
                    <TD className="text-xs">{device.model}</TD>
                    <TD className="max-w-[180px] truncate text-xs">
                      {device.client?.fullName ?? <span className="text-slate-400">En stock</span>}
                    </TD>
                    <TD className="max-w-[160px] truncate text-xs">{device.organization?.name ?? '—'}</TD>
                    <TD>
                      <Badge tone={describe(DEVICE_STATUS, device.status).tone} dot={device.status === 'OFFLINE'}>
                        {describe(DEVICE_STATUS, device.status).label}
                      </Badge>
                    </TD>
                    <TD>
                      <Badge tone={describe(ARM_MODE, device.armMode).tone}>
                        {describe(ARM_MODE, device.armMode).label}
                      </Badge>
                    </TD>
                    <TD className="text-xs tabular-nums">{device.firmwareVersion ?? '—'}</TD>
                    <TD className="text-right text-xs whitespace-nowrap text-slate-500 dark:text-slate-400">
                      {formatRelative(device.lastHeartbeatAt ?? device.lastSeenAt)}
                    </TD>
                    <TD className="text-right">
                      {canManage ? (
                        <span className="inline-flex gap-1" onClick={(event) => event.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Armer"
                            disabled={device.armMode === 1}
                            onClick={() => setArm.mutate({ deviceId: device.id, mode: 1 })}
                          >
                            <Lock className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Désarmer"
                            disabled={device.armMode === 0}
                            onClick={() => setArm.mutate({ deviceId: device.id, mode: 0 })}
                          >
                            <LockOpen className="h-3.5 w-3.5" />
                          </Button>
                        </span>
                      ) : (
                        <ChevronRight className="ml-auto h-4 w-4 text-slate-300 dark:text-slate-600" />
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </TableWrap>
            {devicesQuery.data ? <Pagination page={devicesQuery.data} onPageChange={setPage} /> : null}
          </>
        )}
      </Card>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="Provisionner un dispositif"
        description="Le numéro de série figure sur l'étiquette de la centrale SafAlert Solar G1."
        footer={
          <>
            <Button variant="ghost" onClick={() => setFormOpen(false)}>
              Annuler
            </Button>
            <Button loading={provision.isPending} disabled={!form.serialNumber.trim()} onClick={() => provision.mutate()}>
              Provisionner
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Numéro de série" required>
            <Input
              value={form.serialNumber}
              onChange={(event) => setForm({ ...form, serialNumber: event.target.value })}
              placeholder="3003004fba2394"
              className="font-mono"
            />
          </Field>
          <Field label="Modèle">
            <Input value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })} />
          </Field>
          <Field label="IMEI">
            <Input value={form.imei} onChange={(event) => setForm({ ...form, imei: event.target.value })} />
          </Field>
          <Field label="Numéro SIM data">
            <Input value={form.simNumber} onChange={(event) => setForm({ ...form, simNumber: event.target.value })} />
          </Field>
          <Field label="Numéro d'appel des alarmes" hint="Numéro composé par la centrale">
            <Input
              value={form.alarmPhoneNumber}
              onChange={(event) => setForm({ ...form, alarmPhoneNumber: event.target.value })}
              placeholder="+243970255599"
            />
          </Field>
          <Field label="Agence proprietaire">
            <Select
              value={form.organizationId}
              onChange={(event) => setForm({ ...form, organizationId: event.target.value })}
            >
              <option value="">Stock national</option>
              {agenciesQuery.data?.items.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name} ({organization.code})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Langue des messages vocaux">
            <Select
              value={form.language}
              onChange={(event) => setForm({ ...form, language: event.target.value as Language })}
            >
              {Object.entries(LANGUAGE).map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Modal>
    </div>
  );
};
