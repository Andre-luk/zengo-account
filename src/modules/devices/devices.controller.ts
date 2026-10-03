import {
  Body,
  Controller,
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
import { DevicesService } from '@modules/devices/devices.service';
import {
  CreateDeviceDto,
  QueryDevicesDto,
  SetArmModeDto,
  SyncSubDevicesDto,
  UpdateDeviceDto,
  UpdateDeviceStatusDto,
} from '@modules/devices/dto/device.dto';

const DEVICE_MANAGER_ROLES = [
  Role.SUPER_ADMIN,
  Role.NATIONAL_DIRECTOR,
  Role.TECHNICAL_DIRECTOR,
  Role.PLATFORM_MANAGER,
  Role.TECHNICIAN,
  Role.AGENCY_MANAGER,
] as const;

@ApiTags('Dispositifs SafAlert')
@ApiBearerAuth()
@Controller('devices')
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Post()
  @Roles(...DEVICE_MANAGER_ROLES)
  @Audit(AuditAction.CREATE, 'Device')
  @ApiOperation({ summary: 'Provisionner un dispositif (numero de serie).' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateDeviceDto) {
    return this.devicesService.create(user, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Lister les dispositifs du perimetre.' })
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryDevicesDto) {
    return this.devicesService.findAll(user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detail d un dispositif (sous-appareils inclus).' })
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.devicesService.findOne(user, id);
  }

  @Get(':id/sub-devices')
  @ApiOperation({ summary: 'Sous-appareils du dispositif avec etat decode.' })
  listSubDevices(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.devicesService.listSubDevices(user, id);
  }

  @Post(':id/sub-devices')
  @Roles(...DEVICE_MANAGER_ROLES)
  @Audit(AuditAction.UPDATE, 'SubDevice')
  @ApiOperation({ summary: 'Declarer / mettre a jour des sous-appareils.' })
  syncSubDevices(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SyncSubDevicesDto,
  ) {
    return this.devicesService
      .findOne(user, id)
      .then((device) => this.devicesService.upsertSubDevices(device.id, dto.subDevices));
  }

  @Patch(':id')
  @Roles(...DEVICE_MANAGER_ROLES)
  @Audit(AuditAction.UPDATE, 'Device')
  @ApiOperation({ summary: 'Mettre a jour un dispositif.' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateDeviceDto,
  ) {
    return this.devicesService.update(user, id, dto);
  }

  @Patch(':id/status')
  @Roles(...DEVICE_MANAGER_ROLES)
  @Audit(AuditAction.STATUS_CHANGE, 'Device')
  @ApiOperation({ summary: 'Activer / desactiver un dispositif.' })
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateDeviceStatusDto,
  ) {
    return this.devicesService.updateStatus(user, id, dto.status);
  }

  @Post(':id/arm-mode')
  @Roles(...DEVICE_MANAGER_ROLES, Role.CLIENT_ADMIN)
  @Audit(AuditAction.DEVICE_ARM, 'Device')
  @ApiOperation({ summary: 'Armer / desarmer le dispositif (commande MQTT).' })
  setArmMode(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SetArmModeDto,
  ) {
    return this.devicesService.setArmMode(user, id, dto.mode, dto.way);
  }

  @Post(':id/token')
  @Roles(Role.SUPER_ADMIN, Role.TECHNICAL_DIRECTOR)
  @Audit(AuditAction.UPDATE, 'Device')
  @ApiOperation({ summary: 'Regenerer le token d authentification du dispositif.' })
  regenerateToken(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.devicesService.regenerateToken(user, id);
  }
}
