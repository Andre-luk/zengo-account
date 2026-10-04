import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Device } from '@database/entities/device.entity';
import { SubDevice } from '@database/entities/sub-device.entity';
import { AlertsModule } from '@modules/alerts/alerts.module';
import { DevicesModule } from '@modules/devices/devices.module';
import { OrganizationsModule } from '@modules/organizations/organizations.module';
import { SimulationController } from '@modules/simulation/simulation.controller';
import { SimulationService } from '@modules/simulation/simulation.service';

/**
 * Banc d'essai du materiel (demonstration, formation, recette).
 *
 * Le module reutilise AlertsModule et DevicesModule : il n'existe aucun chemin
 * de code parallele entre une alarme simulee et une alarme transmise par un
 * vrai kit. Il est desactive par defaut en production (`SIMULATION_ENABLED`).
 */
@Module({
  imports: [TypeOrmModule.forFeature([Device, SubDevice]), AlertsModule, DevicesModule, OrganizationsModule],
  controllers: [SimulationController],
  providers: [SimulationService],
})
export class SimulationModule {}
