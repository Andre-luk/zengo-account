import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Organization } from '@database/entities/organization.entity';
import { RefreshToken } from '@database/entities/refresh-token.entity';
import { UserOrganization } from '@database/entities/user-organization.entity';
import { User } from '@database/entities/user.entity';
import { OrganizationsModule } from '@modules/organizations/organizations.module';
import { UsersController } from '@modules/users/users.controller';
import { UsersService } from '@modules/users/users.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, UserOrganization, Organization, RefreshToken]),
    OrganizationsModule,
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
