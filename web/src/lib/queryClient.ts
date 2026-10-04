import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '@/lib/api';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        // Ne pas réessayer sur les erreurs de permissions ou de validation.
        if (error instanceof ApiError && error.status < 500) return false;
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
  me: ['me'] as const,
  organizations: (params?: unknown) => ['organizations', params ?? {}] as const,
  organizationTree: ['organizations', 'tree'] as const,
  clients: (params?: unknown) => ['clients', params ?? {}] as const,
  client: (id: string) => ['clients', id] as const,
  clientPricing: (id: string) => ['clients', id, 'pricing'] as const,
  devices: (params?: unknown) => ['devices', params ?? {}] as const,
  device: (id: string) => ['devices', id] as const,
  deviceSubDevices: (id: string) => ['devices', id, 'sub-devices'] as const,
  alerts: (params?: unknown) => ['alerts', params ?? {}] as const,
  alert: (id: string) => ['alerts', id] as const,
  alertTimeline: (id: string) => ['alerts', id, 'timeline'] as const,
  alertVoiceCalls: (id: string) => ['alerts', id, 'voice-calls'] as const,
  alertSms: (id: string) => ['alerts', id, 'sms'] as const,
  smsStats: () => ['sms', 'stats'] as const,
  riskZones: (params: Record<string, unknown>) => ['risk', 'zones', params] as const,
  riskSummary: (params: Record<string, unknown>) => ['risk', 'summary', params] as const,
  subscriptions: (params: Record<string, unknown>) => ['subscriptions', params] as const,
  subscriptionStats: (days: number) => ['subscriptions', 'stats', days] as const,
  clientSubscription: (clientId: string) => ['subscriptions', 'client', clientId] as const,
  mutations: (params: Record<string, unknown>) => ['mutations', params] as const,
  mutation: (id: string) => ['mutations', 'detail', id] as const,
  mutationStats: (days: number) => ['mutations', 'stats', days] as const,
  clientMutations: (clientId: string) => ['mutations', 'client', clientId] as const,
  healthStats: () => ['healthcare', 'stats'] as const,
  healthMeasurements: (params: Record<string, unknown>) => ['healthcare', 'measurements', params] as const,
  clientHealth: (clientId: string, emergency = false) =>
    ['healthcare', 'client', clientId, { emergency }] as const,
  clientHealthHistory: (clientId: string, params: Record<string, unknown>) =>
    ['healthcare', 'client', clientId, 'measurements', params] as const,
  clientHealthConsents: (clientId: string) => ['healthcare', 'client', clientId, 'consents'] as const,
  clientHealthAccessLogs: (clientId: string) =>
    ['healthcare', 'client', clientId, 'access-logs'] as const,
  clientNurseRequests: (clientId: string) => ['healthcare', 'client', clientId, 'nurse-requests'] as const,
  nurseRequests: (params: Record<string, unknown>) => ['healthcare', 'nurse-requests', params] as const,
  nurseRequest: (id: string) => ['healthcare', 'nurse-requests', 'detail', id] as const,
  nurseRequestStats: () => ['healthcare', 'nurse-requests', 'stats'] as const,
  alertStats: (params?: unknown) => ['alerts', 'stats', params ?? {}] as const,
  alertStations: (organizationId: string) => ['alerts', 'stations', organizationId] as const,
  tariffs: (params?: unknown) => ['tariffs', params ?? {}] as const,
  pricePreview: (tariffGroupId: string, sosButtonCount: number) =>
    ['tariffs', 'price-preview', tariffGroupId, sosButtonCount] as const,
  interventions: (params?: unknown) => ['interventions', params ?? {}] as const,
  intervention: (id: string) => ['interventions', id] as const,
  interventionTrack: (id: string) => ['interventions', id, 'track'] as const,
  interventionStats: (params?: unknown) => ['interventions', 'stats', params ?? {}] as const,
  interventionsByAlert: (alertId: string) => ['interventions', 'by-alert', alertId] as const,
  fieldTeams: (params?: unknown) => ['field-teams', params ?? {}] as const,
  users: (params?: unknown) => ['users', params ?? {}] as const,
  auditLogs: (params?: unknown) => ['audit-logs', params ?? {}] as const,
};
