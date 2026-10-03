import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
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
  AbortInterventionDto,
  AdvanceInterventionDto,
  CreateInterventionDto,
  CreateInterventionReportDto,
  QueryInterventionsDto,
} from '@modules/interventions/dto/intervention.dto';
import { InterventionsService } from '@modules/interventions/interventions.service';

/** ZMC, encadrement et stations : habilitations de pilotage des missions. */
const INTERVENTION_MANAGER_ROLES = [
  Role.SUPER_ADMIN,
  Role.NATIONAL_DIRECTOR,
  Role.TECHNICAL_DIRECTOR,
  Role.PLATFORM_MANAGER,
  Role.REGION_MANAGER,
  Role.AGENCY_MANAGER,
  Role.OPERATOR,
  Role.SUPERVISOR,
  Role.STATION_AGENT,
] as const;

/** Agents de terrain : peuvent faire avancer et cloturer leur mission. */
const FIELD_ROLES = [...INTERVENTION_MANAGER_ROLES, Role.FIELD_AGENT, Role.HEALTH_STAFF] as const;

@ApiTags('Interventions terrain')
@ApiBearerAuth()
@Controller('interventions')
export class InterventionsController {
  constructor(private readonly interventionsService: InterventionsService) {}

  @Post()
  @Roles(...INTERVENTION_MANAGER_ROLES)
  @Audit(AuditAction.CREATE, 'Intervention')
  @ApiOperation({
    summary:
      "Engager une equipe sur une alerte (equipe designee ou affectation automatique de l'equipe disponible la plus proche).",
  })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateInterventionDto) {
    return this.interventionsService.create(user, dto);
  }

  @Get()
  @ApiOperation({
    summary:
      'Missions du perimetre : en cours puis historique (filtres statut, equipe, station, alerte, periode).',
  })
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryInterventionsDto) {
    return this.interventionsService.findAll(user, query);
  }

  @Get('stats')
  @ApiOperation({
    summary:
      "Indicateurs d'intervention : missions en cours, delai moyen d'arrivee, duree moyenne, taux de realisation, retards.",
  })
  stats(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryInterventionsDto) {
    return this.interventionsService.stats(user, query);
  }

  @Get('by-alert/:alertId')
  @ApiOperation({ summary: "Missions engagees sur une alerte (dossier d'intervention)." })
  listByAlert(
    @CurrentUser() user: AuthenticatedUser,
    @Param('alertId', new ParseUUIDPipe()) alertId: string,
  ) {
    return this.interventionsService.listByAlert(user, alertId);
  }

  @Get(':id')
  @ApiOperation({ summary: "Detail d'une mission (alerte, client, equipe, rapport)." })
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.interventionsService.findOne(user, id);
  }

  @Get(':id/track')
  @ApiOperation({ summary: 'Suivi GPS de la mission : position courante, distance et ETA restantes.' })
  track(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.interventionsService.track(user, id);
  }

  @Post(':id/en-route')
  @Roles(...FIELD_ROLES)
  @Audit(AuditAction.UPDATE, 'Intervention')
  @ApiOperation({ summary: "Confirmer le depart de l'equipe (mission en route)." })
  markEnRoute(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AdvanceInterventionDto,
  ) {
    return this.interventionsService.markEnRoute(user, id, dto.note);
  }

  @Post(':id/on-site')
  @Roles(...FIELD_ROLES)
  @Audit(AuditAction.UPDATE, 'Intervention')
  @ApiOperation({ summary: "Confirmer l'arrivee sur site (alerte en intervention)." })
  markOnSite(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AdvanceInterventionDto,
  ) {
    return this.interventionsService.markOnSite(user, id, dto.note);
  }

  @Post(':id/report')
  @Roles(...FIELD_ROLES)
  @Audit(AuditAction.STATUS_CHANGE, 'Intervention')
  @ApiOperation({
    summary:
      "Deposer le rapport de fin d'intervention (photos, degats, signature) et cloturer la mission.",
  })
  submitReport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreateInterventionReportDto,
  ) {
    return this.interventionsService.submitReport(user, id, dto);
  }

  @Post(':id/abort')
  @Roles(...INTERVENTION_MANAGER_ROLES)
  @Audit(AuditAction.STATUS_CHANGE, 'Intervention')
  @ApiOperation({ summary: 'Abandonner la mission (faux positif, annulation client, doublon...).' })
  abort(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AbortInterventionDto,
  ) {
    return this.interventionsService.abort(user, id, dto);
  }
}
