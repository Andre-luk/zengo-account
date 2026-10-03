import { Fragment as _Fragment, jsx as _jsx } from "react/jsx-runtime";
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { io } from 'socket.io-client';
import { SOCKET_URL } from '@/lib/format';
import { describe, ALERT_SEVERITY, ALERT_TYPE } from '@/lib/labels';
import { useAuthStore } from '@/store/auth';
import { useUiStore } from '@/store/ui';
import { emitRealtime, useRealtimeStore } from '@/store/realtime';
const ALERT_EVENTS = [
    'alert.created',
    'alert.updated',
    'alert.acknowledged',
    'alert.dispatched',
    'alert.escalated',
    'alert.resolved',
    'alert.cancelled',
    'voice_call.updated',
];
/**
 * Canal temps réel de la console.
 *
 * Le JWT est transmis dans la poignée de main Socket.IO (jamais en paramètre
 * d'URL). Chaque événement invalide le cache des alertes et, pour les
 * creations et escalades, déclenche une notification visuelle sonore.
 */
export const RealtimeProvider = ({ children }) => {
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
        const socket = io(`${SOCKET_URL}/realtime`, {
            auth: { token: accessToken },
            transports: ['websocket', 'polling'],
            reconnectionDelay: 2000,
        });
        socket.on('connect', () => setConnected(true));
        socket.on('disconnect', () => setConnected(false));
        socket.on('connect_error', () => setConnected(false));
        socket.on('unauthorized', () => setConnected(false));
        const handleEvent = (event) => {
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
        return () => {
            ALERT_EVENTS.forEach((name) => socket.off(name, handleEvent));
            socket.close();
            setConnected(false);
        };
    }, [accessToken, pushToast, queryClient, recordEvent, reset, setConnected, setConnecting]);
    return _jsx(_Fragment, { children: children });
};
