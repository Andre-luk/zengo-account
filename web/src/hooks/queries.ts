import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/queryClient';
import type {
  Alert,
  AlertEvent,
  AlertStats,
  AuditLog,
  ClientProfile,
  CurrentUser,
  Device,
  FieldTeam,
  Intervention,
  InterventionStats,
  InterventionTrack,
  Organization,
  Paginated,
  PriceBreakdown,
  SubDevice,
  TariffGroup,
  User,
  VoiceCall,
  SmsMessage,
  SmsStats,
  RiskSummary,
  RiskZone,
  Subscription,
  SubscriptionStats,
  ClientSubscriptionState,
} from '@/types/api';

export type QueryParams = Record<string, string | number | boolean | undefined>;

const buildQuery = (params?: QueryParams) => params as Record<string, string | number | boolean> | undefined;

export const useMe = () =>
  useQuery({
    queryKey: queryKeys.me,
    queryFn: () => api.get<CurrentUser>('/users/me'),
    staleTime: 60_000,
  });

export const useAlertStats = (params?: QueryParams) =>
  useQuery({
    queryKey: queryKeys.alertStats(params),
    queryFn: () => api.get<AlertStats>('/alerts/stats', buildQuery(params)),
    refetchInterval: 60_000,
  });

export const useAlerts = (params?: QueryParams) =>
  useQuery({
    queryKey: queryKeys.alerts(params),
    queryFn: () => api.get<Paginated<Alert>>('/alerts', buildQuery(params)),
  });

export const useAlert = (id: string | undefined) =>
  useQuery({
    queryKey: queryKeys.alert(id ?? ''),
    queryFn: () => api.get<Alert>(`/alerts/${id}`),
    enabled: Boolean(id),
  });

export const useAlertTimeline = (id: string | undefined) =>
  useQuery({
    queryKey: queryKeys.alertTimeline(id ?? ''),
    queryFn: () => api.get<AlertEvent[]>(`/alerts/${id}/timeline`),
    enabled: Boolean(id),
  });

export const useAlertVoiceCalls = (id: string | undefined) =>
  useQuery({
    queryKey: queryKeys.alertVoiceCalls(id ?? ''),
    queryFn: () => api.get<VoiceCall[]>(`/alerts/${id}/voice-calls`),
    enabled: Boolean(id),
  });

export const useAlertSms = (id: string | undefined) =>
  useQuery({
    queryKey: queryKeys.alertSms(id ?? ''),
    queryFn: () => api.get<{ items: SmsMessage[] }>(`/alerts/${id}/sms`),
    enabled: Boolean(id),
  });

export const useSmsStats = () =>
  useQuery({
    queryKey: queryKeys.smsStats(),
    queryFn: () => api.get<SmsStats>('/sms/stats'),
    staleTime: 60_000,
  });

/** Analyse predictive : zones a risque du perimetre. */
export const useRiskZones = (params: { days?: number; limit?: number; minAlerts?: number } = {}) =>
  useQuery({
    queryKey: queryKeys.riskZones(params),
    queryFn: () => api.get<{ zones: RiskZone[] }>('/alerts/risk/zones', params),
    staleTime: 300_000,
  });

export const useRiskSummary = (params: { days?: number; limit?: number } = {}) =>
  useQuery({
    queryKey: queryKeys.riskSummary(params),
    queryFn: () => api.get<RiskSummary>('/alerts/risk/summary', params),
    staleTime: 300_000,
  });

/** Abonnements et encaissements (iteration 4). */
export const useSubscriptions = (
  params: { clientId?: string; status?: string; expiringSoon?: boolean; page?: number; limit?: number } = {},
) =>
  useQuery({
    queryKey: queryKeys.subscriptions(params),
    queryFn: () => api.get<Paginated<Subscription>>('/subscriptions', params),
  });

export const useSubscriptionStats = (days = 30) =>
  useQuery({
    queryKey: queryKeys.subscriptionStats(days),
    queryFn: () => api.get<SubscriptionStats>('/subscriptions/stats', { days }),
    staleTime: 60_000,
  });

export const useClientSubscription = (clientId: string | undefined) =>
  useQuery({
    queryKey: queryKeys.clientSubscription(clientId ?? ''),
    queryFn: () => api.get<ClientSubscriptionState>(`/subscriptions/clients/${clientId}`),
    enabled: Boolean(clientId),
  });

