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
import { HealthAccessAction } from '@common/enums/health.enum';
import { AuditAction } from '@common/enums/user.enum';
import { AuthenticatedUser } from '@common/interfaces/authenticated-user.interface';
import { HealthAccessService } from '@modules/healthcare/health-access.service';
import { HealthMeasurementsService } from '@modules/healthcare/health-measurements.service';
import { NurseRequestsService } from '@modules/healthcare/nurse-requests.service';
import {
  CancelNurseRequestDto,
  CompleteNurseRequestDto,
  CreateNurseRequestDto,
  ExportHealthDataDto,
  GrantConsentDto,
  NurseRequestMessageDto,
  QueryMeasurementsDto,
  QueryNurseRequestsDto,
  RecordMeasurementDto,
  RevokeConsentDto,
} from '@modules/healthcare/dto/health.dto';

/** Personnel habilite a consulter les donnees de sante. */
const READ_ROLES = [
  Role.HEALTH_STAFF,
  Role.SUPER_ADMIN,
  Role.NATIONAL_DIRECTOR,
  Role.TECHNICAL_DIRECTOR,
] as const;

/** Profils autorises a saisir une mesure (le client saisit la sienne). */
const MEASURE_ROLES = [...READ_ROLES, Role.CLIENT] as const;

/** Personnel de sante pilote du centre de soin. */
const MANAGE_ROLES = [
  Role.HEALTH_STAFF,
  Role.SUPER_ADMIN,
  Role.NATIONAL_DIRECTOR,
] as const;

/**
 * Module e-Sante connectee (healthcare).
 *
 * Distinct du module `health` qui expose la sonde technique `GET /health` :
 * ici il s'agit du dossier de sante des clients (mesures, consentements,
 * demandes de soin). Ordre des routes : dans chaque famille, les chemins
 * litteraux (`stats`) sont declares avant `/:id`, sinon ils seraient
 * interpretes comme un identifiant.
 */
@ApiTags('Sante connectee')
@ApiBearerAuth()
@Controller('healthcare')
export class HealthcareController {
  constructor(
    private readonly measurements: HealthMeasurementsService,
    private readonly consents: HealthAccessService,
    private readonly nurseRequests: NurseRequestsService,
  ) {}

  // --- Mesures ---------------------------------------------------------------

  @Post('measurements')
  @Roles(...MEASURE_ROLES)
  @Audit(AuditAction.CREATE, 'ClientHealthMeasurement')
  @ApiOperation({
    summary:
      "Enregistrer une mesure de sante (personnel de sante ou client). Les valeurs critiques declenchent une alerte medicale.",
  })
  recordMeasurement(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RecordMeasurementDto,
  ) {
    return this.measurements.record(user, dto);
  }

  @Get('measurements/stats')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Indicateurs de sante du perimetre.' })
  measurementStats(@CurrentUser() user: AuthenticatedUser) {
    return this.measurements.stats(user);
  }

  @Get('measurements')
  @Roles(...READ_ROLES)
  @ApiOperation({
    summary: 'Historique des mesures (client, grandeur, statut, periode).',
  })
  listMeasurements(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryMeasurementsDto,
  ) {
    return this.measurements.findAll(user, query);
  }

  // --- Dossiers clients ------------------------------------------------------

  @Get('clients/:clientId')
  @Roles(...MEASURE_ROLES)
  @Audit(AuditAction.HEALTH_DATA_ACCESS, 'ClientProfile')
  @ApiOperation({
    summary:
      "Dossier de sante d'un client : dernieres valeurs, tendances et mesures critiques. Acces conditionne au consentement.",
  })
  dossier(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Query('emergency') emergency?: string,
  ) {
    return this.measurements.dossier(user, clientId, {
      emergency: emergency === 'true',
    });
  }

  @Get('clients/:clientId/measurements')
  @Roles(...MEASURE_ROLES)
  @ApiOperation({ summary: "Historique detaille des mesures d'un client." })
  clientMeasurements(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Query() query: QueryMeasurementsDto,
  ) {
    return this.measurements.history(user, clientId, query);
  }

  @Get('clients/:clientId/consents')
  @Roles(...MEASURE_ROLES)
  @ApiOperation({ summary: 'Consentements enregistres pour un client.' })
  listConsents(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clientId', ParseUUIDPipe) clientId: string,
  ) {
    return this.consents.listConsents(clientId);
  }

