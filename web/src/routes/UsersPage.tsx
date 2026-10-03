import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy, KeyRound, Plus, Search, ShieldCheck, UserCog, UserPlus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/Feedback';
import { Field, Input, Select } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Pagination, TBody, TD, TH, THead, TR, TableWrap } from '@/components/ui/Table';
import { useOrganizations, useUsers } from '@/hooks/queries';
import { api } from '@/lib/api';
import { formatDateTime, formatRelative, initials } from '@/lib/format';
import { LANGUAGE, ROLE, USER_STATUS, describe } from '@/lib/labels';
import { useAuthStore } from '@/store/auth';
import { useUiStore } from '@/store/ui';
import type { Language, Role, User, UserStatus } from '@/types/api';

const MANAGER_ROLES = [
  'SUPER_ADMIN',
  'NATIONAL_DIRECTOR',
  'TECHNICAL_DIRECTOR',
  'PLATFORM_MANAGER',
  'REGION_MANAGER',
  'AGENCY_MANAGER',
] as const;

const STATUSES: UserStatus[] = ['PENDING', 'ACTIVE', 'SUSPENDED', 'DISABLED'];
const ROLES: Role[] = [
  'SUPER_ADMIN',
  'NATIONAL_DIRECTOR',
  'TECHNICAL_DIRECTOR',
  'PLATFORM_MANAGER',
  'DAF',
  'ACCOUNTANT',
  'QUALITY_DIRECTOR',
  'REGION_MANAGER',
  'AGENCY_MANAGER',
  'TECHNICIAN',
  'OPERATOR',
  'SUPERVISOR',
  'STATION_AGENT',
  'FIELD_AGENT',
  'HEALTH_STAFF',
  'CLIENT_ADMIN',
  'CLIENT',
];

interface CreateUserResponse {
  user: User;
  temporaryPassword?: string;
}

const emptyForm = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  password: '',
  preferredLanguage: 'fr' as Language,
  status: 'ACTIVE' as UserStatus,
  organizationId: '',
  role: 'OPERATOR' as Role,
};

