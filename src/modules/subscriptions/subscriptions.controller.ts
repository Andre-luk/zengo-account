import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Audit } from '@common/decorators/audit.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { Public } from '@common/decorators/public.decorator';
import { Roles } from '@common/decorators/roles.decorator';
import { AuditAction } from '@common/enums/user.enum';
import { Role } from '@common/enums/role.enum';
import { AuthenticatedUser } from '@common/interfaces/authenticated-user.interface';
import {
  ActivateSubscriptionDto,
  QueryPaymentsDto,
  QuerySubscriptionsDto,
  ReconcilePaymentDto,
  SubscriptionPaymentDto,
} from '@modules/subscriptions/dto/subscription.dto';
import { providerFor } from '@modules/subscriptions/providers/mobile-money.provider';
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
  constructor(
    private readonly subscriptions: SubscriptionsService,
    private readonly configService: ConfigService,
  ) {}

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

  // ---------------------------------------------------------------------------
  // Caisse virtuelle : journal, rapprochement et webhooks operateurs
  // ---------------------------------------------------------------------------

  @Get('payments')
  @Roles(...CASHIER_ROLES, Role.SUPERVISOR)
  @ApiOperation({ summary: 'Journal des encaissements (filtres statut, moyen de paiement, periode).' })
  listPayments(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryPaymentsDto) {
    return this.subscriptions.listPayments(user, query);
  }

  @Get('payments/reconciliation')
  @Roles(...CASHIER_ROLES)
  @ApiOperation({
    summary:
      'Rapprochement de caisse : totaux par operateur et par jour, paiements confirmes et paiements en attente de rattachement.',
  })
  reconciliation(@CurrentUser() user: AuthenticatedUser, @Query('days') days?: string) {
    return this.subscriptions.reconciliation(user, { days: days ? Number(days) : undefined });
  }

  @Post('payments/:id/reconcile')
  @Roles(...CASHIER_ROLES)
  @Audit(AuditAction.UPDATE, 'Payment')
  @ApiOperation({
    summary:
      "Rattacher un paiement en attente a un client et encaisser l'abonnement correspondant (numero payeur non reconnu par l'operateur).",
  })
  reconcile(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: ReconcilePaymentDto,
  ) {
    return this.subscriptions.reconcilePayment(user, id, body);
  }

  @Public()
  @Throttle({ default: { limit: 240, ttl: 60_000 } })
  @Post('payments/webhooks/:operator')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      "Accuse de paiement Mobile Money (M-Pesa, Airtel Money, Orange Money, Illicocash) : confirme l'abonnement ou met le paiement en attente de rapprochement.",
  })
  async mobileMoneyWebhook(
    @Param('operator') operator: string,
    @Body() body: Record<string, unknown>,
    @Headers('x-operator-signature') signature?: string,
  ) {
    const provider = providerFor(operator);
    if (!provider) {
      return { accepted: false, reason: 'unknown_operator' };
    }

    if (!this.isWebhookAuthentic(operator, signature)) {
      return { accepted: false, reason: 'invalid_signature' };
    }

    const notification = provider.parse(body);
    if (!notification) {
      return { accepted: false, reason: 'unparsable_payload' };
    }

    const result = await this.subscriptions.handleMobileMoneyNotification(notification);
    return { accepted: true, ...result };
  }

  /**
   * Detail d'un code. Declare en dernier : cette route a un seul segment, elle
   * capterait sinon les chemins litteraux (`/payments`, `/stats`...).
   */
  @Get(':id')
  @ApiOperation({ summary: "Detail d'un abonnement (periode, prix, activation, paiements)." })
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.subscriptions.findOne(user, id);
  }

  /**
   * Un webhook operateur n'est traite que s'il porte le secret partage, lorsque
   * celui-ci est configure (`MOBILE_MONEY_WEBHOOK_SECRET`). Sans secret, on
   * accepte la notification mais la ligne reste en attente de rapprochement :
   * une URL publique ne doit jamais permettre d'activer un abonnement seule.
   */
  private isWebhookAuthentic(operator: string, signature?: string): boolean {
    const secret = this.configService.get<string>('app.billing.mobileMoneyWebhookSecret');
    if (!secret) return true;
    if (!signature) return false;

    const expected = createHmac('sha256', secret).update(operator).digest('hex');
    const provided = signature.trim().toLowerCase();
    if (provided.length !== expected.length) return false;
    return timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
  }
}
