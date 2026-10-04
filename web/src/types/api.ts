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
  | 'SMS_SENT'
  | 'STATUS_CHANGED'
  | 'NOTE_ADDED'
  | 'RESOLVED'
  | 'CANCELLED';
export type DispatchStatus = 'PENDING' | 'NOTIFIED' | 'ACKNOWLEDGED' | 'DECLINED' | 'ARRIVED' | 'COMPLETED';

export type InterventionStatus = 'ASSIGNED' | 'EN_ROUTE' | 'ON_SITE' | 'COMPLETED' | 'ABORTED';
export type FieldTeamStatus = 'AVAILABLE' | 'ENGAGED' | 'UNAVAILABLE';
export type InterventionOutcome =
  | 'RESOLVED_ON_SITE'
  | 'FALSE_ALARM_ON_SITE'
  | 'NO_ACTION_REQUIRED'
  | 'DAMAGE_REPORTED'
  | 'HANDOVER_TO_AUTHORITIES'
  | 'CLIENT_ABSENT'
  | 'EQUIPMENT_ISSUE';
export type InterventionAbortReason =
  | 'FALSE_ALARM'
  | 'CLIENT_CANCELLED'
  | 'NO_TEAM_AVAILABLE'
  | 'DUPLICATE'
  | 'OTHER';
export type TeamPositionSource = 'APP' | 'GPS_TRACKER' | 'MANUAL';
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

export type SmsMessageStatus = 'QUEUED' | 'SENT' | 'DELIVERED' | 'FAILED' | 'UNDELIVERED';
export type SmsDirection = 'OUTBOUND' | 'INBOUND';
export type SmsTemplate =
  | 'ALERT_RAISED'
  | 'ALERT_CONFIRMED'
  | 'MISSION_ASSIGNED'
  | 'MISSION_ON_SITE'
  | 'ALERT_CLOSED'
  | 'CUSTOM';
export type SmsEncoding = 'GSM7' | 'UCS2';

export interface SmsMessage {
  id: string;
  createdAt: string;
  alertId: string | null;
  clientId: string | null;
  interventionId: string | null;
  direction: SmsDirection;
  template: SmsTemplate;
  language: string;
  provider: string;
  providerMessageId: string | null;
  toNumber: string;
  fromNumber: string | null;
  body: string;
  encoding: SmsEncoding;
  segments: number;
  status: SmsMessageStatus;
  attemptNumber: number;
  errorCode: string | null;
  errorMessage: string | null;
  queuedAt: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  costUsd: string | null;
}

export interface SmsStats {
  total: number;
  byStatus: { status: SmsMessageStatus; count: number }[];
  acceptanceRate: number | null;
  deliveryRate: number | null;
  segments: number;
}

export type RiskLevel = 'CALME' | 'MODERE' | 'ELEVE' | 'CRITIQUE';
export type RiskTrend = 'EN_HAUSSE' | 'STABLE' | 'EN_BAISSE';

export interface RiskZone {
  cell: string;
  latitude: number;
  longitude: number;
  alerts: number;
  confirmed: number;
  byType: { type: AlertType; count: number }[];
  score: number;
  level: RiskLevel;
  city: string | null;
  recentAlerts: number;
  trend: RiskTrend;
  lastAlertAt: string;
}

export interface RiskSummary {
  windowDays: number;
  total: number;
  confirmed: number;
  confirmationRate: number | null;
  byLevel: Record<string, number>;
  topZones: RiskZone[];
  byCity: { city: string; alerts: number }[];
  repeatClients: { clientId: string; alerts: number; lastAlertAt: string; types: AlertType[] }[];
  thresholds: { level: RiskLevel; min: number }[];
}

export type SubscriptionDuration = 30 | 90 | 180;
export type SubscriptionCodeStatus = 'ISSUED' | 'ACTIVATED' | 'EXPIRED' | 'CANCELLED';
export type PaymentMethod =
  | 'MPESA'
  | 'AIRTEL_MONEY'
  | 'ORANGE_MONEY'
  | 'ILLICOCASH'
  | 'CASH_AGENCY'
  | 'BANK_TRANSFER';
export type PaymentChannel = 'MOBILE_MONEY' | 'CASH' | 'TRANSFER';
export type PaymentStatus = 'PENDING' | 'CONFIRMED' | 'FAILED' | 'REFUNDED';

export interface Subscription {
  id: string;
  createdAt: string;
  clientId: string;
  code: string;
  durationDays: SubscriptionDuration;
  status: SubscriptionCodeStatus;
  effectiveStatus: SubscriptionStatus;
  startsAt: string;
  endsAt: string;
  daysRemaining: number;
  validity: string;
  priceUsd: string;
  priceCdf: string | null;
  currency: 'USD' | 'CDF';
  discountUsd: string;
  isFirstSubscription: boolean;
  activatedAt: string | null;
  issuedAt: string;
  issuedByLabel: string | null;
  notes: string | null;
  client?: { id: string; zengoId: string; fullName: string; primaryPhone: string };
}

export interface ClientSubscriptionState {
  clientId: string;
  zengoId: string | null;
  status: SubscriptionStatus;
  effectiveStatus: SubscriptionStatus;
  expiresAt: string | null;
  daysRemaining: number;
  validity: string;
  restricted: boolean;
  history: Subscription[];
}

