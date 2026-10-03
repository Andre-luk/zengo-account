import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Device } from '@database/entities/device.entity';
import { SubDevice } from '@database/entities/sub-device.entity';
import { DeviceCommandBus } from '@modules/devices/device-command.bus';
import { DevicePresenceTask } from '@modules/devices/device-presence.task';
import { DevicesController } from '@modules/devices/devices.controller';
import { DevicesService } from '@modules/devices/devices.service';
import { OrganizationsModule } from '@modules/organizations/organizations.module';

@Module({
  imports: [TypeOrmModule.forFeature([Device, SubDevice]), OrganizationsModule],
  controllers: [DevicesController],
  providers: [DevicesService, DeviceCommandBus, DevicePresenceTask],
  exports: [DevicesService, DeviceCommandBus],
})
export class DevicesModule {}
