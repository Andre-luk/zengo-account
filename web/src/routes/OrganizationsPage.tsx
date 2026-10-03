import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, Factory, MapPin, Plus, Search, ShieldAlert, Warehouse } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/Feedback';
import { Field, Input, Select } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Pagination, TBody, TD, TH, THead, TR, TableWrap } from '@/components/ui/Table';
import { useOrganizations } from '@/hooks/queries';
import { api } from '@/lib/api';
import { ORGANIZATION_STATUS, ORGANIZATION_TYPE, STATION_TYPE, describe } from '@/lib/labels';
import { useAuthStore } from '@/store/auth';
import { useUiStore } from '@/store/ui';
import type { OrganizationStatus, OrganizationType, StationType } from '@/types/api';

const CREATE_ROLES = ['SUPER_ADMIN', 'NATIONAL_DIRECTOR', 'TECHNICAL_DIRECTOR'] as const;
const STATUS_ROLES = ['SUPER_ADMIN', 'NATIONAL_DIRECTOR', 'TECHNICAL_DIRECTOR'] as const;

const TYPES: OrganizationType[] = ['NATIONAL', 'REGION', 'AGENCY', 'STATION', 'ENTERPRISE'];
const STATUSES: OrganizationStatus[] = ['ACTIVE', 'SUSPENDED', 'ARCHIVED'];
const STATION_TYPES: StationType[] = ['FIRE', 'MEDICAL', 'INTRUSION', 'MIXED'];

const emptyForm = {
  name: '',
  code: '',
  type: 'AGENCY' as OrganizationType,
  stationType: '' as StationType | '',
  parentId: '',
  address: '',
  city: '',
  contactPhone: '',
  contactEmail: '',
};

const TypeIcon = ({ type }: { type: OrganizationType }) => {
  const className = 'h-4 w-4';
  if (type === 'NATIONAL') return <Building2 className={className} />;
  if (type === 'REGION') return <MapPin className={className} />;
  if (type === 'STATION') return <ShieldAlert className={className} />;
  if (type === 'ENTERPRISE') return <Factory className={className} />;
  return <Warehouse className={className} />;
};

