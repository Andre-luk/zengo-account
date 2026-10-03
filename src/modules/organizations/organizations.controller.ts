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
import { OrganizationStatus } from '@common/enums/organization.enum';
import { Role } from '@common/enums/role.enum';
import { AuditAction } from '@common/enums/user.enum';
import { AuthenticatedUser } from '@common/interfaces/authenticated-user.interface';
import { CreateOrganizationDto } from '@modules/organizations/dto/create-organization.dto';
import { QueryOrganizationsDto } from '@modules/organizations/dto/query-organizations.dto';
import { UpdateOrganizationDto } from '@modules/organizations/dto/update-organization.dto';
import { OrganizationsService } from '@modules/organizations/organizations.service';

@ApiTags('Organisations')
@ApiBearerAuth()
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.NATIONAL_DIRECTOR, Role.TECHNICAL_DIRECTOR)
  @Audit(AuditAction.CREATE, 'Organization')
  @ApiOperation({ summary: 'Creer une organisation (region, agence, station, institution).' })
  create(@Body() dto: CreateOrganizationDto) {
    return this.organizationsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Lister les organisations du perimetre de l utilisateur.' })
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryOrganizationsDto) {
    return this.organizationsService.findAll(user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detail d une organisation.' })
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.organizationsService.findOneInScope(user, id);
  }

  @Get(':id/descendants')
  @ApiOperation({ summary: 'Organisations descendantes (toutes profondeurs).' })
  async findDescendants(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    await this.organizationsService.findOneInScope(user, id);
    return this.organizationsService.findDescendants(id);
  }

  @Patch(':id')
  @Roles(Role.SUPER_ADMIN, Role.NATIONAL_DIRECTOR, Role.TECHNICAL_DIRECTOR, Role.REGION_MANAGER)
  @Audit(AuditAction.UPDATE, 'Organization')
  @ApiOperation({ summary: 'Mettre a jour une organisation.' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateOrganizationDto,
  ) {
    return this.organizationsService.update(user, id, dto);
  }

  @Patch(':id/status')
  @Roles(Role.SUPER_ADMIN, Role.NATIONAL_DIRECTOR, Role.TECHNICAL_DIRECTOR)
  @Audit(AuditAction.STATUS_CHANGE, 'Organization')
  @ApiOperation({ summary: 'Activer / suspendre une organisation.' })
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body('status') status: OrganizationStatus,
  ) {
    return this.organizationsService.updateStatus(user, id, status);
  }

  @Delete(':id')
  @Roles(Role.SUPER_ADMIN, Role.NATIONAL_DIRECTOR, Role.TECHNICAL_DIRECTOR)
  @Audit(AuditAction.DELETE, 'Organization')
  @ApiOperation({ summary: 'Archiver une organisation (suppression logique).' })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    await this.organizationsService.remove(user, id);
    return { success: true };
  }
}
