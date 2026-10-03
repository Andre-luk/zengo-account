import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AlertsModule } from '@modules/alerts/alerts.module';
import { DevicesModule } from '@modules/devices/devices.module';
import { MqttService } from '@modules/iot/mqtt.service';

/**
 * Module IoT (passerelle MQTT SafAlert).
 *
 * Le flux est unidirectionnel au niveau des dependances :
 *   IotModule -> DevicesModule  (heartbeat, sous-appareils, armement)
 *   IotModule -> AlertsModule   (alarmes -> pipeline du ZMC)
 *   DevicesService -> DeviceCommandBus -> MqttService (commandes sortantes)
 * Aucun de ces modules ne depend de IotModule : le graphe reste acyclique.
 */
@Module({
  imports: [ConfigModule, DevicesModule, AlertsModule],
  providers: [MqttService],
  exports: [MqttService],
})
export class IotModule {}
