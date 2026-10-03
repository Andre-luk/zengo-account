import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, RotateCw, Send } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { EmptyState, Skeleton } from '@/components/ui/Feedback';
import { Field, Textarea } from '@/components/ui/Field';
import { api } from '@/lib/api';
import { formatDateTime, formatRelative } from '@/lib/format';
import { SMS_STATUS, SMS_TEMPLATE, describe, LANGUAGE } from '@/lib/labels';
import { queryKeys } from '@/lib/queryClient';
import { useUiStore } from '@/store/ui';
import type { SmsMessage } from '@/types/api';

/**
 * Journal des SMS recus par le client sur ce dossier.
 *
 * Le superviseur y voit ce que le client a effectivement lu (corps, langue,
 * nombre de segments factures) et peut renvoyer un message reste en echec ou
 * ecrire un message libre — par exemple pour expliquer une intervention.
 */
export const SmsPanel = ({
  alertId,
  query,
  canSend,
}: {
  alertId: string;
  query: { data?: { items: SmsMessage[] }; isLoading: boolean };
  canSend: boolean;
}) => {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((state) => state.pushToast);
  const [draft, setDraft] = useState('');

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.alertSms(alertId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.smsStats() });
  };

  const resend = useMutation({
    mutationFn: (id: string) => api.post(`/sms/${id}/resend`),
    onSuccess: () => {
      pushToast({ tone: 'success', title: 'Message renvoyé', description: 'Le client va recevoir à nouveau le SMS.' });
      invalidate();
    },
    onError: (error: Error) =>
      pushToast({ tone: 'danger', title: 'Renvoi impossible', description: error.message }),
  });

  const sendCustom = useMutation({
    mutationFn: (body: string) => api.post(`/alerts/${alertId}/sms`, { body }),
    onSuccess: () => {
      pushToast({ tone: 'success', title: 'SMS envoyé', description: 'Le message part vers le client.' });
      setDraft('');
      invalidate();
    },
    onError: (error: Error) =>
      pushToast({ tone: 'danger', title: 'Envoi impossible', description: error.message }),
  });

  if (query.isLoading) return <Skeleton className="h-32 w-full" />;

  const messages = query.data?.items ?? [];
  const failed = messages.filter((message) => message.status === 'FAILED').length;

  return (
    <div className="space-y-3">
      {canSend ? (
        <Card>
          <CardBody className="space-y-3">
            <Field
              label="Écrire au client"
              hint="Le message part tel quel, dans le canal SMS du dossier. Choisissez la langue du client."
            >
              <Textarea
                rows={2}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Equipe sur place, intervention en cours. Merci de rester joignable."
              />
            </Field>
            <div className="flex justify-end">
              <Button
                icon={<Send className="h-4 w-4" />}
                loading={sendCustom.isPending}
                disabled={draft.trim().length < 3}
                onClick={() => sendCustom.mutate(draft.trim())}
              >
                Envoyer le SMS
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : null}

      {messages.length === 0 ? (
        <EmptyState
          title="Aucun SMS"
          description="Le client n'a pas encore reçu de message sur ce dossier."
          icon={<MessageSquare className="h-5 w-5" />}
        />
      ) : (
        <>
          {failed > 0 ? (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-900/30 dark:text-rose-200">
              {failed} message(s) n'ont pas pu être remis au fournisseur : renvoyez-les une fois le numéro vérifié.
            </p>
          ) : null}

          <div className="space-y-2">
            {messages.map((message) => (
              <Card key={message.id}>
                <CardBody className="space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-800 dark:text-slate-100">
                        {describe(SMS_TEMPLATE, message.template).label}
                        <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                          {message.toNumber} · {LANGUAGE[message.language] ?? message.language}
                        </span>
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {formatDateTime(message.createdAt)} · {formatRelative(message.createdAt)} ·{' '}
                        {message.provider}
                        {message.attemptNumber > 1 ? ` · tentative ${message.attemptNumber}` : ''}
                        {' · '}
                        {message.segments} segment(s) {message.encoding}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge tone={describe(SMS_STATUS, message.status).tone}>
                        {describe(SMS_STATUS, message.status).label}
                      </Badge>
                      {canSend ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<RotateCw className="h-3.5 w-3.5" />}
                          loading={resend.isPending && resend.variables === message.id}
                          onClick={() => resend.mutate(message.id)}
                        >
                          Renvoyer
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:bg-slate-800/60 dark:text-slate-200">
                    {message.body}
                  </p>

                  {message.deliveredAt ? (
                    <p className="text-xs text-emerald-600 dark:text-emerald-400">
                      Remis au destinataire le {formatDateTime(message.deliveredAt)}
                    </p>
                  ) : null}
                  {message.errorMessage ? (
                    <p className="text-xs text-rose-600 dark:text-rose-400">
                      {message.errorCode ? `[${message.errorCode}] ` : ''}
                      {message.errorMessage}
                    </p>
                  ) : null}
                </CardBody>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
