import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Audit } from '@common/decorators/audit.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { Roles } from '@common/decorators/roles.decorator';
import { Role } from '@common/enums/role.enum';
import { AuditAction } from '@common/enums/user.enum';
import { AuthenticatedUser } from '@common/interfaces/authenticated-user.interface';
import { ClientMutationsService } from '@modules/mutations/client-mutations.service';
import {
  CreateMutationDto,
  QueryMutationsDto,
  ReportIntegrationDto,
  ReviewMutationDto,
  RevertMutationDto,
} from '@modules/mutations/dto/mutation.dto';

/** Profils autorises a deposer une demande de mutation. */
const REQUEST_ROLES = [
  Role.SUPER_ADMIN,
  Role.NATIONAL_DIRECTOR,
  Role.TECHNICAL_DIRECTOR,
  Role.PLATFORM_MANAGER,
  Role.QUALITY_DIRECTOR,
  Role.REGION_MANAGER,
  Role.AGENCY_MANAGER,
  Role.OPERATOR,
  Role.SUPERVISOR,
] as const;

/** Seconde validation : le controle qualite, ou une direction. */
const REVIEW_ROLES = [
  Role.QUALITY_DIRECTOR,
  Role.NATIONAL_DIRECTOR,
  Role.TECHNICAL_DIRECTOR,
  Role.SUPER_ADMIN,
] as const;

/** Application du transfert et retour a l'agence d'origine. */
const APPLY_ROLES = [
  Role.SUPER_ADMIN,
  Role.NATIONAL_DIRECTOR,
  Role.TECHNICAL_DIRECTOR,
  Role.PLATFORM_MANAGER,
  Role.QUALITY_DIRECTOR,
  Role.REGION_MANAGER,
  Role.AGENCY_MANAGER,
] as const;

/**
 * Mutations geographiques des dossiers clients.
 *
 * Ordre des routes : les chemins litteraux (`stats`, `pending-reports`) sont
 * declares avant `/:id`, sinon ils seraient interpretes comme un identifiant.
 */
@ApiTags('Mutations')
@ApiBearerAuth()
@Controller('client-mutations')
export class ClientMutationsController {
  constructor(private readonly mutations: ClientMutationsService) {}

  @Post()
  @Roles(...REQUEST_ROLES)
  @Audit(AuditAction.CLIENT_MUTATION, 'ClientMutation')
  @ApiOperation({
    summary:
      "Demander le transfert d'un dossier vers une autre agence : la demande part au controle qualite pour la seconde validation.",
  })
  request(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateMutationDto & { clientId: string },
  ) {
    return this.mutations.request(user, dto.clientId, dto);
  }

  @Get()
  @Roles(...REQUEST_ROLES)
  @ApiOperation({
    summary: 'Demandes du perimetre (filtres statut, motif, demandes en cours, recherche).',
  })
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryMutationsDto) {
    return this.mutations.findAll(user, query);
  }

  @Get('stats')
  @Roles(...REVIEW_ROLES, Role.REGION_MANAGER, Role.PLATFORM_MANAGER)
  @ApiOperation({
    summary:
      "Indicateurs du controle qualite : volumes par statut et motif, delai moyen d'instruction, rapports d'integration attendus.",
  })
  stats(@CurrentUser() user: AuthenticatedUser, @Query('days') days?: string) {
    return this.mutations.stats(user, { days: days ? Number(days) : undefined });
  }

  @Get('pending-reports')
  @Roles(...APPLY_ROLES, Role.SUPERVISOR)
  @ApiOperation({
    summary:
      "Mutations appliquees dont le rapport d'integration a 7 ou 30 jours est attendu (avec son retard eventuel).",
  })
  pendingReports(@CurrentUser() user: AuthenticatedUser) {
    return this.mutations.findPendingIntegrationReports();
  }

  @Get('clients/:clientId')
  @Roles(...REQUEST_ROLES)
  @ApiOperation({
    summary:
      "Historique des mutations d'un dossier : agence actuelle, agence d'origine et rapports d'integration attendus.",
  })
  forClient(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clientId', new ParseUUIDPipe()) clientId: string,
  ) {
    return this.mutations.forClient(user, clientId);
  }

  @Get(':id')
  @Roles(...REQUEST_ROLES)
  @ApiOperation({ summary: "Detail d'une demande : double validation, transfert, suivi d'integration." })
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.mutations.findOne(user, id);
  }

  @Patch(':id/cancel')
  @Roles(...REQUEST_ROLES)
  @Audit(AuditAction.CLIENT_MUTATION, 'ClientMutation')
  @ApiOperation({
    summary: "Retirer une demande avant application (client qui reste finalement, erreur de saisie).",
  })
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: RevertMutationDto,
  ) {
    return this.mutations.cancel(user, id, dto.reason);
  }

  @Patch(':id/review')
  @Roles(...REVIEW_ROLES)
  @Audit(AuditAction.UPDATE, 'ClientMutation')
  @ApiOperation({
    summary:
      'Instruction par le controle qualite : valider ou refuser. Le demandeur ne peut pas valider sa propre demande.',
  })
  review(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReviewMutationDto,
  ) {
    return this.mutations.review(user, id, dto);
  }

  @Patch(':id/apply')
  @Roles(...APPLY_ROLES)
  @Audit(AuditAction.CLIENT_MUTATION, 'ClientMutation')
  @ApiOperation({
    summary:
      "Appliquer le transfert : client, equipements et alertes en cours rejoignent l'agence de destination, et le client est informe par SMS.",
  })
  apply(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.mutations.apply(user, id);
  }

  @Patch(':id/revert')
  @Roles(...APPLY_ROLES, Role.QUALITY_DIRECTOR)
  @Audit(AuditAction.CLIENT_MUTATION, 'ClientMutation')
  @ApiOperation({ summary: "Retour du dossier vers son agence d'origine, avec motif obligatoire." })
  revert(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: RevertMutationDto,
  ) {
    return this.mutations.revert(user, id, dto.reason);
  }

  @Post(':id/integration-report')
  @Roles(...APPLY_ROLES)
  @Audit(AuditAction.UPDATE, 'ClientMutation')
  @ApiOperation({
    summary: "Saisir le rapport d'integration a 7 ou 30 jours apres le transfert.",
  })
  reportIntegration(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReportIntegrationDto,
  ) {
    return this.mutations.reportIntegration(user, id, dto);
  }
}
