export * from '@database/entities/alert-dispatch.entity';
export * from '@database/entities/alert-event.entity';
export * from '@database/entities/alert.entity';
export * from '@database/entities/audit-log.entity';
export * from '@database/entities/client-profile.entity';
export * from '@database/entities/device.entity';
export * from '@database/entities/field-team.entity';
export * from '@database/entities/intervention-report.entity';
export * from '@database/entities/intervention.entity';
export * from '@database/entities/organization.entity';
export * from '@database/entities/payment.entity';
export * from '@database/entities/refresh-token.entity';
export * from '@database/entities/sms-message.entity';
export * from '@database/entities/sub-device.entity';
export * from '@database/entities/subscription.entity';
export * from '@database/entities/tariff-group.entity';
export * from '@database/entities/team-position.entity';
export * from '@database/entities/user-organization.entity';
export * from '@database/entities/user.entity';
export * from '@database/entities/voice-call.entity';

import { AlertDispatch } from '@database/entities/alert-dispatch.entity';
import { AlertEvent } from '@database/entities/alert-event.entity';
import { Alert } from '@database/entities/alert.entity';
import { AuditLog } from '@database/entities/audit-log.entity';
import { ClientProfile } from '@database/entities/client-profile.entity';
import { Device } from '@database/entities/device.entity';
import { FieldTeam } from '@database/entities/field-team.entity';
import { InterventionReport } from '@database/entities/intervention-report.entity';
import { Intervention } from '@database/entities/intervention.entity';
import { Organization } from '@database/entities/organization.entity';
import { Payment } from '@database/entities/payment.entity';
import { RefreshToken } from '@database/entities/refresh-token.entity';
import { SmsMessage } from '@database/entities/sms-message.entity';
import { SubDevice } from '@database/entities/sub-device.entity';
import { Subscription } from '@database/entities/subscription.entity';
import { TariffGroup } from '@database/entities/tariff-group.entity';
import { TeamPosition } from '@database/entities/team-position.entity';
import { User } from '@database/entities/user.entity';
import { UserOrganization } from '@database/entities/user-organization.entity';
import { VoiceCall } from '@database/entities/voice-call.entity';

/** Liste exhaustive des entites gerees par TypeORM. */
export const ENTITIES = [
  Organization,
  User,
  UserOrganization,
  RefreshToken,
  TariffGroup,
  ClientProfile,
  Device,
  SubDevice,
  Alert,
  AlertEvent,
  AlertDispatch,
  VoiceCall,
  SmsMessage,
  Subscription,
  Payment,
  FieldTeam,
  Intervention,
  InterventionReport,
  TeamPosition,
  AuditLog,
];
