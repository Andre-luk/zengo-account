export type Language = 'fr' | 'en' | 'sw' | 'ln' | 'lu' | 'kg';
export type Currency = 'USD' | 'CDF';

export type OrganizationType = 'NATIONAL' | 'REGION' | 'AGENCY' | 'STATION' | 'ENTERPRISE';
export type StationType = 'FIRE' | 'INTRUSION' | 'MEDICAL' | 'MIXED';
export type OrganizationStatus = 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';

export type OfferPack = 'STANDARD' | 'PREMIUM_SMALL' | 'PREMIUM_INSTITUTION' | 'CUSTOM';
export type ClientStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'EXPIRED' | 'ARCHIVED';
export type SubscriptionStatus = 'PENDING' | 'ACTIVE' | 'EXPIRED' | 'SUSPENDED';

export type DeviceStatus = 'PROVISIONED' | 'ACTIVE' | 'OFFLINE' | 'DISABLED';
export type ArmMode = 0 | 1 | 2;
export type SubDeviceCode = 'DC' | 'PIR' | 'WSD' | 'GLS' | 'WOS' | 'WIS' | 'WLS' | 'CON';

export type AlertType =
  | 'INTRUSION'
  | 'FIRE'
  | 'MEDICAL'
  | 'SABOTAGE'
  | 'PANIC'
  | 'GAS_LEAK'
  | 'WATER_LEAK'
  | 'SYSTEM';
export type AlertSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type AlertStatus =
  | 'NEW'
  | 'ACKNOWLEDGED'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'RESOLVED'
  | 'FALSE_ALARM'
  | 'CANCELLED';
export type AlertSource = 'SENSOR' | 'SOS_BUTTON' | 'CLIENT_APP' | 'OPERATOR' | 'AUTOMATION';
export type AlertResolution =
  | 'CLIENT_CONFIRMED'
  | 'HANDLED_BY_TEAM'
  | 'NO_ACTION_REQUIRED'
  | 'TECHNICAL_ISSUE'
  | 'MAINTENANCE_TEST';
export type AlertEventType =
  | 'CREATED'
  | 'ACKNOWLEDGED'
  | 'DISPATCHED'
  | 'ESCALATED'
  | 'VOICE_CALL_STARTED'
  | 'VOICE_CALL_UPDATED'
  | 'VOICE_CALL_COMPLETED'
  | 'STATUS_CHANGED'
  | 'NOTE_ADDED'
  | 'RESOLVED'
  | 'CANCELLED';
export type DispatchStatus = 'PENDING' | 'NOTIFIED' | 'ACKNOWLEDGED' | 'DECLINED' | 'ARRIVED' | 'COMPLETED';
export type VoiceCallStatus =
  | 'QUEUED'
  | 'RINGING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'NO_ANSWER'
  | 'BUSY'
  | 'FAILED';
export type VoiceCallOutcome =
  | 'NO_ANSWER'
  | 'CONFIRMED_BY_CLIENT'
  | 'INTRUSION_CONFIRMED'
  | 'PARTIAL'
  | 'FAILED';

export type Role =
  | 'SUPER_ADMIN'
  | 'NATIONAL_DIRECTOR'
  | 'TECHNICAL_DIRECTOR'
  | 'PLATFORM_MANAGER'
  | 'DAF'
  | 'ACCOUNTANT'
  | 'QUALITY_DIRECTOR'
  | 'REGION_MANAGER'
  | 'AGENCY_MANAGER'
  | 'TECHNICIAN'
  | 'OPERATOR'
  | 'SUPERVISOR'
  | 'STATION_AGENT'
  | 'FIELD_AGENT'
  | 'HEALTH_STAFF'
  | 'CLIENT_ADMIN'
  | 'CLIENT';

export type UserStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'DISABLED';

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  pageCount: number;
}

export interface Organization {
  id: string;
  name: string;
  code: string;
  type: OrganizationType;
  stationType: StationType | null;
  status: OrganizationStatus;
  parentId: string | null;
  path: string;
  depth: number;
  address: string | null;
  city: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  contactPhone: string | null;
  contactEmail: string | null;
  createdAt: string;
}

export interface Membership {
  organizationId: string;
  organizationName: string;
  organizationType?: OrganizationType;
  organizationPath?: string;
  role: Role;
  isPrimary: boolean;
}

export interface CurrentUser {
  id: string;
  email: string | null;
  phone: string | null;
  firstName: string;
  lastName: string;
  preferredLanguage: Language;
  status?: UserStatus;
  isSuperAdmin: boolean;
  mustChangePassword?: boolean;
  twoFactorEnabled?: boolean;
  roles: Role[];
  primaryOrganizationId?: string | null;
  memberships: Membership[];
  lastLoginAt?: string | null;
}

export interface User extends CurrentUser {
  createdAt: string;
  memberships: Membership[];
}

export interface TariffGroup {
  id: string;
  code: string;
  name: string;
  offerPack: OfferPack;
  description: string | null;
  registrationFeeUsd: string;
  monthlyFeeUsd: string;
  includedSosButtons: number;
  sosButtonUnitPriceUsd: string;
  maxSosButtons: number;
  exchangeRateUsdToCdf: string | null;
  isActive: boolean;
  archivedAt: string | null;
  features: Record<string, unknown>;
}

