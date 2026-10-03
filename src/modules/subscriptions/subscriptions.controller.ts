import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Audit } from '@common/decorators/audit.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { Roles } from '@common/decorators/roles.decorator';
import { AuditAction } from '@common/enums/user.enum';
import { Role } from '@common/enums/role.enum';
import { AuthenticatedUser } from '@common/interfaces/authenticated-user.interface';
import {
  ActivateSubscriptionDto,
  QuerySubscriptionsDto,
  SubscriptionPaymentDto,
} from '@modules/subscriptions/dto/subscription.dto';
import { SubscriptionsService } from '@modules/subscriptions/subscriptions.service';

/** Encadrement habilite a encaisser un abonnement. */
const CASHIER_ROLES = [
  Role.SUPER_ADMIN,
  Role.NATIONAL_DIRECTOR,
  Role.TECHNICAL_DIRECTOR,
  Role.PLATFORM_MANAGER,
  Role.DAF,
  Role.ACCOUNTANT,
  Role.REGION_MANAGER,
  Role.AGENCY_MANAGER,
  Role.OPERATOR,
] as const;

/**
 * Abonnements et encaissements.
 *
 * Le client peut activer son propre code (`POST /subscriptions/activate`) et
 * consulter son etat (`GET /subscriptions/me`) ; le reste est reserve a
 * l'encadrement et a la caisse.
 */
@ApiTags('Abonnements')
@ApiBearerAuth()
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Post()
  @Roles(...CASHIER_ROLES)
  @Audit(AuditAction.CREATE, 'Subscription')
  @ApiOperation({
    summary:
      "Encaisser un abonnement : enregistre le paiement, emet un code ZG-XXXX-XXXX, etend la validite du client et lui envoie le code par SMS.",
  })
  issue(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SubscriptionPaymentDto & { clientId: string },
  ) {
    return this.subscriptions.issue(user, dto.clientId, dto);
  }

  @Post('activate')
  @ApiOperation({
    summary:
      "Activer un code d'abonnement (application client ou ecran central) : la duree du code est ajoutee a la validite en cours.",
  })
  activate(@CurrentUser() user: AuthenticatedUser, @Body() dto: ActivateSubscriptionDto) {
    return this.subscriptions.activate(user, dto);
  }

  @Get()
  @Roles(...CASHIER_ROLES, Role.SUPERVISOR)
  @ApiOperation({ summary: 'Abonnements du perimetre (filtres client, statut, echeance proche).' })
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: QuerySubscriptionsDto) {
    return this.subscriptions.findAll(user, query);
  }

  @Get('stats')
  @Roles(...CASHIER_ROLES)
  @ApiOperation({ summary: 'Indicateurs de caisse : revenus, moyens de paiement, clients actifs et expirants.' })
  stats(@CurrentUser() user: AuthenticatedUser, @Query('days') days?: string) {
    return this.subscriptions.stats(user, { days: days ? Number(days) : undefined });
  }

  @Get('clients/:clientId')
  @ApiOperation({ summary: "Etat d'abonnement d'un client et historique de ses codes." })
  forClient(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clientId', new ParseUUIDPipe()) clientId: string,
  ) {
    return this.subscriptions.forClient(user, clientId);
  }

  @Get(':id')
  @ApiOperation({ summary: "Detail d'un abonnement (periode, prix, activation, paiements)." })
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.subscriptions.findOne(user, id);
  }

  @Patch(':id/cancel')
  @Roles(...CASHIER_ROLES)
  @Audit(AuditAction.UPDATE, 'Subscription')
  @ApiOperation({ summary: "Annuler un code jamais active (erreur de saisie, remboursement)." })
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: { reason: string },
  ) {
    return this.subscriptions.cancel(user, id, body.reason);
  }

  @Post('maintenance/expire-due')
  @Roles(Role.SUPER_ADMIN, Role.TECHNICAL_DIRECTOR, Role.PLATFORM_MANAGER)
  @Audit(AuditAction.UPDATE, 'Subscription')
  @ApiOperation({
    summary:
      "Passer en revue les abonnements echus (meme traitement que le watchdog) : restriction d'acces et codes perimes.",
  })
  expireDue() {
    return this.subscriptions.expireDue();
  }
}
