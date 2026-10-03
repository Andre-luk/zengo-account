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
import { ClientsService } from '@modules/clients/clients.service';
import {
  AssignDeviceDto,
  CreateClientDto,
  UpdateClientDto,
  UpdateClientStatusDto,
} from '@modules/clients/dto/client.dto';
import { QueryClientsDto } from '@modules/clients/dto/query-clients.dto';

const CLIENT_MANAGER_ROLES = [
  Role.SUPER_ADMIN,
  Role.NATIONAL_DIRECTOR,
  Role.TECHNICAL_DIRECTOR,
  Role.PLATFORM_MANAGER,
  Role.REGION_MANAGER,
  Role.AGENCY_MANAGER,
  Role.ACCOUNTANT,
] as const;

/**
 * Lecture des fiches clients. Les operateurs du ZMC et les agents de station
 * doivent pouvoir consulter le dossier (contacts, localisation, equipement)
 * pour qualifier une alerte, sans pouvoir le modifier.
 */
const CLIENT_READ_ROLES = [
  ...CLIENT_MANAGER_ROLES,
  Role.OPERATOR,
  Role.SUPERVISOR,
  Role.STATION_AGENT,
  Role.FIELD_AGENT,
  Role.HEALTH_STAFF,
] as const;

@ApiTags('Comptes clients')
@ApiBearerAuth()
@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get('me')
  @ApiOperation({ summary: 'Profil du client connecte (application mobile).' })
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.clientsService.findMyProfile(user.id);
  }

  @Post()
  @Roles(...CLIENT_MANAGER_ROLES)
  @Audit(AuditAction.CREATE, 'ClientProfile')
  @ApiOperation({
    summary: 'Creer un compte client Zengo (ID unique + login + fiche).',
    description:
      "Etape 2 du processus du cahier des charges : le Responsable plateforme cree le compte a partir des donnees transmises par la comptabilite. L'ID Zengo et un mot de passe temporaire (si le mot de passe n'est pas fourni) sont renvoyes une seule fois.",
  })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateClientDto) {
    return this.clientsService.create(user, dto);
  }

  @Get()
  @Roles(...CLIENT_READ_ROLES)
  @ApiOperation({ summary: 'Lister les comptes clients du perimetre.' })
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryClientsDto) {
    return this.clientsService.findAll(user, query);
  }

  @Get(':id')
  @Roles(...CLIENT_READ_ROLES)
  @ApiOperation({ summary: 'Fiche client detaillee.' })
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.clientsService.findOne(user, id);
  }

  @Get(':id/pricing')
  @Roles(...CLIENT_READ_ROLES)
  @ApiOperation({ summary: 'Detail de facturation (kit + boutons SOS + abonnement).' })
  pricing(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.clientsService.findOne(user, id).then(() => this.clientsService.buildPricing(id));
  }

  @Patch(':id')
  @Roles(...CLIENT_MANAGER_ROLES)
  @Audit(AuditAction.UPDATE, 'ClientProfile')
  @ApiOperation({ summary: 'Mettre a jour une fiche client.' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateClientDto,
  ) {
    return this.clientsService.update(user, id, dto);
  }

  @Patch(':id/status')
  @Roles(...CLIENT_MANAGER_ROLES)
  @Audit(AuditAction.STATUS_CHANGE, 'ClientProfile')
  @ApiOperation({ summary: 'Changer le statut du compte (actif, suspendu, archive...).' })
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateClientStatusDto,
  ) {
    return this.clientsService.updateStatus(user, id, dto.status);
  }

  @Post(':id/device')
  @Roles(Role.SUPER_ADMIN, Role.TECHNICAL_DIRECTOR, Role.PLATFORM_MANAGER, Role.TECHNICIAN, Role.AGENCY_MANAGER)
  @Audit(AuditAction.UPDATE, 'Device')
  @ApiOperation({ summary: 'Rattacher un dispositif SafAlert au compte client.' })
  assignDevice(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AssignDeviceDto,
  ) {
    if (dto.serialNumber) return this.clientsService.assignDeviceBySerial(user, id, dto.serialNumber);
    return this.clientsService.assignDevice(user, id, dto.deviceId);
  }

  @Delete(':id/device')
  @Roles(Role.SUPER_ADMIN, Role.TECHNICAL_DIRECTOR, Role.PLATFORM_MANAGER, Role.TECHNICIAN)
  @Audit(AuditAction.UPDATE, 'Device')
  @ApiOperation({ summary: 'Detacher le dispositif du compte client.' })
  unassignDevice(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.clientsService.unassignDevice(user, id);
  }

  @Post(':id/installation')
  @Roles(Role.SUPER_ADMIN, Role.TECHNICAL_DIRECTOR, Role.PLATFORM_MANAGER, Role.TECHNICIAN)
  @Audit(AuditAction.STATUS_CHANGE, 'ClientProfile')
  @ApiOperation({
    summary: "Finaliser l'installation (liaison ID Zengo <-> numero de serie, activation du compte).",
  })
  completeInstallation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AssignDeviceDto,
  ) {
    return this.clientsService.completeInstallation(user, id, dto.deviceId);
  }
}
