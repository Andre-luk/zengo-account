import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/queryClient';
const buildQuery = (params) => params;
export const useMe = () => useQuery({
    queryKey: queryKeys.me,
    queryFn: () => api.get('/users/me'),
    staleTime: 60000,
});
export const useAlertStats = (params) => useQuery({
    queryKey: queryKeys.alertStats(params),
    queryFn: () => api.get('/alerts/stats', buildQuery(params)),
    refetchInterval: 60000,
});
export const useAlerts = (params) => useQuery({
    queryKey: queryKeys.alerts(params),
    queryFn: () => api.get('/alerts', buildQuery(params)),
});
export const useAlert = (id) => useQuery({
    queryKey: queryKeys.alert(id ?? ''),
    queryFn: () => api.get(`/alerts/${id}`),
    enabled: Boolean(id),
});
export const useAlertTimeline = (id) => useQuery({
    queryKey: queryKeys.alertTimeline(id ?? ''),
    queryFn: () => api.get(`/alerts/${id}/timeline`),
    enabled: Boolean(id),
});
export const useAlertVoiceCalls = (id) => useQuery({
    queryKey: queryKeys.alertVoiceCalls(id ?? ''),
    queryFn: () => api.get(`/alerts/${id}/voice-calls`),
    enabled: Boolean(id),
});
export const useAlertStations = (organizationId) => useQuery({
    queryKey: queryKeys.alertStations(organizationId ?? ''),
    queryFn: () => api.get(`/alerts/stations/${organizationId}`),
    enabled: Boolean(organizationId),
});
export const useClients = (params) => useQuery({
    queryKey: queryKeys.clients(params),
    queryFn: () => api.get('/clients', buildQuery(params)),
});
export const useClient = (id) => useQuery({
    queryKey: queryKeys.client(id ?? ''),
    queryFn: () => api.get(`/clients/${id}`),
    enabled: Boolean(id),
});
export const useMyClientProfile = (enabled) => useQuery({
    queryKey: ['clients', 'me'],
    queryFn: () => api.get('/clients/me'),
    enabled,
});
export const useClientPricing = (id) => useQuery({
    queryKey: queryKeys.clientPricing(id ?? ''),
    queryFn: () => api.get(`/clients/${id}/pricing`),
    enabled: Boolean(id),
});
export const useDevices = (params) => useQuery({
    queryKey: queryKeys.devices(params),
    queryFn: () => api.get('/devices', buildQuery(params)),
});
export const useDevice = (id) => useQuery({
    queryKey: queryKeys.device(id ?? ''),
    queryFn: () => api.get(`/devices/${id}`),
    enabled: Boolean(id),
});
export const useDeviceSubDevices = (id) => useQuery({
    queryKey: queryKeys.deviceSubDevices(id ?? ''),
    queryFn: () => api.get(`/devices/${id}/sub-devices`),
    enabled: Boolean(id),
});
export const useTariffGroups = (params) => useQuery({
    queryKey: queryKeys.tariffs(params),
    queryFn: () => api.get('/tariff-groups', buildQuery(params)),
});
export const useOrganizations = (params) => useQuery({
    queryKey: queryKeys.organizations(params),
    queryFn: () => api.get('/organizations', buildQuery(params)),
});
export const useUsers = (params) => useQuery({
    queryKey: queryKeys.users(params),
    queryFn: () => api.get('/users', buildQuery(params)),
});
export const useAuditLogs = (params) => useQuery({
    queryKey: queryKeys.auditLogs(params),
    queryFn: () => api.get('/audit-logs', buildQuery(params)),
});
