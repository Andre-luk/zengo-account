import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Organization } from '@database/entities/organization.entity';
import { OrganizationsController } from '@modules/organizations/organizations.controller';
import {
  OrganizationsService,
  OrganizationScopeService,
} from '@modules/organizations/organizations.service';

@Module({
  imports: [TypeOrmModule.forFeature([Organization])],
  controllers: [OrganizationsController],
  providers: [OrganizationsService, OrganizationScopeService],
  exports: [OrganizationsService, OrganizationScopeService],
})
export class OrganizationsModule {}
