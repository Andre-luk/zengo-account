import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  BadgeCheck,
  Coins,
  Cpu,
  Link2,
  Phone,
  ShieldCheck,
  Unlink,
  Wrench,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, DataRow, DescriptionList } from '@/components/ui/Card';
import { EmptyState, ErrorState, InlineEmpty, Skeleton, TableSkeleton } from '@/components/ui/Feedback';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Tabs } from '@/components/ui/Tabs';
import { TBody, TD, TH, THead, TR, TableWrap } from '@/components/ui/Table';
import { useAlerts, useClient, useClientPricing } from '@/hooks/queries';
import { api } from '@/lib/api';
import { formatCoordinates, formatDate, formatMoney, formatRelative } from '@/lib/format';
import {
  ALERT_STATUS,
  ALERT_TYPE,
  ARM_MODE,
  CLIENT_STATUS,
  DEVICE_STATUS,
  DISPATCH_STATUS,
  LANGUAGE,
  OFFER_PACK,
  SUB_DEVICE_CODE,
  SUBSCRIPTION_STATUS,
  describe,
} from '@/lib/labels';
import { useAuthStore } from '@/store/auth';
import { useUiStore } from '@/store/ui';
import type { ClientStatus } from '@/types/api';

const MANAGE_ROLES = [
  'SUPER_ADMIN',
  'NATIONAL_DIRECTOR',
  'TECHNICAL_DIRECTOR',
  'PLATFORM_MANAGER',
  'REGION_MANAGER',
  'AGENCY_MANAGER',
  'ACCOUNTANT',
] as const;

const TECH_ROLES = ['SUPER_ADMIN', 'TECHNICAL_DIRECTOR', 'PLATFORM_MANAGER', 'TECHNICIAN'] as const;

const STATUSES: ClientStatus[] = ['PENDING', 'ACTIVE', 'SUSPENDED', 'EXPIRED', 'ARCHIVED'];

