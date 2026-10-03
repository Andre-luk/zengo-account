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
import {
  CreateFieldTeamDto,
  QueryFieldTeamsDto,
  TeamPositionDto,
  UpdateFieldTeamDto,
  UpdateFieldTeamStatusDto,
} from '@modules/interventions/dto/field-team.dto';
import { FieldTeamsService } from '@modules/interventions/field-teams.service';

/** Encadrement habilite a creer et administrer les equipes d'intervention. */
const TEAM_MANAGER_ROLES = [
  Role.SUPER_ADMIN,
  Role.NATIONAL_DIRECTOR,
  Role.TECHNICAL_DIRECTOR,
  Role.PLATFORM_MANAGER,
  Role.REGION_MANAGER,
  Role.AGENCY_MANAGER,
] as const;

/** Agents autorises a remonter leur position GPS. */
const POSITION_ROLES = [
  ...TEAM_MANAGER_ROLES,
  Role.OPERATOR,
  Role.SUPERVISOR,
  Role.STATION_AGENT,
  Role.FIELD_AGENT,
  Role.HEALTH_STAFF,
] as const;

@ApiTags('Equipes terrain')
@ApiBearerAuth()
@Controller('field-teams')
export class FieldTeamsController {
  constructor(private readonly fieldTeamsService: FieldTeamsService) {}

  @Post()
  @Roles(...TEAM_MANAGER_ROLES)
  @Audit(AuditAction.CREATE, 'FieldTeam')
  @ApiOperation({ summary: "Declarer une equipe d'intervention rattachee a une station." })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateFieldTeamDto) {
    return this.fieldTeamsService.create(user, dto);
  }

  @Get()
  @ApiOperation({
    summary:
      "Equipes du perimetre (filtres : disponibilite, specialite, station). Tri par distance si une position est fournie.",
  })
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryFieldTeamsDto) {
    return this.fieldTeamsService.findAll(user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: "Detail d'une equipe (station, vehicule, position courante)." })
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.fieldTeamsService.findOne(user, id);
  }

  @Get(':id/positions')
  @ApiOperation({ summary: "Trace GPS recente de l'equipe (trajet des dernieres missions)." })
  listPositions(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('limit') limit?: string,
  ) {
    return this.fieldTeamsService.listPositions(user, id, limit ? Number(limit) : 100);
  }

  @Patch(':id')
  @Roles(...TEAM_MANAGER_ROLES)
  @Audit(AuditAction.UPDATE, 'FieldTeam')
  @ApiOperation({ summary: "Mettre a jour une equipe (chef, effectif, vehicule, activation)." })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateFieldTeamDto,
  ) {
    return this.fieldTeamsService.update(user, id, dto);
  }

  @Patch(':id/status')
  @Roles(...TEAM_MANAGER_ROLES)
  @Audit(AuditAction.STATUS_CHANGE, 'FieldTeam')
  @ApiOperation({ summary: 'Basculer la disponibilite (disponible, engagee, hors service).' })
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateFieldTeamStatusDto,
  ) {
    return this.fieldTeamsService.updateStatus(user, id, dto.status, dto.note);
  }

  @Post(':id/position')
  @Roles(...POSITION_ROLES)
  @Audit(AuditAction.UPDATE, 'TeamPosition')
  @ApiOperation({
    summary:
      "Remonter la position GPS de l'equipe (application mobile de l'agent ou boitier vehicule). Le releve est rattache a la mission en cours de l'equipe si aucune mission n'est precisee.",
  })
  recordPosition(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: TeamPositionDto,
  ) {
    return this.fieldTeamsService.recordPosition(user, id, dto, dto.interventionId ?? null);
  }
}
