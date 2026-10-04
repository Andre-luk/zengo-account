import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientHealthMeasurement } from '@database/entities/client-health-measurement.entity';
import { ClientProfile } from '@database/entities/client-profile.entity';
import { Device } from '@database/entities/device.entity';
import { HealthAccessLog } from '@database/entities/health-access-log.entity';
import { HealthConsent } from '@database/entities/health-consent.entity';
import { NurseRequest } from '@database/entities/nurse-request.entity';
import { AlertsModule } from '@modules/alerts/alerts.module';
import { HealthAccessService } from '@modules/healthcare/health-access.service';
import { HealthMeasurementsService } from '@modules/healthcare/health-measurements.service';
import { HealthcareController } from '@modules/healthcare/healthcare.controller';
import { HealthcareTasks } from '@modules/healthcare/healthcare.tasks';
import { NurseRequestsService } from '@modules/healthcare/nurse-requests.service';
import { OrganizationsModule } from '@modules/organizations/organizations.module';

/**
 * Module e-Sante connectee.
 *
 * Dependances : OrganizationsModule (perimetre multi-tenant) et AlertsModule
 * (une mesure critique ouvre une alerte MEDICALE dans le pipeline du ZMC).
 * Le module IoT depend de celui-ci pour injecter les mesures des dispositifs ;
 * l'inverse n'est pas vrai, le graphe reste acyclique.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ClientHealthMeasurement,
      HealthConsent,
      HealthAccessLog,
      NurseRequest,
      ClientProfile,
      Device,
    ]),
    OrganizationsModule,
    AlertsModule,
  ],
  controllers: [HealthcareController],
  providers: [
    HealthAccessService,
    HealthMeasurementsService,
    NurseRequestsService,
    HealthcareTasks,
  ],
  exports: [
    HealthAccessService,
    HealthMeasurementsService,
    NurseRequestsService,
  ],
})
export class HealthcareModule {}
