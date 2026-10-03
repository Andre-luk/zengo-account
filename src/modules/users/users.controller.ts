import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Audit } from '@common/decorators/audit.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { Roles } from '@common/decorators/roles.decorator';
import { Role } from '@common/enums/role.enum';
import { AuditAction } from '@common/enums/user.enum';
import { AuthenticatedUser } from '@common/interfaces/authenticated-user.interface';
import {
  AddMembershipDto,
  ChangePasswordDto,
  CreateUserDto,
  QueryUsersDto,
  ResetPasswordDto,
  UpdateUserDto,
  UpdateUserStatusDto,
} from '@modules/users/dto/user.dto';
import { UsersService } from '@modules/users/users.service';

const USER_MANAGER_ROLES = [
  Role.SUPER_ADMIN,
  Role.NATIONAL_DIRECTOR,
  Role.TECHNICAL_DIRECTOR,
  Role.PLATFORM_MANAGER,
  Role.REGION_MANAGER,
  Role.AGENCY_MANAGER,
] as const;

@ApiTags('Utilisateurs')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Profil de l utilisateur connecte.' })
  async me(@CurrentUser() user: AuthenticatedUser) {
    const entity = await this.usersService.findByIdOrFail(user.id);
    return {
      id: entity.id,
      email: entity.email,
      phone: entity.phone,
      firstName: entity.firstName,
      lastName: entity.lastName,
      preferredLanguage: entity.preferredLanguage,
      status: entity.status,
      isSuperAdmin: entity.isSuperAdmin,
      mustChangePassword: entity.mustChangePassword,
      twoFactorEnabled: entity.twoFactorEnabled,
      roles: user.roles,
      memberships: user.memberships,
      lastLoginAt: entity.lastLoginAt,
    };
  }

  @Patch('me')
  @ApiOperation({ summary: 'Mettre a jour son propre profil.' })
  updateMe(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateUserDto) {
    return this.usersService.update(user, user.id, dto);
  }

  @Post('me/change-password')
  @Audit(AuditAction.PASSWORD_CHANGED, 'User')
  @ApiOperation({ summary: 'Changer son mot de passe.' })
  async changeMyPassword(@CurrentUser() user: AuthenticatedUser, @Body() dto: ChangePasswordDto) {
    await this.usersService.changePassword(user.id, dto);
    return { success: true };
  }

  @Post()
  @Roles(...USER_MANAGER_ROLES)
  @Audit(AuditAction.CREATE, 'User')
  @ApiOperation({
    summary: 'Creer un utilisateur (agent, operateur, technicien, client...).',
    description:
      "Si aucun mot de passe n'est fourni, un mot de passe temporaire est genere et renvoye une seule fois.",
  })
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Get()
  @Roles(...USER_MANAGER_ROLES)
  @ApiOperation({ summary: 'Lister les utilisateurs du perimetre.' })
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryUsersDto) {
    return this.usersService.findAll(user, query);
  }

  @Get(':id')
  @Roles(...USER_MANAGER_ROLES)
  @ApiOperation({ summary: 'Detail d un utilisateur.' })
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.usersService.findOneInScope(user, id);
  }

  @Patch(':id')
  @Roles(...USER_MANAGER_ROLES)
  @Audit(AuditAction.UPDATE, 'User')
  @ApiOperation({ summary: 'Mettre a jour un utilisateur.' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.update(user, id, dto);
  }

  @Patch(':id/status')
  @Roles(...USER_MANAGER_ROLES)
  @Audit(AuditAction.STATUS_CHANGE, 'User')
  @ApiOperation({ summary: 'Activer / suspendre / desactiver un utilisateur.' })
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateUserStatusDto,
  ) {
    return this.usersService.updateStatus(user, id, dto.status);
  }

  @Post(':id/reset-password')
  @Roles(...USER_MANAGER_ROLES)
  @Audit(AuditAction.PASSWORD_RESET, 'User')
  @ApiOperation({ summary: 'Reinitialiser le mot de passe (support technique).' })
  resetPassword(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ResetPasswordDto,
  ) {
    return this.usersService.resetPassword(user, id, dto);
  }

  @Post(':id/memberships')
  @Roles(Role.SUPER_ADMIN, Role.NATIONAL_DIRECTOR, Role.TECHNICAL_DIRECTOR, Role.PLATFORM_MANAGER, Role.REGION_MANAGER)
  @Audit(AuditAction.UPDATE, 'UserOrganization')
  @ApiOperation({ summary: 'Ajouter une appartenance (organisation + role).' })
  addMembership(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AddMembershipDto,
  ) {
    return this.usersService.addMembership(user, id, dto.organizationId, dto.role, dto.isPrimary ?? false);
  }

  @Delete(':id/memberships/:membershipId')
  @Roles(Role.SUPER_ADMIN, Role.NATIONAL_DIRECTOR, Role.TECHNICAL_DIRECTOR, Role.PLATFORM_MANAGER, Role.REGION_MANAGER)
  @Audit(AuditAction.UPDATE, 'UserOrganization')
  @ApiOperation({ summary: 'Retirer une appartenance.' })
  removeMembership(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('membershipId', new ParseUUIDPipe()) membershipId: string,
  ) {
    return this.usersService.removeMembership(user, id, membershipId);
  }
}