export const useAlertStations = (organizationId: string | null | undefined) =>
  useQuery({
    queryKey: queryKeys.alertStations(organizationId ?? ''),
    queryFn: () => api.get<Organization[]>(`/alerts/stations/${organizationId}`),
    enabled: Boolean(organizationId),
  });

export const useClients = (params?: QueryParams) =>
  useQuery({
    queryKey: queryKeys.clients(params),
    queryFn: () => api.get<Paginated<ClientProfile>>('/clients', buildQuery(params)),
  });

export const useClient = (id: string | undefined) =>
  useQuery({
    queryKey: queryKeys.client(id ?? ''),
    queryFn: () => api.get<ClientProfile>(`/clients/${id}`),
    enabled: Boolean(id),
  });

export const useMyClientProfile = (enabled: boolean) =>
  useQuery({
    queryKey: ['clients', 'me'],
    queryFn: () => api.get<ClientProfile>('/clients/me'),
    enabled,
  });

export const useClientPricing = (id: string | undefined) =>
  useQuery({
    queryKey: queryKeys.clientPricing(id ?? ''),
    queryFn: () => api.get<PriceBreakdown>(`/clients/${id}/pricing`),
    enabled: Boolean(id),
  });

export const useDevices = (params?: QueryParams) =>
  useQuery({
    queryKey: queryKeys.devices(params),
    queryFn: () => api.get<Paginated<Device>>('/devices', buildQuery(params)),
  });

export const useDevice = (id: string | undefined) =>
  useQuery({
    queryKey: queryKeys.device(id ?? ''),
    queryFn: () => api.get<Device>(`/devices/${id}`),
    enabled: Boolean(id),
  });

export const useDeviceSubDevices = (id: string | undefined) =>
  useQuery({
    queryKey: queryKeys.deviceSubDevices(id ?? ''),
    queryFn: () => api.get<SubDevice[]>(`/devices/${id}/sub-devices`),
    enabled: Boolean(id),
  });

export const useTariffGroups = (params?: QueryParams) =>
  useQuery({
    queryKey: queryKeys.tariffs(params),
    queryFn: () => api.get<Paginated<TariffGroup>>('/tariff-groups', buildQuery(params)),
  });

export const useOrganizations = (params?: QueryParams) =>
  useQuery({
    queryKey: queryKeys.organizations(params),
    queryFn: () => api.get<Paginated<Organization>>('/organizations', buildQuery(params)),
  });

export const useUsers = (params?: QueryParams) =>
  useQuery({
    queryKey: queryKeys.users(params),
    queryFn: () => api.get<Paginated<User>>('/users', buildQuery(params)),
  });

export const useAuditLogs = (params?: QueryParams) =>
  useQuery({
    queryKey: queryKeys.auditLogs(params),
    queryFn: () => api.get<Paginated<AuditLog>>('/audit-logs', buildQuery(params)),
  });

// --- Interventions terrain ----------------------------------------------------

export const useInterventions = (params?: QueryParams) =>
  useQuery({
    queryKey: queryKeys.interventions(params),
    queryFn: () => api.get<Paginated<Intervention>>('/interventions', buildQuery(params)),
  });

export const useIntervention = (id: string | undefined) =>
  useQuery({
    queryKey: queryKeys.intervention(id ?? ''),
    queryFn: () => api.get<Intervention>(`/interventions/${id}`),
    enabled: Boolean(id),
  });

export const useInterventionTrack = (id: string | undefined, enabled = true) =>
  useQuery({
    queryKey: queryKeys.interventionTrack(id ?? ''),
    queryFn: () => api.get<InterventionTrack>(`/interventions/${id}/track`),
    enabled: Boolean(id) && enabled,
    refetchInterval: 30_000,
  });

export const useInterventionsByAlert = (alertId: string | undefined) =>
  useQuery({
    queryKey: queryKeys.interventionsByAlert(alertId ?? ''),
    queryFn: () => api.get<Intervention[]>(`/interventions/by-alert/${alertId}`),
    enabled: Boolean(alertId),
  });

export const useInterventionStats = (params?: QueryParams) =>
  useQuery({
    queryKey: queryKeys.interventionStats(params),
    queryFn: () => api.get<InterventionStats>('/interventions/stats', buildQuery(params)),
    refetchInterval: 60_000,
  });

export const useFieldTeams = (params?: QueryParams) =>
  useQuery({
    queryKey: queryKeys.fieldTeams(params),
    queryFn: () => api.get<Paginated<FieldTeam>>('/field-teams', buildQuery(params)),
  });
