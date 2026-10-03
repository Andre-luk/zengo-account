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
import { AlertsService } from '@modules/alerts/alerts.service';
import {
  AddAlertNoteDto,
  AcknowledgeAlertDto,
  CreateManualAlertDto,
  DispatchAlertDto,
  EscalateAlertDto,
  QueryAlertsDto,
  ResolveAlertDto,
  UpdateDispatchStatusDto,
} from '@modules/alerts/dto/alert.dto';

/** Roles habilités a piloter une alerte depuis le ZMC ou une station. */
const ALERT_OPERATOR_ROLES = [
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

/** Roles terrain autorises a faire avancer le statut d'une mission affectee. */
const FIELD_ROLES = [...ALERT_OPERATOR_ROLES, Role.FIELD_AGENT, Role.HEALTH_STAFF] as const;

@ApiTags('Alertes & ZMC')
@ApiBearerAuth()
@Controller('alerts')
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Post()
  @Roles(...ALERT_OPERATOR_ROLES)
  @Audit(AuditAction.CREATE, 'Alert')
  @ApiOperation({
    summary: 'Declencher manuellement une alerte pour un client (operateur du ZMC).',
  })
  createManual(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateManualAlertDto) {
    return this.alertsService.createByOperator(user, dto);
  }

  @Post('sos')
  @Audit(AuditAction.CREATE, 'Alert')
  @ApiOperation({
    summary: "Bouton d'urgence de l'application mobile (client) : incendie, intrusion, sante.",
  })
  createSos(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateManualAlertDto) {
    return this.alertsService.createByClient(user.id, dto);
  }

  @Get('stats')
  @ApiOperation({
    summary: 'Indicateurs de la console : alertes ouvertes, repartition, delais moyens de prise en charge.',
  })
  stats(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryAlertsDto) {
    return this.alertsService.stats(user, query);
  }

  @Get()
  @ApiOperation({ summary: 'File d alertes du perimetre (filtres : statut, type, gravite, periode).' })
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryAlertsDto) {
    return this.alertsService.findAll(user, query);
  }

  @Get('stations/:organizationId')
  @ApiOperation({ summary: "Stations d'intervention rattachees a une agence (interface de deploiement)." })
  listStations(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
  ) {
    return this.alertsService.listStations(user, organizationId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detail complet d une alerte (client, dispositif, affectations, appels).' })
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.alertsService.findOne(user, id);
  }

  @Get(':id/timeline')
  @ApiOperation({ summary: "Chronologie de l'alerte (qui a fait quoi, quand)." })
  timeline(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.alertsService.getTimeline(user, id);
  }

  @Get(':id/voice-calls')
  @ApiOperation({ summary: "Appels vocaux IA lies a l'alerte (statut, touche, transcription)." })
  voiceCalls(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.alertsService.listVoiceCalls(user, id);
  }

  @Post(':id/acknowledge')
  @Roles(...ALERT_OPERATOR_ROLES)
  @Audit(AuditAction.UPDATE, 'Alert')
  @ApiOperation({ summary: "Prendre en charge l'alerte (accuse de reception operateur)." })
  acknowledge(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AcknowledgeAlertDto,
  ) {
    return this.alertsService.acknowledge(user, id, dto);
  }

  @Post(':id/dispatch')
  @Roles(...ALERT_OPERATOR_ROLES)
  @Audit(AuditAction.UPDATE, 'Alert')
  @ApiOperation({
    summary:
      "Transmettre la mission aux stations d'intervention (selection manuelle ou affectation automatique selon le type d'alerte).",
  })
  dispatch(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: DispatchAlertDto,
  ) {
    return this.alertsService.dispatch(user, id, dto);
  }

  @Post(':id/escalate')
  @Roles(...ALERT_OPERATOR_ROLES)
  @Audit(AuditAction.UPDATE, 'Alert')
  @ApiOperation({
    summary: 'Escalader manuellement (toutes les equipes du PDC, ou niveau regional).',
  })
  escalate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: EscalateAlertDto,
  ) {
    return this.alertsService.escalate(user, id, dto);
  }

  @Post(':id/resolve')
  @Roles(...ALERT_OPERATOR_ROLES)
  @Audit(AuditAction.UPDATE, 'Alert')
  @ApiOperation({ summary: "Cloturer l'alerte avec un compte rendu." })
  resolve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ResolveAlertDto,
  ) {
    return this.alertsService.resolve(user, id, dto);
  }

  @Post(':id/false-alarm')
  @Roles(...ALERT_OPERATOR_ROLES)
  @Audit(AuditAction.UPDATE, 'Alert')
  @ApiOperation({ summary: 'Classer l alerte en faux positif (incident technique, test...).' })
  falseAlarm(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ResolveAlertDto,
  ) {
    return this.alertsService.markFalseAlarm(user, id, dto);
  }

  @Post(':id/cancel')
  @Roles(...ALERT_OPERATOR_ROLES)
  @Audit(AuditAction.UPDATE, 'Alert')
  @ApiOperation({ summary: "Annuler l'alerte." })
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AddAlertNoteDto,
  ) {
    return this.alertsService.cancel(user, id, dto);
  }

  @Post(':id/notes')
  @Roles(...FIELD_ROLES)
  @Audit(AuditAction.UPDATE, 'Alert')
  @ApiOperation({ summary: 'Ajouter une note au dossier d intervention.' })
  addNote(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AddAlertNoteDto,
  ) {
    return this.alertsService.addNote(user, id, dto);
  }

  @Patch(':id/dispatches/:dispatchId')
  @Roles(...FIELD_ROLES)
  @Audit(AuditAction.UPDATE, 'AlertDispatch')
  @ApiOperation({
    summary: "Accuse de reception, refus, arrivee sur site ou fin d'intervention d'une station.",
  })
  updateDispatch(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('dispatchId', new ParseUUIDPipe()) dispatchId: string,
    @Body() dto: UpdateDispatchStatusDto,
  ) {
    return this.alertsService.updateDispatchStatus(user, id, dispatchId, dto);
  }
}