export const UsersPage = () => {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((state) => state.pushToast);
  const hasRole = useAuthStore((state) => state.hasRole);
  const canManage = hasRole(...MANAGER_ROLES);

  const [page, setPage] = useState(1);
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [credentials, setCredentials] = useState<{ title: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const params = useMemo(
    () => ({
      page,
      limit: 20,
      order: 'asc' as const,
      ...(search ? { search } : {}),
      ...(role ? { role } : {}),
      ...(status ? { status } : {}),
    }),
    [page, search, role, status],
  );

  const usersQuery = useUsers(params);
  const organizationsQuery = useOrganizations({ limit: 100 });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['users'] });

  const create = useMutation({
    mutationFn: async () =>
      api.post<CreateUserResponse>('/users', {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        preferredLanguage: form.preferredLanguage,
        status: form.status,
        ...(form.email ? { email: form.email.trim() } : {}),
        ...(form.phone ? { phone: form.phone.trim() } : {}),
        ...(form.password ? { password: form.password } : {}),
        ...(form.organizationId
          ? { memberships: [{ organizationId: form.organizationId, role: form.role, isPrimary: true }] }
          : {}),
      }),
    onSuccess: (data) => {
      invalidate();
      setFormOpen(false);
      setForm(emptyForm);
      if (data.temporaryPassword) {
        setCredentials({ title: `Identifiants de ${data.user.firstName} ${data.user.lastName}`, password: data.temporaryPassword });
      }
      pushToast({ tone: 'success', title: 'Utilisateur créé' });
    },
    onError: (error: Error) => pushToast({ tone: 'danger', title: 'Création impossible', description: error.message }),
  });

  const changeStatus = useMutation({
    mutationFn: async (input: { id: string; status: UserStatus }) =>
      api.patch(`/users/${input.id}/status`, { status: input.status }),
    onSuccess: () => {
      invalidate();
      pushToast({ tone: 'success', title: 'Statut mis à jour' });
    },
    onError: (error: Error) => pushToast({ tone: 'danger', title: 'Modification refusée', description: error.message }),
  });

  const resetPassword = useMutation({
    mutationFn: async (user: User) => ({ user, response: await api.post<CreateUserResponse>(`/users/${user.id}/reset-password`, {}) }),
    onSuccess: ({ user, response }) => {
      invalidate();
      if (response.temporaryPassword) {
        setCredentials({ title: `Nouveau mot de passe de ${user.firstName} ${user.lastName}`, password: response.temporaryPassword });
      } else {
        pushToast({ tone: 'success', title: 'Mot de passe réinitialisé' });
      }
    },
    onError: (error: Error) => pushToast({ tone: 'danger', title: 'Réinitialisation refusée', description: error.message }),
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
                placeholder="Nom, email, téléphone..."
                className="pl-9"
              />
            </form>
            {canManage ? (
              <Button icon={<UserPlus className="h-4 w-4" />} onClick={() => setFormOpen(true)}>
                Nouvel'utilisateur
              </Button>
            ) : null}
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <Select
              value={role}
              onChange={(event) => {
                setRole(event.target.value);
                setPage(1);
              }}
            >
              <option value="">Tous les roles</option>
              {ROLES.map((value) => (
                <option key={value} value={value}>
                  {describe(ROLE, value).label}
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
                  {describe(USER_STATUS, value).label}
                </option>
              ))}
            </Select>
          </div>
        </CardBody>
      </Card>

      <Card className="overflow-hidden">
        {usersQuery.isLoading ? (
          <TableSkeleton rows={8} columns={5} />
        ) : usersQuery.isError ? (
          <ErrorState onRetry={() => void usersQuery.refetch()} />
        ) : (usersQuery.data?.items.length ?? 0) === 0 ? (
          <EmptyState
            title="Aucun utilisateur"
            description="Creez les comptes des operateurs du ZMC, techniciens et agents de station."
            icon={<UserCog className="h-5 w-5" />}
          />
        ) : (
          <>
            <TableWrap>
              <THead>
                <TH>Utilisateur</TH>
                <TH>Identifiants</TH>
                <TH>Habilitations</TH>
                <TH>Statut</TH>
                <TH className="text-right">Dernière connexion</TH>
                {canManage ? <TH className="text-right">Actions</TH> : null}
              </THead>
              <TBody>
                {usersQuery.data?.items.map((user) => (
                  <TR key={user.id}>
                    <TD>
                      <span className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
                          {initials(user.firstName, user.lastName)}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-slate-800 dark:text-slate-100">
                            {user.firstName} {user.lastName}
                          </span>
                          <span className="block text-[11px] text-slate-400">
                            {LANGUAGE[user.preferredLanguage] ?? user.preferredLanguage}
                          </span>
                        </span>
                      </span>
                    </TD>
                    <TD className="text-xs">
                      <span className="block">{user.email ?? '—'}</span>
                      <span className="block text-slate-400">{user.phone ?? ''}</span>
                    </TD>
                    <TD>
                      <span className="flex flex-wrap gap-1">
                        {user.isSuperAdmin ? <Badge tone="critical">Super administrateur</Badge> : null}
                        {user.memberships.slice(0, 2).map((membership, index) => (
                          <Badge key={`${membership.organizationId}-${index}`} tone={describe(ROLE, membership.role).tone}>
                            {describe(ROLE, membership.role).label}
                          </Badge>
                        ))}
                        {user.memberships.length > 2 ? <Badge tone="neutral">+{user.memberships.length - 2}</Badge> : null}
                      </span>
                    </TD>
                    <TD>
                      <Badge tone={describe(USER_STATUS, user.status ?? 'ACTIVE').tone} dot={user.mustChangePassword}>
                        {describe(USER_STATUS, user.status ?? 'ACTIVE').label}
                      </Badge>
                      {user.twoFactorEnabled ? (
                        <span className="mt-1 flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
                          <ShieldCheck className="h-3 w-3" />
                          2FA
                        </span>
                      ) : null}
                    </TD>
                    <TD className="text-right text-xs whitespace-nowrap text-slate-500 dark:text-slate-400">
                      {user.lastLoginAt ? formatRelative(user.lastLoginAt) : 'Jamais'}
                    </TD>
                    {canManage ? (
                      <TD className="text-right">
                        <span className="inline-flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Réinitialiser le mot de passe"
                            onClick={() => resetPassword.mutate(user)}
                          >
                            <KeyRound className="h-3.5 w-3.5" />
                          </Button>
                          <Select
                            className="w-auto py-1 text-xs"
                            value={user.status ?? 'ACTIVE'}
                            onChange={(event) =>
                              changeStatus.mutate({ id: user.id, status: event.target.value as UserStatus })
                            }
                          >
                            {STATUSES.map((value) => (
                              <option key={value} value={value}>
                                {describe(USER_STATUS, value).label}
                              </option>
                            ))}
                          </Select>
                        </span>
                      </TD>
                    ) : null}
                  </TR>
                ))}
              </TBody>
            </TableWrap>
            {usersQuery.data ? <Pagination page={usersQuery.data} onPageChange={setPage} /> : null}
          </>
        )}
      </Card>

      {/* Création */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="Nouvel'utilisateur"
        description="L appartenance determine le périmètre de données et les actions autorisees."
        footer={
          <>
            <Button variant="ghost" onClick={() => setFormOpen(false)}>
              Annuler
            </Button>
            <Button
              loading={create.isPending}
              disabled={!form.firstName.trim() || !form.lastName.trim() || (!form.email && !form.phone)}
              onClick={() => create.mutate()}
            >
              Créer l'utilisateur
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Prenom" required>
            <Input value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} />
          </Field>
          <Field label="Nom" required>
            <Input value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} />
          </Field>
          <Field label="Email professionnel" hint="Ou téléphone ci-dessous">
            <Input
              type="email"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              placeholder="prenom.nom@zengo.cd"
            />
          </Field>
          <Field label="Téléphone">
            <Input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="+243970000000" />
          </Field>
          <Field label="Mot de passe initial" hint="Laissez vide pour un mot de passe temporaire généré">
            <Input
              type="password"
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
              placeholder="••••••••"
            />
          </Field>
          <Field label="Langue">
            <Select
              value={form.preferredLanguage}
              onChange={(event) => setForm({ ...form, preferredLanguage: event.target.value as Language })}
            >
              {Object.entries(LANGUAGE).map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Organisation" hint="Périmètre de l'utilisateur">
            <Select
              value={form.organizationId}
              onChange={(event) => setForm({ ...form, organizationId: event.target.value })}
            >
              <option value="">Aucune (compte national)</option>
              {organizationsQuery.data?.items.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name} ({organization.code})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Role">
            <Select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as Role })}>
              {ROLES.map((value) => (
                <option key={value} value={value}>
                  {describe(ROLE, value).label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Statut initial">
            <Select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as UserStatus })}>
              {STATUSES.map((value) => (
                <option key={value} value={value}>
                  {describe(USER_STATUS, value).label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Modal>

      {/* Identifiants temporaires */}
      <Modal
        open={Boolean(credentials)}
        onClose={() => {
          setCredentials(null);
          setCopied(false);
        }}
        title="Mot de passe temporaire"
        description={credentials?.title}
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              icon={<Copy className="h-4 w-4" />}
              onClick={async () => {
                await navigator.clipboard.writeText(credentials?.password ?? '');
                setCopied(true);
              }}
            >
              {copied ? 'Copie' : 'Copier'}
            </Button>
            <Button
              onClick={() => {
                setCredentials(null);
                setCopied(false);
              }}
            >
              Terminer
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <code className="block rounded-lg bg-slate-900 p-3 text-center font-mono text-lg text-emerald-300">
            {credentials?.password}
          </code>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Ce mot de passe ne sera plus affiché. L utilisateur devra le changer à sa première connexion
            {` (généré le ${formatDateTime(new Date().toISOString())}).`}
          </p>
        </div>
      </Modal>

      <p className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        <Plus className="h-3.5 w-3.5" />
        Les appartenances supplémentaires (multi-sites) se gerent depuis l'API d'habilitations.
      </p>
    </div>
  );
};
