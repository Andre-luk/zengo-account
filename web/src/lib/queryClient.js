import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '@/lib/api';
export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 15000,
            refetchOnWindowFocus: false,
            retry: (failureCount, error) => {
                // Ne pas réessayer sur les erreurs de permissions ou de validation.
                if (error instanceof ApiError && error.status < 500)
                    return false;
                return failureCount < 2;
            },
        },
        mutations: {
            retry: false,
        },
    },
});
/** Cles de cache centralisees (evite les chaines dispersees). */
export const queryKeys = {
    me: ['me'],
    organizations: (params) => ['organizations', params ?? {}],
    organizationTree: ['organizations', 'tree'],
    clients: (params) => ['clients', params ?? {}],
    client: (id) => ['clients', id],
    clientPricing: (id) => ['clients', id, 'pricing'],
    devices: (params) => ['devices', params ?? {}],
    device: (id) => ['devices', id],
    deviceSubDevices: (id) => ['devices', id, 'sub-devices'],
    alerts: (params) => ['alerts', params ?? {}],
    alert: (id) => ['alerts', id],
    alertTimeline: (id) => ['alerts', id, 'timeline'],
    alertVoiceCalls: (id) => ['alerts', id, 'voice-calls'],
    alertStats: (params) => ['alerts', 'stats', params ?? {}],
    alertStations: (organizationId) => ['alerts', 'stations', organizationId],
    tariffs: (params) => ['tariffs', params ?? {}],
    pricePreview: (tariffGroupId, sosButtonCount) => ['tariffs', 'price-preview', tariffGroupId, sosButtonCount],
    users: (params) => ['users', params ?? {}],
    auditLogs: (params) => ['audit-logs', params ?? {}],
};
