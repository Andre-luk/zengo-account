import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { Roles } from '@common/decorators/roles.decorator';
import { Role } from '@common/enums/role.enum';
import { AuthenticatedUser } from '@common/interfaces/authenticated-user.interface';
import {
  SimulateAlarmDto,
  SimulateArmModeDto,
  SimulateHeartbeatDto,
} from '@modules/simulation/dto/simulation.dto';
import { SimulationService } from '@modules/simulation/simulation.service';

/** Postes autorises a manipuler le banc d'essai (demonstration et recette). */
const SIMULATION_ROLES = [
  Role.SUPER_ADMIN,
  Role.TECHNICAL_DIRECTOR,
  Role.NATIONAL_DIRECTOR,
  Role.PLATFORM_MANAGER,
  Role.OPERATOR,
  Role.SUPERVISOR,
] as const;

/**
 * Banc d'essai du materiel SafAlert.
 *
 * Permet de jouer le role d'un kit installe chez un client (mise en ligne,
 * armement, declenchement d'un capteur) puis de repondre a l'appel de
 * verification, sans broker MQTT ni materiel.
 *
 * Le service emprunte exactement le meme chemin que la passerelle MQTT : ce que
 * l'on voit ici est ce que produirait un vrai declenchement.
 */
@ApiTags("Banc d'essai (simulation)")
@ApiBearerAuth()
@Controller('simulation')
export class SimulationController {
  constructor(private readonly simulationService: SimulationService) {}

  @Get('kits')
  @Roles(...SIMULATION_ROLES)
  @ApiOperation({ summary: 'Kits disponibles avec leurs capteurs et leur etat.' })
  listKits(@CurrentUser() user: AuthenticatedUser, @Query('search') search?: string) {
    return this.simulationService.listKits(user, search);
  }

  @Get('kits/:deviceId')
  @Roles(...SIMULATION_ROLES)
  @ApiOperation({ summary: "Detail d'un kit (capteurs, etats, mode d'armement)." })
  getKit(@CurrentUser() user: AuthenticatedUser, @Param('deviceId', new ParseUUIDPipe()) deviceId: string) {
    return this.simulationService.getKit(user, deviceId);
  }

  @Post('kits/:deviceId/heartbeat')
  @Roles(...SIMULATION_ROLES)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Le kit se declare en ligne et remonte l etat de ses capteurs.' })
  heartbeat(
    @CurrentUser() user: AuthenticatedUser,
    @Param('deviceId', new ParseUUIDPipe()) deviceId: string,
    @Body() dto: SimulateHeartbeatDto,
  ) {
    return this.simulationService.sendHeartbeat(user, deviceId, dto);
  }

  @Post('kits/:deviceId/arm-mode')
  @Roles(...SIMULATION_ROLES)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Le kit annonce son mode d'armement (desarme, absent, present)." })
  armMode(
    @CurrentUser() user: AuthenticatedUser,
    @Param('deviceId', new ParseUUIDPipe()) deviceId: string,
    @Body() dto: SimulateArmModeDto,
  ) {
    return this.simulationService.setArmMode(user, deviceId, dto);
  }

  @Post('kits/:deviceId/alarm')
  @Roles(...SIMULATION_ROLES)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Un capteur se declenche : creation reelle de l alerte, appel de verification et temporisation.',
  })
  alarm(
    @CurrentUser() user: AuthenticatedUser,
    @Param('deviceId', new ParseUUIDPipe()) deviceId: string,
    @Body() dto: SimulateAlarmDto,
  ) {
    return this.simulationService.triggerAlarm(user, deviceId, dto);
  }
}