  @Post('clients/:clientId/consents')
  @Roles(...MANAGE_ROLES, Role.CLIENT)
  @Audit(AuditAction.HEALTH_DATA_ACCESS, 'HealthConsent')
  @ApiOperation({ summary: "Enregistrer le consentement d'un client." })
  async grantConsent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Body() dto: GrantConsentDto,
  ) {
    const client = await this.consents.resolveClient(user, clientId);
    return this.consents.grant(user, client, dto);
  }

  @Patch('clients/:clientId/consents/revoke')
  @Roles(...MANAGE_ROLES, Role.CLIENT)
  @Audit(AuditAction.HEALTH_DATA_ACCESS, 'HealthConsent')
  @ApiOperation({ summary: 'Retirer un consentement (choix du client).' })
  async revokeConsent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Body() dto: RevokeConsentDto,
  ) {
    const client = await this.consents.resolveClient(user, clientId);
    return this.consents.revoke(user, client, dto);
  }

  @Get('clients/:clientId/access-logs')
  @Roles(...READ_ROLES)
  @ApiOperation({
    summary:
      "Journal d'acces aux donnees de sante (qui a vu quoi, quand, pourquoi).",
  })
  async accessLogs(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Query() query: QueryMeasurementsDto,
  ) {
    this.consents.assertHealthStaff(user);
    await this.consents.resolveClient(user, clientId);
    return this.consents.listAccessLogs(clientId, query);
  }

  @Post('clients/:clientId/export')
  @Roles(...READ_ROLES)
  @Audit(AuditAction.HEALTH_DATA_ACCESS, 'ClientProfile')
  @ApiOperation({
    summary:
      "Exporter les donnees de sante d'un client (motif obligatoire, acces d'urgence possible), l'export etant trace.",
  })
  async exportHealthData(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Body() dto: ExportHealthDataDto,
  ) {
    const client = await this.consents.resolveClient(user, clientId);
    await this.consents.assertReadAccess(user, client, {
      emergency: dto.emergency,
    });
    const dossier = await this.measurements.dossier(user, clientId, {
      days: 365,
      emergency: dto.emergency,
    });
    await this.consents.log({
      clientId,
      action: HealthAccessAction.EXPORT,
      actor: user,
      reason: dto.reason,
      detail: `${dossier.sampleSize} mesure(s) exportee(s).`,
    });
    return { exportedAt: new Date(), reason: dto.reason, dossier };
  }

  @Get('clients/:clientId/nurse-requests')
  @Roles(...MEASURE_ROLES)
  @ApiOperation({ summary: "Demandes de soin d'un client." })
  clientNurseRequests(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clientId', ParseUUIDPipe) clientId: string,
  ) {
    return this.nurseRequests.forClient(user, clientId);
  }

  // --- Demandes de soin ------------------------------------------------------

  @Post('nurse-requests')
  @Roles(...MANAGE_ROLES, Role.CLIENT, Role.OPERATOR, Role.SUPERVISOR)
  @Audit(AuditAction.NURSE_REQUEST, 'NurseRequest')
  @ApiOperation({
    summary:
      "Ouvrir une demande de soin / appel infirmier. La priorite est deduite des dernieres mesures si elle n'est pas fournie.",
  })
  createNurseRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateNurseRequestDto,
  ) {
    return this.nurseRequests.create(user, dto);
  }

  @Get('nurse-requests/stats')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Indicateurs du centre de soin (delais, retards).' })
  nurseRequestStats(@CurrentUser() user: AuthenticatedUser) {
    return this.nurseRequests.stats(user);
  }

  @Get('nurse-requests')
  @Roles(...READ_ROLES)
  @ApiOperation({
    summary:
      'File des demandes de soin (statut, priorite, mes prises en charge).',
  })
  listNurseRequests(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryNurseRequestsDto,
  ) {
    return this.nurseRequests.findAll(user, query);
  }

  @Get('nurse-requests/:id')
  @Roles(...MEASURE_ROLES)
  @ApiOperation({
    summary: "Detail d'une demande de soin et son fil de messages.",
  })
  nurseRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.nurseRequests.findOne(user, id);
  }

  @Patch('nurse-requests/:id/accept')
  @Roles(...MANAGE_ROLES)
  @Audit(AuditAction.NURSE_REQUEST, 'NurseRequest')
  @ApiOperation({ summary: 'Prendre en charge une demande de soin.' })
  acceptNurseRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.nurseRequests.accept(user, id);
  }

  @Post('nurse-requests/:id/messages')
  @Roles(...MANAGE_ROLES, Role.CLIENT)
  @ApiOperation({ summary: 'Ajouter un message au fil de la demande.' })
  addNurseRequestMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: NurseRequestMessageDto,
  ) {
    return this.nurseRequests.addMessage(user, id, dto);
  }

  @Patch('nurse-requests/:id/complete')
  @Roles(...MANAGE_ROLES)
  @Audit(AuditAction.NURSE_REQUEST, 'NurseRequest')
  @ApiOperation({
    summary: 'Cloturer la demande avec conclusion et conseils.',
  })
  completeNurseRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteNurseRequestDto,
  ) {
    return this.nurseRequests.complete(user, id, dto);
  }

  @Patch('nurse-requests/:id/cancel')
  @Roles(...MANAGE_ROLES, Role.CLIENT, Role.OPERATOR, Role.SUPERVISOR)
  @Audit(AuditAction.NURSE_REQUEST, 'NurseRequest')
  @ApiOperation({
    summary: 'Annuler une demande de soin (demandeur ou personnel de sante).',
  })
  cancelNurseRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelNurseRequestDto,
  ) {
    return this.nurseRequests.cancel(user, id, dto);
  }

  // --- Indicateurs globaux ---------------------------------------------------

  @Get('stats')
  @Roles(...READ_ROLES)
  @ApiOperation({
    summary:
      'Synthese e-sante : mesures, valeurs critiques et demandes de soin.',
  })
  async globalStats(@CurrentUser() user: AuthenticatedUser) {
    const [measurements, nurseRequests] = await Promise.all([
      this.measurements.stats(user),
      this.nurseRequests.stats(user),
    ]);
    return { measurements, nurseRequests };
  }
}