export interface PriceBreakdown {
  tariffGroupCode: string;
  tariffGroupName: string;
  currency: Currency;
  registrationFeeUsd: number;
  monthlyFeeUsd: number;
  includedSosButtons: number;
  totalSosButtons: number;
  extraSosButtons: number;
  sosButtonUnitPriceUsd: number;
  sosButtonsTotalUsd: number;
  totalKitUsd: number;
  totalMonthlyUsd: number;
  exchangeRateUsdToCdf: number | null;
  totalKitCdf: number | null;
  totalMonthlyCdf: number | null;
}

export interface ClientProfile {
  id: string;
  zengoId: string;
  userId: string | null;
  organizationId: string;
  organization?: Organization;
  fullName: string;
  companyName: string | null;
  primaryPhone: string;
  secondaryPhone: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  preferredLanguage: Language;
  address: string | null;
  city: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  offerPack: OfferPack;
  tariffGroupId: string | null;
  tariffGroup?: TariffGroup | null;
  currency: Currency;
  status: ClientStatus;
  subscriptionStatus: SubscriptionStatus;
  subscriptionExpiresAt: string | null;
  lastPaymentAt: string | null;
  sosButtonCount: number;
  installationDate: string | null;
  notes: string | null;
  device?: Device | null;
  createdAt: string;
}

export interface SubDevice {
  id: string;
  subId: string;
  name: string;
  areaName: string | null;
  code: SubDeviceCode;
  state: string;
  lastSeenAt: string | null;
  lastStateChangeAt: string | null;
  decodedState?: {
    raw: string;
    offline: boolean;
    tamper: boolean;
    lowBattery: boolean;
    open: boolean;
  };
}

export interface Device {
  id: string;
  serialNumber: string;
  model: string;
  imei: string | null;
  simNumber: string | null;
  alarmPhoneNumber: string | null;
  clientId: string | null;
  client?: ClientProfile | null;
  organizationId: string | null;
  organization?: Organization | null;
  status: DeviceStatus;
  armMode: ArmMode;
  language: Language;
  firmwareVersion: number | null;
  firmwareTargetVersion: number | null;
  lastSeenAt: string | null;
  lastHeartbeatAt: string | null;
  subDevices?: SubDevice[];
  createdAt: string;
}

export interface AlertDispatch {
  id: string;
  alertId: string;
  stationId: string;
  station?: Organization;
  status: DispatchStatus;
  isEscalation: boolean;
  notifiedAt: string;
  respondedAt: string | null;
  note: string | null;
}

export interface AlertEvent {
  id: string;
  alertId: string;
  type: AlertEventType;
  message: string | null;
  actorUserId: string | null;
  actorLabel: string | null;
  data: Record<string, unknown>;
  createdAt: string;
}

export interface VoiceCall {
  id: string;
  alertId: string | null;
  clientId: string | null;
  language: Language;
  provider: string;
  providerCallId: string | null;
  toNumber: string;
  status: VoiceCallStatus;
  outcome: VoiceCallOutcome | null;
  dtmfDigit: string | null;
  detectedIntent: string | null;
  transcript: string | null;
  recordingUrl: string | null;
  scriptKey: string | null;
  attemptNumber: number;
  startedAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface Alert {
  id: string;
  reference: string;
  type: AlertType;
  severity: AlertSeverity;
  status: AlertStatus;
  source: AlertSource;
  clientId: string | null;
  client?: ClientProfile | null;
  deviceId: string | null;
  device?: Device | null;
  subDeviceId: string | null;
  subDevice?: SubDevice | null;
  organizationId: string | null;
  organization?: Organization | null;
  triggerMessage: string | null;
  subDeviceCode: SubDeviceCode | null;
  rawType: number | null;
  address: string | null;
  city: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  openedAt: string;
  acknowledgedAt: string | null;
  acknowledgedById: string | null;
  dispatchedAt: string | null;
  escalatedAt: string | null;
  escalationLevel: number;
  resolvedAt: string | null;
  resolvedById: string | null;
  resolution: AlertResolution | null;
  resolutionNote: string | null;
  voiceCallOutcome: VoiceCallOutcome | null;
  voiceCallLanguage: Language | null;
  clientConfirmed: boolean;
  occurrenceCount: number;
  lastOccurrenceAt: string;
  dispatches?: AlertDispatch[];
  voiceCalls?: VoiceCall[];
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface AlertStats {
  total: number;
  open: number;
  byStatus: Array<{ status: AlertStatus; count: number }>;
  byType: Array<{ type: AlertType; count: number }>;
  last24h: number;
  averageAcknowledgeSeconds: number | null;
  averageResolutionSeconds: number | null;
}

export interface AuditLog {
  id: string;
  actorUserId: string | null;
  actorLabel: string | null;
  organizationId: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  httpMethod: string | null;
  httpPath: string | null;
  httpStatus: number | null;
  ipAddress: string | null;
  createdAt: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
  user: CurrentUser;
}

export interface RealtimeEvent {
  type: string;
  alertId: string;
  reference: string;
  alertType: AlertType;
  severity: AlertSeverity;
  status: AlertStatus;
  source: AlertSource;
  clientId: string | null;
  organizationIds: string[];
  occurredAt: string;
  payload?: Record<string, unknown>;
}
