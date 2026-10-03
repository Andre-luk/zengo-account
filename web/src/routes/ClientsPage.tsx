import { ChevronRight, MapPin, Phone, Search, UserPlus, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClientFormModal } from '@/components/clients/ClientFormModal';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/Feedback';
import { Input, Select } from '@/components/ui/Field';
import { Pagination, TBody, TD, TH, THead, TR, TableWrap } from '@/components/ui/Table';
import { useClients } from '@/hooks/queries';
import { formatDate, formatRelative } from '@/lib/format';
import { CLIENT_STATUS, LANGUAGE, OFFER_PACK, SUBSCRIPTION_STATUS, describe } from '@/lib/labels';
import { useAuthStore } from '@/store/auth';
import type { ClientStatus, OfferPack, SubscriptionStatus } from '@/types/api';

const MANAGE_ROLES = [
  'SUPER_ADMIN',
  'NATIONAL_DIRECTOR',
  'TECHNICAL_DIRECTOR',
  'PLATFORM_MANAGER',
  'REGION_MANAGER',
  'AGENCY_MANAGER',
  'ACCOUNTANT',
] as const;

const STATUSES: ClientStatus[] = ['PENDING', 'ACTIVE', 'SUSPENDED', 'EXPIRED', 'ARCHIVED'];
const SUBSCRIPTIONS: SubscriptionStatus[] = ['PENDING', 'ACTIVE', 'EXPIRED', 'SUSPENDED'];
const PACKS: OfferPack[] = ['STANDARD', 'PREMIUM_SMALL', 'PREMIUM_INSTITUTION', 'CUSTOM'];

export const ClientsPage = () => {
  const navigate = useNavigate();
  const hasRole = useAuthStore((state) => state.hasRole);

  const [page, setPage] = useState(1);
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [subscriptionStatus, setSubscriptionStatus] = useState('');
  const [offerPack, setOfferPack] = useState('');
  const [formOpen, setFormOpen] = useState(false);

  const params = useMemo(
    () => ({
      page,
      limit: 20,
      order: 'desc' as const,
      ...(search ? { search } : {}),
      ...(status ? { status } : {}),
      ...(subscriptionStatus ? { subscriptionStatus } : {}),
      ...(offerPack ? { offerPack } : {}),
    }),
    [page, search, status, subscriptionStatus, offerPack],
  );

  const clientsQuery = useClients(params);
  const canManage = hasRole(...MANAGE_ROLES);

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
                placeholder="Nom, ID Zengo, téléphone, ville..."
                className="pl-9"
              />
            </form>
            {canManage ? (
              <Button icon={<UserPlus className="h-4 w-4" />} onClick={() => setFormOpen(true)}>
                Nouveau compte client
              </Button>
            ) : null}
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <Select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="">Tous les statuts de compte</option>
              {STATUSES.map((value) => (
                <option key={value} value={value}>
                  {describe(CLIENT_STATUS, value).label}
                </option>
              ))}
            </Select>
            <Select
              value={subscriptionStatus}
              onChange={(event) => {
                setSubscriptionStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="">Tous les abonnements</option>
              {SUBSCRIPTIONS.map((value) => (
                <option key={value} value={value}>
                  {describe(SUBSCRIPTION_STATUS, value).label}
                </option>
              ))}
            </Select>
            <Select
              value={offerPack}
              onChange={(event) => {
                setOfferPack(event.target.value);
                setPage(1);
              }}
            >
              <option value="">Tous les packs</option>
              {PACKS.map((value) => (
                <option key={value} value={value}>
                  {describe(OFFER_PACK, value).label}
                </option>
              ))}
            </Select>
          </div>
        </CardBody>
      </Card>

      <Card className="overflow-hidden">
        {clientsQuery.isLoading ? (
          <TableSkeleton rows={8} columns={6} />
        ) : clientsQuery.isError ? (
          <ErrorState onRetry={() => void clientsQuery.refetch()} />
        ) : (clientsQuery.data?.items.length ?? 0) === 0 ? (
          <EmptyState
            title="Aucun compte client"
            description="Creez le premier compte client de votre périmètre pour démarrer l'installation du kit SafAlert."
            icon={<Users className="h-5 w-5" />}
            action={
              canManage ? (
                <Button size="sm" icon={<UserPlus className="h-3.5 w-3.5" />} onClick={() => setFormOpen(true)}>
                  Nouveau compte client
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <TableWrap>
              <THead>
                <TH>ID Zengo</TH>
                <TH>Client</TH>
                <TH>Contact</TH>
                <TH>Agence</TH>
                <TH>Pack</TH>
                <TH>Compte</TH>
                <TH>Abonnement</TH>
                <TH>Kit</TH>
                <TH className="text-right">Créé</TH>
                <TH />
              </THead>
              <TBody>
                {clientsQuery.data?.items.map((client) => (
                  <TR key={client.id} onClick={() => navigate(`/clients/${client.id}`)}>
                    <TD className="font-mono text-xs font-semibold text-slate-900 dark:text-white">{client.zengoId}</TD>
                    <TD className="max-w-[220px]">
                      <span className="block truncate font-medium text-slate-800 dark:text-slate-100">
                        {client.fullName}
                      </span>
                      {client.companyName ? (
                        <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                          {client.companyName}
                        </span>
                      ) : null}
                    </TD>
                    <TD className="whitespace-nowrap">
                      <span className="flex items-center gap-1.5 text-xs">
                        <Phone className="h-3 w-3 text-slate-400" />
                        {client.primaryPhone}
                      </span>
                      <span className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                        <MapPin className="h-3 w-3 text-slate-400" />
                        {client.city ?? '—'}
                      </span>
                    </TD>
                    <TD className="max-w-[180px] truncate text-xs">{client.organization?.name ?? '—'}</TD>
                    <TD className="whitespace-nowrap text-xs">
                      {describe(OFFER_PACK, client.offerPack).label}
                      <span className="ml-1 text-slate-400">{LANGUAGE[client.preferredLanguage]?.slice(0, 2)}</span>
                    </TD>
                    <TD>
                      <Badge tone={describe(CLIENT_STATUS, client.status).tone} dot={client.status === 'PENDING'}>
                        {describe(CLIENT_STATUS, client.status).label}
                      </Badge>
                    </TD>
                    <TD>
                      <Badge tone={describe(SUBSCRIPTION_STATUS, client.subscriptionStatus).tone}>
                        {describe(SUBSCRIPTION_STATUS, client.subscriptionStatus).label}
                      </Badge>
                    </TD>
                    <TD className="font-mono text-xs text-slate-600 dark:text-slate-300">
                      {client.device?.serialNumber ?? <span className="text-slate-400">Non installe</span>}
                    </TD>
                    <TD className="text-right text-xs whitespace-nowrap text-slate-500 dark:text-slate-400">
                      {client.installationDate ? formatDate(client.installationDate) : formatRelative(client.createdAt)}
                    </TD>
                    <TD className="w-8 text-slate-300 dark:text-slate-600">
                      <ChevronRight className="h-4 w-4" />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </TableWrap>
            {clientsQuery.data ? <Pagination page={clientsQuery.data} onPageChange={setPage} /> : null}
          </>
        )}
      </Card>

      <ClientFormModal open={formOpen} onClose={() => setFormOpen(false)} />
    </div>
  );
};