export interface SubscriptionStats {
  windowDays: number;
  revenueUsd: number;
  revenueCdf: number;
  payments: number;
  newSubscriptions: number;
  activeClients: number;
  expiringSoon: number;
  expired: number;
  byMethod: { method: PaymentMethod; count: number; amountUsd: number }[];
  pendingPayments: number;
}

export type MutationType = 'TRANSFER' | 'RETURN';
export type MutationStatus =
  | 'REQUESTED'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'APPLIED'
  | 'REVERTED'
  | 'CANCELLED';
export type MutationReason =
  | 'CLIENT_MOVED'
  | 'ASSIGNMENT_ERROR'
  | 'CLIENT_REQUEST'
  | 'COVERAGE_OPTIMISATION'
  | 'COMMERCIAL_DISPUTE'
  | 'OTHER';
export type IntegrationHorizon = 7 | 30;
export type IntegrationOutcome = 'SATISFACTORY' | 'ISSUES_REPORTED' | 'CLIENT_LOST' | 'PENDING';

export interface ClientMutation {
  id: string;
  reference: string;
  type: MutationType;
  status: MutationStatus;
  reason: MutationReason;
  note: string | null;
  client: { id: string; zengoId: string; fullName: string; primaryPhone: string } | null;
  from: { id: string; name: string; city: string | null };
  to: { id: string; name: string; city: string | null };
  requestedByLabel: string | null;
  requestedAt: string;
  reviewedByLabel: string | null;
  reviewedAt: string | null;
  reviewComment: string | null;
  rejectionReason: string | null;
  appliedAt: string | null;
  appliedByLabel: string | null;
  regionChanged: boolean;
  alertsRedirected: number;
  caseLoadSummary: string | null;
  servicesNotified: string[];
  clientNotifiedAt: string | null;
  revertedAt: string | null;
  revertReason: string | null;
  integration: {
    horizon: IntegrationHorizon;
    dueAt: string | null;
    reportedAt: string | null;
    outcome: IntegrationOutcome | null;
    note: string | null;
    late: boolean;
  }[];
  pendingIntegration: IntegrationHorizon[];
  canBeReviewed: boolean;
  canBeApplied: boolean;
  canBeReverted: boolean;
}

export interface MutationStats {
  windowDays: number;
  total: number;
  byStatus: { status: MutationStatus; count: number }[];
  byReason: { reason: MutationReason; count: number }[];
  averageProcessingHours: number | null;
  applied: number;
  rejected: number;
  reverted: number;
  integrationPending: number;
  integrationLate: number;
}

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

export interface FieldTeam {
  id: string;
  name: string;
  code: string | null;
  stationId: string;
  station?: Organization;
  speciality: StationType;
  status: FieldTeamStatus;
  leaderName: string | null;
  leaderPhone: string | null;
  membersCount: number;
  vehiclePlate: string | null;
  currentLatitude: number | null;
  currentLongitude: number | null;
  lastPositionAt: string | null;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
}

export interface InterventionReport {
  id: string;
  interventionId: string;
  outcome: InterventionOutcome;
  summary: string;
  actionsTaken: string | null;
  damages: string | null;
  peopleAssisted: number;
  photos: string[];
  signatureName: string | null;
  signedAt: string | null;
  durationSeconds: number | null;
  createdById: string | null;
  createdByLabel: string | null;
  clientNotified: boolean;
  createdAt: string;
}

export interface Intervention {
  id: string;
  reference: string;
  alertId: string;
  alert?: Alert;
  dispatchId: string | null;
  teamId: string;
  team?: FieldTeam;
  stationId: string;
  station?: Organization;
  status: InterventionStatus;
  destinationLabel: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  distanceMeters: number | null;
  etaMinutes: number | null;
  assignedAt: string;
  assignedById: string | null;
  assignedByLabel: string | null;
  autoAssigned: boolean;
  enRouteAt: string | null;
  onSiteAt: string | null;
  completedAt: string | null;
  abortedAt: string | null;
  abortReason: InterventionAbortReason | null;
  notes: string | null;
  report?: InterventionReport | null;
}

export interface TeamPosition {
  id: string;
  teamId: string;
  interventionId: string | null;
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  speedKmh: number | null;
  headingDegrees: number | null;
  source: TeamPositionSource;
  recordedAt: string;
}

export interface InterventionTrack {
  interventionId: string;
  reference: string;
  status: InterventionStatus;
  destination: { latitude: number; longitude: number } | null;
  teamPosition: { latitude: number; longitude: number } | null;
  remainingMeters: number | null;
  remainingEtaMinutes: number | null;
  positions: TeamPosition[];
}

export interface InterventionStats {
  total: number;
  open: number;
  byStatus: Array<{ status: InterventionStatus; count: number }>;
  last24h: number;
  averageResponseSeconds: number | null;
  averageDurationSeconds: number | null;
  completionRate: number | null;
  delayed: number;
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
  alertId: string | null;
  alertReference?: string | null;
  interventionId?: string | null;
  interventionReference?: string | null;
  teamId?: string | null;
  teamName?: string | null;
  stationId?: string | null;
  reference?: string;
  alertType?: AlertType;
  severity?: AlertSeverity;
  status?: AlertStatus | InterventionStatus | null;
  source?: AlertSource;
  clientId?: string | null;
  organizationIds: string[];
  occurredAt: string;
  payload?: Record<string, unknown>;
}
