import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { TelephonyEventBus } from '@common/bus/telephony-event.bus';
import { Public } from '@common/decorators/public.decorator';
import { TELEPHONY_PROVIDER, TelephonyProvider } from '@modules/telephony/telephony.provider';
import { assertProviderWebhook } from '@modules/telephony/webhook-signature.util';

/**
 * Webhooks generiques des fournisseurs de telephonie.
 *
 * Twilio utilise plutot `/voice-calls/twiml/...` (qui doit repondre du TwiML) ;
 * ces routes servent aux fournisseurs a callback simple et a l'implementation
 * de test pilotee depuis les scripts de verification.
 */
@ApiTags('Téléphonie')
@ApiExcludeController()
@Controller('voice-calls/webhooks')
export class VoiceWebhooksController {
  constructor(
    @Inject(TELEPHONY_PROVIDER) private readonly provider: TelephonyProvider,
    private readonly telephonyEventBus: TelephonyEventBus,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Post(':provider/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Callback de statut d appel (ringing, answered, completed...).' })
  status(
    @Param('provider') providerName: string,
    @Body() body: Record<string, unknown>,
    @Query() query: Record<string, unknown>,
    @Req() request: Request,
    @Headers('x-twilio-signature') signature?: string,
  ) {
    return this.handle(providerName, 'status', body, query, request, signature);
  }

  @Public()
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Post(':provider/input')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Saisie du client pendant l appel (touche DTMF ou reponse vocale).' })
  input(
    @Param('provider') providerName: string,
    @Body() body: Record<string, unknown>,
    @Query() query: Record<string, unknown>,
    @Req() request: Request,
    @Headers('x-twilio-signature') signature?: string,
  ) {
    return this.handle(providerName, 'input', body, query, request, signature);
  }

  private handle(
    providerName: string,
    kind: 'status' | 'input',
    body: Record<string, unknown>,
    query: Record<string, unknown>,
    request: Request,
    signature: string | undefined,
  ) {
    assertProviderWebhook(
      this.provider,
      this.configService,
      request,
      signature,
      `/voice-calls/webhooks/${providerName}/${kind}`,
    );

    const event = this.provider.parseWebhook(kind, body, query);
    if (!event) return { received: false };

    this.telephonyEventBus.publish(event);
    return { received: true };
  }
}
