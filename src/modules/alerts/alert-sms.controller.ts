import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Audit } from '@common/decorators/audit.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { Public } from '@common/decorators/public.decorator';
import { Roles } from '@common/decorators/roles.decorator';
import { AuditAction } from '@common/enums/user.enum';
import { Role } from '@common/enums/role.enum';
import { AuthenticatedUser } from '@common/interfaces/authenticated-user.interface';
import { AlertSmsService } from '@modules/alerts/alert-sms.service';
import { AlertsService } from '@modules/alerts/alerts.service';
import { SendCustomSmsDto } from '@modules/alerts/dto/alert.dto';
import { SMS_PROVIDER, SmsProvider } from '@modules/telephony/sms.provider';

/** Encadrement habilite a ecrire au client depuis la console. */
const SMS_ROLES = [
  Role.SUPER_ADMIN,
  Role.NATIONAL_DIRECTOR,
  Role.TECHNICAL_DIRECTOR,
  Role.PLATFORM_MANAGER,
  Role.REGION_MANAGER,
  Role.AGENCY_MANAGER,
  Role.OPERATOR,
  Role.SUPERVISOR,
] as const;

/**
 * Canal SMS cote API.
 *
 * - `GET  /alerts/:id/sms`      : historique des messages du dossier ;
 * - `POST /alerts/:id/sms`      : message libre redige par le superviseur ;
 * - `POST /sms/:id/resend`      : renvoi d'un message existant ;
 * - `GET  /sms/stats`           : indicateurs du canal ;
 * - `POST /sms/webhooks/:provider/status` : accuses de remise du fournisseur.
 */
@ApiTags('SMS')
@Controller()
export class AlertSmsController {
  constructor(
    private readonly alertSms: AlertSmsService,
    private readonly alertsService: AlertsService,
    @Inject(SMS_PROVIDER) private readonly smsProvider: SmsProvider,
  ) {}

  @ApiBearerAuth()
  @Get('alerts/:alertId/sms')
  @ApiOperation({ summary: 'Historique des SMS rattaches au dossier (avec le corps envoye).' })
  async listByAlert(
    @CurrentUser() user: AuthenticatedUser,
    @Param('alertId', new ParseUUIDPipe()) alertId: string,
  ) {
    // La lecture passe par AlertsService : le perimetre de l'utilisateur est
    // verifie avant de devoiler le contenu des messages.
    await this.alertsService.findOne(user, alertId);
    return { items: await this.alertSms.listByAlert(alertId) };
  }

  @ApiBearerAuth()
  @Post('alerts/:alertId/sms')
  @Roles(...SMS_ROLES)
  @Audit(AuditAction.CREATE, 'SmsMessage')
  @ApiOperation({ summary: 'Ecrire un SMS libre au client du dossier.' })
  async sendCustom(
    @CurrentUser() user: AuthenticatedUser,
    @Param('alertId', new ParseUUIDPipe()) alertId: string,
    @Body() dto: SendCustomSmsDto,
  ) {
    const alert = await this.alertsService.findOne(user, alertId);
    const message = await this.alertSms.sendCustom(alert, dto.clientId ?? null, dto.body);
    return { message };
  }

  @ApiBearerAuth()
  @Post('sms/:id/resend')
  @Roles(...SMS_ROLES)
  @Audit(AuditAction.CREATE, 'SmsMessage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Renvoyer un message (le message d'origine est conserve)." })
  async resend(@Param('id', new ParseUUIDPipe()) id: string) {
    return { message: await this.alertSms.resend(id) };
  }

  @ApiBearerAuth()
  @Get('sms/stats')
  @ApiOperation({ summary: 'Indicateurs du canal SMS (volumes, taux de remise, segments).' })
  stats() {
    return this.alertSms.stats();
  }

  @Public()
  @Throttle({ default: { limit: 240, ttl: 60_000 } })
  @Post('sms/webhooks/:provider/status')
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  @ApiOperation({ summary: 'Accuse de remise du fournisseur SMS.' })
  async deliveryReport(
    @Param('provider') providerName: string,
    @Body() body: Record<string, unknown>,
  ) {
    if (providerName.toLowerCase() !== this.smsProvider.name.toLowerCase()) {
      return { accepted: false, reason: 'unknown_provider' };
    }

    const report = this.smsProvider.parseDeliveryReport(body);
    if (!report) return { accepted: false, reason: 'unparsable_report' };

    const message = await this.alertSms.applyDeliveryReport(report.providerMessageId, {
      status: report.status,
      errorCode: report.errorCode ?? null,
      errorMessage: report.errorMessage ?? null,
      costUsd: report.costUsd ?? null,
    });

    return { accepted: Boolean(message), status: report.status };
  }
}
