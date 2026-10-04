import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Alert } from '@database/entities/alert.entity';
import { ClientMutation } from '@database/entities/client-mutation.entity';
import { ClientProfile } from '@database/entities/client-profile.entity';
import { Device } from '@database/entities/device.entity';
import { Intervention } from '@database/entities/intervention.entity';
import { Organization } from '@database/entities/organization.entity';
import { SubDevice } from '@database/entities/sub-device.entity';
import { Subscription } from '@database/entities/subscription.entity';
import { AlertsModule } from '@modules/alerts/alerts.module';
import { ClientMutationsController } from '@modules/mutations/client-mutations.controller';
import { ClientMutationsService } from '@modules/mutations/client-mutations.service';
import { ClientMutationsTasks } from '@modules/mutations/client-mutations.tasks';
import { OrganizationsModule } from '@modules/organizations/organizations.module';

/**
 * Module Mutations geographiques (iteration 5).
 *
 * Il deplace un dossier d'une agence a une autre : client, equipements,
 * sous-appareils et alertes ouvertes suivent, ce qui impose de lire les entites
 * du parc et des alertes sans dependre de leurs modules (les alertes ne sont pas
 * modifiees par leur propre service ici, uniquement rattachees a une autre
 * organisation). Le canal SMS du module Alertes previent le client.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ClientMutation,
      ClientProfile,
      Organization,
      Device,
      SubDevice,
      Alert,
      Intervention,
      Subscription,
    ]),
    OrganizationsModule,
    AlertsModule,
  ],
  controllers: [ClientMutationsController],
  providers: [ClientMutationsService, ClientMutationsTasks],
  exports: [ClientMutationsService],
})
export class ClientMutationsModule {}