export const ClientDetailPage = () => {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pushToast = useUiStore((state) => state.pushToast);
  const hasRole = useAuthStore((state) => state.hasRole);

  const [tab, setTab] = useState('dossier');
  const [editOpen, setEditOpen] = useState(false);
  const [kitOpen, setKitOpen] = useState(false);
  const [serial, setSerial] = useState('');
  const [editForm, setEditForm] = useState({
    primaryPhone: '',
    secondaryPhone: '',
    address: '',
    city: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    notes: '',
  });

  const clientQuery = useClient(clientId);
  const pricingQuery = useClientPricing(clientId);
  const alertsQuery = useAlerts({ clientId: clientId ?? '', limit: 20 });

  const client = clientQuery.data;
  const canManage = hasRole(...MANAGE_ROLES);
  const canTechnical = hasRole(...TECH_ROLES);

  const reportError = (message: string) =>
    pushToast({ tone: 'danger', title: 'Opération refusée', description: message });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['clients'] });
  };

  const changeStatus = useMutation({
    mutationFn: async (status: ClientStatus) => api.patch(`/clients/${clientId}/status`, { status }),
    onSuccess: () => {
      invalidate();
      pushToast({ tone: 'success', title: 'Statut du compte mis à jour' });
    },
    onError: (error: Error) => reportError(error.message),
  });

  const attachKit = useMutation({
    mutationFn: async () => api.post(`/clients/${clientId}/device`, { serialNumber: serial.trim() }),
    onSuccess: () => {
      invalidate();
      setKitOpen(false);
      setSerial('');
      pushToast({ tone: 'success', title: 'Kit SafAlert rattaché au compte' });
    },
    onError: (error: Error) => reportError(error.message),
  });

  const detachKit = useMutation({
    mutationFn: async () => api.delete(`/clients/${clientId}/device`),
    onSuccess: () => {
      invalidate();
      pushToast({ tone: 'neutral', title: 'Kit détaché du compte' });
    },
    onError: (error: Error) => reportError(error.message),
  });

  const completeInstallation = useMutation({
    mutationFn: async () => api.post(`/clients/${clientId}/installation`, { deviceId: client?.device?.id }),
    onSuccess: () => {
      invalidate();
      pushToast({
        tone: 'success',
        title: 'Installation finalisée',
        description: "Le compte est actif et l'abonnement demarre.",
      });
    },
    onError: (error: Error) => reportError(error.message),
  });

  const updateClient = useMutation({
    mutationFn: async () => {
      const payload = Object.fromEntries(Object.entries(editForm).filter(([, value]) => value !== ''));
      return api.patch(`/clients/${clientId}`, payload);
    },
    onSuccess: () => {
      invalidate();
      setEditOpen(false);
      pushToast({ tone: 'success', title: 'Fiche client mise à jour' });
    },
    onError: (error: Error) => reportError(error.message),
  });

  const openEdit = () => {
    if (!client) return;
    setEditForm({
      primaryPhone: client.primaryPhone,
      secondaryPhone: client.secondaryPhone ?? '',
      address: client.address ?? '',
      city: client.city ?? '',
      emergencyContactName: client.emergencyContactName ?? '',
      emergencyContactPhone: client.emergencyContactPhone ?? '',
      notes: client.notes ?? '',
    });
    setEditOpen(true);
  };

  if (clientQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (clientQuery.isError || !client) {
    return <ErrorState message="Fiche client introuvable ou hors de votre périmètre." onRetry={() => void clientQuery.refetch()} />;
  }

  const pricing = pricingQuery.data;

  return (
    <div className="space-y-5">
      {/* En-tete */}
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/clients')} aria-label="Retour">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{client.fullName}</h2>
                <Badge tone={describe(CLIENT_STATUS, client.status).tone} dot>
                  {describe(CLIENT_STATUS, client.status).label}
                </Badge>
                <Badge tone={describe(SUBSCRIPTION_STATUS, client.subscriptionStatus).tone}>
                  {describe(SUBSCRIPTION_STATUS, client.subscriptionStatus).label}
                </Badge>
              </div>
              <p className="mt-1 font-mono text-sm text-slate-500 dark:text-slate-400">{client.zengoId}</p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {client.companyName ? `${client.companyName} · ` : ''}
                {client.organization?.name ?? '—'} · {client.city ?? 'ville non renseignée'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canManage ? (
              <Button variant="secondary" size="sm" onClick={openEdit}>
                Modifier la fiche
              </Button>
            ) : null}
            {canTechnical && !client.device ? (
              <Button size="sm" icon={<Link2 className="h-3.5 w-3.5" />} onClick={() => setKitOpen(true)}>
                Rattacher un kit
              </Button>
            ) : null}
            {canTechnical && client.device && !client.installationDate ? (
              <Button
                size="sm"
                icon={<Wrench className="h-3.5 w-3.5" />}
                loading={completeInstallation.isPending}
                onClick={() => completeInstallation.mutate()}
              >
                Finaliser l'installation
              </Button>
            ) : null}
            {canManage ? (
              <Select
                className="w-auto"
                value={client.status}
                onChange={(event) => changeStatus.mutate(event.target.value as ClientStatus)}
              >
                {STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {describe(CLIENT_STATUS, status).label}
                  </option>
                ))}
              </Select>
            ) : null}
          </div>
        </div>
      </Card>

      <Tabs
        items={[
          { id: 'dossier', label: 'Dossier client' },
          { id: 'facturation', label: 'Facturation' },
          { id: 'alertes', label: 'Historique alertes', count: alertsQuery.data?.total },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'dossier' ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader title="Coordonnees" icon={<Phone className="h-4 w-4" />} />
            <CardBody className="pt-2">
              <DescriptionList>
                <DataRow label="Téléphone principal" value={client.primaryPhone} />
                <DataRow label="Téléphone secondaire" value={client.secondaryPhone ?? '—'} />
                <DataRow label="Contact d'urgence" value={client.emergencyContactName ?? '—'} />
                <DataRow label="Téléphone d'urgence" value={client.emergencyContactPhone ?? '—'} />
                <DataRow label="Langue préférée" value={LANGUAGE[client.preferredLanguage] ?? client.preferredLanguage} />
                <DataRow label="Adresse" value={client.address ?? '—'} />
                <DataRow label="Ville / pays" value={`${client.city ?? '—'} · ${client.country ?? '—'}`} />
                <DataRow
                  label="Coordonnees GPS"
                  value={<span className="font-mono text-xs">{formatCoordinates(client.latitude, client.longitude)}</span>}
                />
                <DataRow label="Notes" value={client.notes ?? '—'} />
              </DescriptionList>
            </CardBody>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader title="Equipement" icon={<Cpu className="h-4 w-4" />} />
              <CardBody className="pt-2">
                {client.device ? (
                  <DescriptionList>
                    <DataRow
                      label="Centrale"
                      value={
                        <Link
                          to={`/dispositifs/${client.device.id}`}
                          className="font-mono text-brand-600 hover:underline dark:text-brand-400"
                        >
                          {client.device.serialNumber}
                        </Link>
                      }
                    />
                    <DataRow label="Modèle" value={client.device.model} />
                    <DataRow
                      label="État"
                      value={
                        <Badge tone={describe(DEVICE_STATUS, client.device.status).tone}>
                          {describe(DEVICE_STATUS, client.device.status).label}
                        </Badge>
                      }
                    />
                    <DataRow
                      label="Armement"
                      value={
                        <Badge tone={describe(ARM_MODE, client.device.armMode).tone}>
                          {describe(ARM_MODE, client.device.armMode).label}
                        </Badge>
                      }
                    />
                    <DataRow label="Dernier signe de vie" value={formatRelative(client.device.lastHeartbeatAt)} />
                  </DescriptionList>
                ) : (
                  <InlineEmpty>Aucun kit SafAlert rattaché à ce compte.</InlineEmpty>
                )}
                {canTechnical && client.device ? (
                  <div className="mt-3 flex justify-end">
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Unlink className="h-3.5 w-3.5" />}
                      loading={detachKit.isPending}
                      onClick={() => detachKit.mutate()}
                    >
                      Détacher le kit
                    </Button>
                  </div>
                ) : null}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Abonnement" icon={<ShieldCheck className="h-4 w-4" />} />
              <CardBody className="pt-2">
                <DescriptionList>
                  <DataRow label="Pack" value={describe(OFFER_PACK, client.offerPack).label} />
                  <DataRow label="Groupe tarifaire" value={client.tariffGroup?.name ?? '—'} />
                  <DataRow label="Installation" value={client.installationDate ? formatDate(client.installationDate) : 'Non installe'} />
                  <DataRow
                    label="Expiration"
                    value={client.subscriptionExpiresAt ? formatDate(client.subscriptionExpiresAt) : '—'}
                  />
                  <DataRow label="Dernier paiement" value={client.lastPaymentAt ? formatDate(client.lastPaymentAt) : '—'} />
                  <DataRow label="Boutons SOS" value={client.sosButtonCount} />
                </DescriptionList>
              </CardBody>
            </Card>
          </div>
        </div>
      ) : null}

      {tab === 'facturation' ? (
        pricingQuery.isLoading ? (
          <Skeleton className="h-56 w-full" />
        ) : pricingQuery.isError || !pricing ? (
          <EmptyState
            title="Tarification indisponible"
            description="Aucun groupe tarifaire n'est appliqué à ce compte ou l'information n'est pas accessible."
            icon={<Coins className="h-5 w-5" />}
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Kit SafAlert solar G1" description={pricing.tariffGroupName} icon={<Coins className="h-4 w-4" />} />
              <CardBody className="pt-2">
                <DescriptionList>
                  <DataRow label="Frais de souscription" value={formatMoney(pricing.registrationFeeUsd, 'USD')} />
                  <DataRow
                    label={`Boutons SOS supplémentaires (${pricing.extraSosButtons})`}
                    value={formatMoney(pricing.sosButtonsTotalUsd, 'USD')}
                  />
                  <DataRow
                    label="Total à payer"
                    value={
                      <span className="text-base font-semibold text-brand-700 dark:text-brand-300">
                        {formatMoney(pricing.totalKitUsd, pricing.currency)}
                      </span>
                    }
                  />
                  {pricing.totalKitCdf ? (
                    <DataRow label="Équivalent CDF" value={formatMoney(pricing.totalKitCdf, 'CDF')} />
                  ) : null}
                </DescriptionList>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Abonnement mensuel" description="Facture en debut de mois" icon={<BadgeCheck className="h-4 w-4" />} />
              <CardBody className="pt-2">
                <DescriptionList>
                  <DataRow label="Montant mensuel" value={formatMoney(pricing.totalMonthlyUsd, 'USD')} />
                  {pricing.totalMonthlyCdf ? (
                    <DataRow label="Équivalent CDF" value={formatMoney(pricing.totalMonthlyCdf, 'CDF')} />
                  ) : null}
                  <DataRow label="Devise de facturation" value={pricing.currency} />
                  <DataRow
                    label="Taux applique"
                    value={pricing.exchangeRateUsdToCdf ? `1 USD = ${pricing.exchangeRateUsdToCdf} CDF` : '—'}
                  />
                  <DataRow label="Boutons inclus" value={pricing.includedSosButtons} />
                </DescriptionList>
              </CardBody>
            </Card>
          </div>
        )
      ) : null}

      {tab === 'alertes' ? (
        <Card className="overflow-hidden">
          {alertsQuery.isLoading ? (
            <TableSkeleton rows={5} columns={5} />
          ) : (alertsQuery.data?.items.length ?? 0) === 0 ? (
            <EmptyState title="Aucune alerte enregistrée" description="Ce client n'a jamais déclenche d'alerte." />
          ) : (
            <TableWrap>
              <THead>
                <TH>Référence</TH>
                <TH>Nature</TH>
                <TH>Statut</TH>
                <TH>Engagement</TH>
                <TH className="text-right">Déclenchée</TH>
              </THead>
              <TBody>
                {alertsQuery.data?.items.map((alert) => (
                  <TR key={alert.id} onClick={() => navigate(`/alertes/${alert.id}`)}>
                    <TD className="font-mono text-xs font-semibold">{alert.reference}</TD>
                    <TD>{describe(ALERT_TYPE, alert.type).label}</TD>
                    <TD>
                      <Badge tone={describe(ALERT_STATUS, alert.status).tone}>{describe(ALERT_STATUS, alert.status).label}</Badge>
                    </TD>
                    <TD className="text-xs">
                      {alert.dispatches?.length
                        ? alert.dispatches.map((item) => (
                            <Badge key={item.id} tone={describe(DISPATCH_STATUS, item.status).tone} className="mr-1">
                              {item.station?.name ?? 'Station'}
                            </Badge>
                          ))
                        : '—'}
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
      ) : null}

      {/* Sous-appareils du kit */}
      {client.device?.subDevices?.length ? (
        <Card className="overflow-hidden">
          <CardHeader
            title="Sous-appareils déclarés"
            description={`Centrale ${client.device.serialNumber}`}
            icon={<Cpu className="h-4 w-4" />}
          />
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
              {client.device.subDevices.map((subDevice) => (
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
        </Card>
      ) : null}

      {/* Rattachement d'un kit */}
      <Modal
        open={kitOpen}
        onClose={() => setKitOpen(false)}
        title="Rattacher un kit SafAlert"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setKitOpen(false)}>
              Annuler
            </Button>
            <Button loading={attachKit.isPending} disabled={!serial.trim()} onClick={() => attachKit.mutate()}>
              Rattacher
            </Button>
          </>
        }
      >
        <Field label="Numéro de série de la centrale" hint="Le dispositif doit avoir ete provisionné au préalable." required>
          <Input
            value={serial}
            onChange={(event) => setSerial(event.target.value)}
            placeholder="3003004fba2394"
            className="font-mono"
          />
        </Field>
      </Modal>

      {/* Edition de la fiche */}
      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Modifier la fiche client"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditOpen(false)}>
              Annuler
            </Button>
            <Button loading={updateClient.isPending} onClick={() => updateClient.mutate()}>
              Enregistrer
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Téléphone principal">
            <Input
              value={editForm.primaryPhone}
              onChange={(event) => setEditForm({ ...editForm, primaryPhone: event.target.value })}
            />
          </Field>
          <Field label="Téléphone secondaire">
            <Input
              value={editForm.secondaryPhone}
              onChange={(event) => setEditForm({ ...editForm, secondaryPhone: event.target.value })}
            />
          </Field>
          <Field label="Contact d'urgence">
            <Input
              value={editForm.emergencyContactName}
              onChange={(event) => setEditForm({ ...editForm, emergencyContactName: event.target.value })}
            />
          </Field>
          <Field label="Téléphone d'urgence">
            <Input
              value={editForm.emergencyContactPhone}
              onChange={(event) => setEditForm({ ...editForm, emergencyContactPhone: event.target.value })}
            />
          </Field>
          <Field label="Adresse" className="sm:col-span-2">
            <Input value={editForm.address} onChange={(event) => setEditForm({ ...editForm, address: event.target.value })} />
          </Field>
          <Field label="Ville">
            <Input value={editForm.city} onChange={(event) => setEditForm({ ...editForm, city: event.target.value })} />
          </Field>
          <Field label="Notes internes" className="sm:col-span-2">
            <Textarea
              rows={3}
              value={editForm.notes}
              onChange={(event) => setEditForm({ ...editForm, notes: event.target.value })}
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
};
