import { ScrollText, Search, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/Feedback';
import { Input, Select } from '@/components/ui/Field';
import { Pagination, TBody, TD, TH, THead, TR, TableWrap } from '@/components/ui/Table';
import { useAuditLogs } from '@/hooks/queries';
import { formatDateTime, formatRelative } from '@/lib/format';
import { AUDIT_ACTION, describe } from '@/lib/labels';
import type { Tone } from '@/lib/labels';

const ACTIONS = [
  'LOGIN',
  'LOGIN_FAILED',
  'LOGOUT',
  'TOKEN_REFRESH',
  'PASSWORD_CHANGED',
  'PASSWORD_RESET',
  'TWO_FACTOR_ENABLED',
  'TWO_FACTOR_DISABLED',
  'CREATE',
  'UPDATE',
  'DELETE',
  'STATUS_CHANGE',
  'DEVICE_ARM',
  'DEVICE_DISARM',
  'CLIENT_MUTATION',
  'SUBSCRIPTION_ACTIVATED',
  'PERMISSION_DENIED',
];

const STATUS_TONE = (status: number | null): Tone => {
  if (!status) return 'neutral';
  if (status < 300) return 'success';
  if (status < 400) return 'info';
  if (status < 500) return 'warning';
  return 'danger';
};

const ENTITIES = [
  'User',
  'ClientProfile',
  'Device',
  'SubDevice',
  'Alert',
  'Organization',
  'UserOrganization',
  'TariffGroup',
];

export const AuditPage = () => {
  const [page, setPage] = useState(1);
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const params = useMemo(
    () => ({
      page,
      limit: 25,
      order: 'desc' as const,
      ...(search ? { search } : {}),
      ...(action ? { action } : {}),
      ...(entityType ? { entityType } : {}),
      ...(from ? { from: new Date(from).toISOString() } : {}),
      ...(to ? { to: new Date(`${to}T23:59:59`).toISOString() } : {}),
    }),
    [page, search, action, entityType, from, to],
  );

  const logsQuery = useAuditLogs(params);

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
                placeholder="Acteur, chemin, entite..."
                className="pl-9"
              />
            </form>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch('');
                setSearchDraft('');
                setAction('');
                setEntityType('');
                setFrom('');
                setTo('');
                setPage(1);
              }}
            >
              Réinitialiser
            </Button>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <Select
              value={action}
              onChange={(event) => {
                setAction(event.target.value);
                setPage(1);
              }}
            >
              <option value="">Toutes les actions</option>
              {ACTIONS.map((value) => (
                <option key={value} value={value}>
                  {describe(AUDIT_ACTION, value).label}
                </option>
              ))}
            </Select>
            <Select
              value={entityType}
              onChange={(event) => {
                setEntityType(event.target.value);
                setPage(1);
              }}
            >
              <option value="">Toutes les entites</option>
              {ENTITIES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </Select>
            <Input
              type="date"
              value={from}
              onChange={(event) => {
                setFrom(event.target.value);
                setPage(1);
              }}
            />
            <Input
              type="date"
              value={to}
              onChange={(event) => {
                setTo(event.target.value);
                setPage(1);
              }}
            />
          </div>
        </CardBody>
      </Card>

      <Card className="overflow-hidden">
        {logsQuery.isLoading ? (
          <TableSkeleton rows={10} columns={5} />
        ) : logsQuery.isError ? (
          <ErrorState onRetry={() => void logsQuery.refetch()} />
        ) : (logsQuery.data?.items.length ?? 0) === 0 ? (
          <EmptyState
            title="Aucune entrée"
            description="Le journal enregistre les actions sensibles : connexions, mutations clients, armements, habilitations."
            icon={<ScrollText className="h-5 w-5" />}
          />
        ) : (
          <>
            <TableWrap>
              <THead>
                <TH>Horodatage</TH>
                <TH>Acteur</TH>
                <TH>Action</TH>
                <TH>Entite</TH>
                <TH>Requête</TH>
                <TH>Adresse IP</TH>
              </THead>
              <TBody>
                {logsQuery.data?.items.map((log) => (
                  <TR key={log.id}>
                    <TD className="whitespace-nowrap text-xs">
                      <span className="block">{formatDateTime(log.createdAt)}</span>
                      <span className="block text-slate-400">{formatRelative(log.createdAt)}</span>
                    </TD>
                    <TD className="text-xs">
                      <span className="block font-medium text-slate-800 dark:text-slate-100">
                        {log.actorLabel ?? 'Système'}
                      </span>
                      {log.actorUserId ? (
                        <span className="block font-mono text-[10px] text-slate-400">{log.actorUserId.slice(0, 8)}</span>
                      ) : null}
                    </TD>
                    <TD>
                      <Badge tone={describe(AUDIT_ACTION, log.action).tone}>
                        {describe(AUDIT_ACTION, log.action).label}
                      </Badge>
                    </TD>
                    <TD className="text-xs">
                      <span className="block">{log.entityType ?? '—'}</span>
                      {log.entityId ? (
                        <span className="block font-mono text-[10px] text-slate-400">{log.entityId.slice(0, 8)}</span>
                      ) : null}
                    </TD>
                    <TD className="max-w-[240px] text-xs">
                      <span className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-slate-400">{log.httpMethod ?? '—'}</span>
                        <span className="truncate" title={log.httpPath ?? ''}>
                          {log.httpPath ?? '—'}
                        </span>
                      </span>
                      {log.httpStatus ? (
                        <Badge tone={STATUS_TONE(log.httpStatus)} className="mt-0.5">
                          {log.httpStatus}
                        </Badge>
                      ) : null}
                    </TD>
                    <TD className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                      {log.ipAddress ?? '—'}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </TableWrap>
            {logsQuery.data ? <Pagination page={logsQuery.data} onPageChange={setPage} /> : null}
          </>
        )}
      </Card>

      <p className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        <ShieldCheck className="h-3.5 w-3.5" />
        Journal en lecture seule, conserve pour les besoins d'audit et de conformité.
      </p>
    </div>
  );
};
