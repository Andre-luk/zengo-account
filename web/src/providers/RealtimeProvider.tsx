import { useQueryClient } from '@tanstack/react-query';
import { useEffect, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import { SOCKET_URL } from '@/lib/format';
import { describe, ALERT_SEVERITY, ALERT_TYPE } from '@/lib/labels';
import { useAuthStore } from '@/store/auth';
import { useUiStore } from '@/store/ui';
import { emitRealtime, useRealtimeStore } from '@/store/realtime';
import type { RealtimeEvent } from '@/types/api';

const ALERT_EVENTS = [
  'alert.created',
  'alert.updated',
  'alert.acknowledged',
  'alert.dispatched',
  'alert.escalated',
  'alert.resolved',
  'alert.cancelled',
  'voice_call.updated',
] as const;

const INTERVENTION_EVENTS = [
  'intervention.assigned',
  'intervention.status_changed',
  'intervention.completed',
  'intervention.aborted',
  'intervention.delayed',
  'team.status_changed',
  'team.position_updated',
] as const;

/**
 * Canal temps réel de la console.
 *
 * Le JWT est transmis dans la poignée de main Socket.IO (jamais en paramètre
 * d'URL). Chaque événement invalide le cache des alertes et, pour les
 * creations et escalades, déclenche une notification visuelle sonore.
 */
export const RealtimeProvider = ({ children }: { children: ReactNode }) => {
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((state) => state.tokens?.accessToken);
  const setConnected = useRealtimeStore((state) => state.setConnected);
  const setConnecting = useRealtimeStore((state) => state.setConnecting);
  const recordEvent = useRealtimeStore((state) => state.recordEvent);
  const reset = useRealtimeStore((state) => state.reset);
  const pushToast = useUiStore((state) => state.pushToast);

  useEffect(() => {
    if (!accessToken) {
      reset();
      return undefined;
    }

    setConnecting(true);
    const socket: Socket = io(`${SOCKET_URL}/realtime`, {
      auth: { token: accessToken },
      transports: ['websocket', 'polling'],
      reconnectionDelay: 2_000,
    });

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', () => setConnected(false));
    socket.on('unauthorized', () => setConnected(false));

    const handleEvent = (event: RealtimeEvent) => {
      recordEvent(event);
      emitRealtime(event);

      // Toutes les vues d'alertes derivent de la même cle racine.
      void queryClient.invalidateQueries({ queryKey: ['alerts'] });

      if (event.type === 'alert.created') {
        const type = describe(ALERT_TYPE, event.alertType);
        const severity = describe(ALERT_SEVERITY, event.severity);
        pushToast({
          tone: severity.tone,
          title: `Nouvelle alerte — ${type.label}`,
          description: `${event.reference}${event.payload?.clientName ? ` — ${String(event.payload.clientName)}` : ''}`,
        });
      }

      if (event.type === 'alert.escalated') {
        pushToast({
          tone: 'critical',
          title: `Escalade — ${event.reference}`,
          description: 'Aucune action dans le délai imparti : toutes les équipes du PDC sont notifiées.',
        });
      }
    };

    ALERT_EVENTS.forEach((name) => socket.on(name, handleEvent));

    const handleMission = (event: RealtimeEvent) => {
      recordEvent(event);
      emitRealtime(event);
      void queryClient.invalidateQueries({ queryKey: ['interventions'] });
      if (event.type === 'intervention.delayed') {
        pushToast({
          tone: 'warning',
          title: 'Mission en retard',
          description: `${event.interventionReference ?? 'Mission'} — ${
            event.payload?.reason === 'ARRIVAL_LATE' ? 'arrivée anormalement longue' : 'départ non confirmé'
          }.`,
        });
      }
      if (event.type === 'intervention.assigned') {
        pushToast({
          tone: 'brand',
          title: 'Équipe engagée',
          description: `${event.teamName ?? 'Équipe'} → ${event.alertReference ?? 'alerte'}`,
        });
      }
    };

    INTERVENTION_EVENTS.forEach((name) => socket.on(name, handleMission));

    return () => {
      ALERT_EVENTS.forEach((name) => socket.off(name, handleEvent));
      INTERVENTION_EVENTS.forEach((name) => socket.off(name, handleMission));
      socket.close();
      setConnected(false);
    };
  }, [accessToken, pushToast, queryClient, recordEvent, reset, setConnected, setConnecting]);

  return <>{children}</>;
};
