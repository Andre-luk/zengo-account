import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AlertDispatch } from '@database/entities/alert-dispatch.entity';
import { AlertEvent } from '@database/entities/alert-event.entity';
import { Alert } from '@database/entities/alert.entity';
import { ClientProfile } from '@database/entities/client-profile.entity';
import { Device } from '@database/entities/device.entity';
import { Organization } from '@database/entities/organization.entity';
import { SubDevice } from '@database/entities/sub-device.entity';
import { VoiceCall } from '@database/entities/voice-call.entity';
import { AlertLifecycleService } from '@modules/alerts/alert-lifecycle.service';
import { AlertVoiceCallService } from '@modules/alerts/alert-voice-call.service';
import { AlertVoiceCallsController } from '@modules/alerts/alert-voice-calls.controller';
import { AlertsController } from '@modules/alerts/alerts.controller';
import { AlertsService } from '@modules/alerts/alerts.service';
import { AlertsTasks } from '@modules/alerts/alerts.tasks';
import { OrganizationsModule } from '@modules/organizations/organizations.module';
import { TelephonyModule } from '@modules/telephony/telephony.module';

/**
 * Module Alertes & Zengo Monitoring Center.
 *
 * Dependances : TelephonyModule (emission d'appels) et OrganizationsModule
 * (perimetre du multi-tenant). Le module IoT depend de ce module pour injecter
 * les alarmes des centrales ; l'inverse n'est pas vrai, ce qui garantit un
 * graphe de modules acyclique.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Alert,
      AlertEvent,
      AlertDispatch,
      VoiceCall,
      ClientProfile,
      Device,
      SubDevice,
      Organization,
    ]),
    OrganizationsModule,
    TelephonyModule,
  ],
  controllers: [AlertsController, AlertVoiceCallsController],
  providers: [AlertsService, AlertLifecycleService, AlertVoiceCallService, AlertsTasks],
  exports: [AlertsService, AlertLifecycleService, AlertVoiceCallService],
})
export class AlertsModule {}