export const OrganizationsPage = () => {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((state) => state.pushToast);
  const hasRole = useAuthStore((state) => state.hasRole);
  const canCreate = hasRole(...CREATE_ROLES);
  const canChangeStatus = hasRole(...STATUS_ROLES);

  const [page, setPage] = useState(1);
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const params = useMemo(
    () => ({
      page,
      limit: 25,
      order: 'asc' as const,
      ...(search ? { search } : {}),
      ...(type ? { type } : {}),
      ...(status ? { status } : {}),
    }),
    [page, search, type, status],
  );

  const organizationsQuery = useOrganizations(params);
  const parentsQuery = useOrganizations({ limit: 100 });

  const create = useMutation({
    mutationFn: async () =>
      api.post('/organizations', {
        name: form.name.trim(),
        code: form.code.trim().toUpperCase(),
        type: form.type,
        ...(form.type === 'STATION' && form.stationType ? { stationType: form.stationType } : {}),
        ...(form.parentId ? { parentId: form.parentId } : {}),
        ...(form.address ? { address: form.address.trim() } : {}),
        ...(form.city ? { city: form.city.trim() } : {}),
        ...(form.contactPhone ? { contactPhone: form.contactPhone.trim() } : {}),
        ...(form.contactEmail ? { contactEmail: form.contactEmail.trim() } : {}),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['organizations'] });
      setFormOpen(false);
      setForm(emptyForm);
      pushToast({ tone: 'success', title: 'Organisation créée' });
    },
    onError: (error: Error) => pushToast({ tone: 'danger', title: 'Création impossible', description: error.message }),
  });

  const changeStatus = useMutation({
    mutationFn: async (input: { id: string; status: OrganizationStatus }) =>
      api.patch(`/organizations/${input.id}/status`, { status: input.status }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['organizations'] });
      pushToast({ tone: 'success', title: 'Statut mis à jour' });
    },
    onError: (error: Error) => pushToast({ tone: 'danger', title: 'Modification refusée', description: error.message }),
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
                placeholder="Nom, code, ville..."
                className="pl-9"
              />
            </form>
            {canCreate ? (
              <Button icon={<Plus className="h-4 w-4" />} onClick={() => setFormOpen(true)}>
                Nouvelle organisation
              </Button>
            ) : null}
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <Select
              value={type}
              onChange={(event) => {
                setType(event.target.value);
                setPage(1);
              }}
            >
              <option value="">Tous les niveaux</option>
              {TYPES.map((value) => (
                <option key={value} value={value}>
                  {describe(ORGANIZATION_TYPE, value).label}
                </option>
              ))}
            </Select>
            <Select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="">Tous les statuts</option>
              {STATUSES.map((value) => (
                <option key={value} value={value}>
                  {describe(ORGANIZATION_STATUS, value).label}
                </option>
              ))}
            </Select>
          </div>
        </CardBody>
      </Card>

      <Card className="overflow-hidden">
        {organizationsQuery.isLoading ? (
          <TableSkeleton rows={8} columns={5} />
        ) : organizationsQuery.isError ? (
          <ErrorState onRetry={() => void organizationsQuery.refetch()} />
        ) : (organizationsQuery.data?.items.length ?? 0) === 0 ? (
          <EmptyState
            title="Aucune organisation"
            description="La hiérarchie nationale, les zones et les agences structurent le périmètre de sécurité."
            icon={<Building2 className="h-5 w-5" />}
          />
        ) : (
          <>
            <TableWrap>
              <THead>
                <TH>Code</TH>
                <TH>Nom</TH>
                <TH>Niveau</TH>
                <TH>Ville</TH>
                <TH>Contact</TH>
                <TH>Profondeur</TH>
                <TH>Statut</TH>
                {canChangeStatus ? <TH className="text-right">Actions</TH> : null}
              </THead>
              <TBody>
                {organizationsQuery.data?.items.map((organization) => (
                  <TR key={organization.id}>
                    <TD className="font-mono text-xs font-semibold text-slate-900 dark:text-white">{organization.code}</TD>
                    <TD>
                      <span className="flex items-center gap-2">
                        <TypeIcon type={organization.type} />
                        <span className="truncate">{organization.name}</span>
                      </span>
                    </TD>
                    <TD className="whitespace-nowrap text-xs">
                      {describe(ORGANIZATION_TYPE, organization.type).label}
                      {organization.stationType ? (
                        <Badge tone={describe(STATION_TYPE, organization.stationType).tone} className="ml-2">
                          {describe(STATION_TYPE, organization.stationType).label}
                        </Badge>
                      ) : null}
                    </TD>
                    <TD className="text-xs">{organization.city ?? '—'}</TD>
                    <TD className="text-xs">
                      {organization.contactPhone ?? '—'}
                      {organization.contactEmail ? (
                        <span className="block text-slate-400">{organization.contactEmail}</span>
                      ) : null}
                    </TD>
                    <TD className="text-xs tabular-nums text-slate-500 dark:text-slate-400">niveau {organization.depth}</TD>
                    <TD>
                      <Badge tone={describe(ORGANIZATION_STATUS, organization.status).tone}>
                        {describe(ORGANIZATION_STATUS, organization.status).label}
                      </Badge>
                    </TD>
                    {canChangeStatus ? (
                      <TD className="text-right">
                        <Button
                          size="sm"
                          variant={organization.status === 'SUSPENDED' ? 'secondary' : 'ghost'}
                          loading={changeStatus.isPending}
                          onClick={() =>
                            changeStatus.mutate({
                              id: organization.id,
                              status: organization.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED',
                            })
                          }
                        >
                          {organization.status === 'SUSPENDED' ? 'Réactiver' : 'Suspendre'}
                        </Button>
                      </TD>
                    ) : null}
                  </TR>
                ))}
              </TBody>
            </TableWrap>
            {organizationsQuery.data ? <Pagination page={organizationsQuery.data} onPageChange={setPage} /> : null}
          </>
        )}
      </Card>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="Nouvelle organisation"
        description="Une station d'intervention est rattachée à une agence (point de distribution) pour recevoir les missions."
        footer={
          <>
            <Button variant="ghost" onClick={() => setFormOpen(false)}>
              Annuler
            </Button>
            <Button
              loading={create.isPending}
              disabled={!form.name.trim() || !form.code.trim() || (form.type !== 'NATIONAL' && !form.parentId)}
              onClick={() => create.mutate()}
            >
              Créer
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nom" required>
            <Input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="Agence Kinshasa Centre"
            />
          </Field>
          <Field label="Code court" hint="Majuscules, chiffres et tirets" required>
            <Input
              value={form.code}
              onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })}
              placeholder="KIN-C"
              className="font-mono"
            />
          </Field>
          <Field label="Niveau" required>
            <Select
              value={form.type}
              onChange={(event) => setForm({ ...form, type: event.target.value as OrganizationType })}
            >
              {TYPES.map((value) => (
                <option key={value} value={value}>
                  {describe(ORGANIZATION_TYPE, value).label}
                </option>
              ))}
            </Select>
          </Field>
          {form.type === 'STATION' ? (
            <Field label="Famille de mission" required>
              <Select
                value={form.stationType}
                onChange={(event) => setForm({ ...form, stationType: event.target.value as StationType })}
              >
                <option value="">Sélectionner…</option>
                {STATION_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {describe(STATION_TYPE, value).label}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <Field label="Rattachement" hint="Zone pour une agence, agence pour une station" required={form.type !== 'NATIONAL'}>
            <Select value={form.parentId} onChange={(event) => setForm({ ...form, parentId: event.target.value })}>
              <option value="">Aucun (niveau national)</option>
              {parentsQuery.data?.items.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {describe(ORGANIZATION_TYPE, organization.type).label} — {organization.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Ville">
            <Input value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} />
          </Field>
          <Field label="Adresse" className="sm:col-span-2">
            <Input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} />
          </Field>
          <Field label="Téléphone">
            <Input value={form.contactPhone} onChange={(event) => setForm({ ...form, contactPhone: event.target.value })} />
          </Field>
          <Field label="Email">
            <Input
              type="email"
              value={form.contactEmail}
              onChange={(event) => setForm({ ...form, contactEmail: event.target.value })}
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
};
