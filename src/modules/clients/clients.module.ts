import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientProfile } from '@database/entities/client-profile.entity';
import { Device } from '@database/entities/device.entity';
import { Organization } from '@database/entities/organization.entity';
import { TariffGroup } from '@database/entities/tariff-group.entity';
import { ClientsController } from '@modules/clients/clients.controller';
import { ClientsService } from '@modules/clients/clients.service';
import { OrganizationsModule } from '@modules/organizations/organizations.module';
import { TariffsModule } from '@modules/tariffs/tariffs.module';
import { UsersModule } from '@modules/users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ClientProfile, Organization, TariffGroup, Device]),
    OrganizationsModule,
    UsersModule,
    TariffsModule,
  ],
  controllers: [ClientsController],
  providers: [ClientsService],
  exports: [ClientsService],
})
export class ClientsModule {}
