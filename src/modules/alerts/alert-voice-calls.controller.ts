import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { Public } from '@common/decorators/public.decorator';
import { Roles } from '@common/decorators/roles.decorator';
import { Role } from '@common/enums/role.enum';
import { VoiceCallStatus } from '@common/enums/alert.enum';
import { AlertVoiceCallService } from '@modules/alerts/alert-voice-call.service';
import { SimulateCallInputDto, SimulateCallStatusDto } from '@modules/alerts/dto/alert.dto';
import { TELEPHONY_PROVIDER, TelephonyProvider } from '@modules/telephony/telephony.provider';
import { assertProviderWebhook } from '@modules/telephony/webhook-signature.util';

const SIMULATION_ROLES = [
  Role.SUPER_ADMIN,
  Role.TECHNICAL_DIRECTOR,
  Role.OPERATOR,
  Role.SUPERVISOR,
  Role.NATIONAL_DIRECTOR,
] as const;

/** L'enregistrement d'un appel d'alerte est une donnee sensible : encadrement et ZMC. */
const RECORDING_ROLES = [
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
 * Point d'entree vocal cote API.
 *
 * - `GET  /voice-calls/twiml/:id`        : TwiML joue a la decroche (appele par Twilio).
 * - `POST /voice-calls/twiml/:id/answer` : saisie du client + TwiML de cloture (action du <Gather>).
 * - `POST /voice-calls/:id/simulate/*`   : pilotage du fournisseur STUB (developpement et tests).
 */
@ApiTags('Téléphonie')
@Controller('voice-calls')
export class AlertVoiceCallsController {
  constructor(
    private readonly alertVoiceCall: AlertVoiceCallService,
    @Inject(TELEPHONY_PROVIDER) private readonly telephonyProvider: TelephonyProvider,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get('twiml/:voiceCallId')
  @ApiExcludeEndpoint()
  async questionTwiMl(
    @Param('voiceCallId', new ParseUUIDPipe()) voiceCallId: string,
    @Req() request: Request,
    @Headers('x-twilio-signature') signature?: string,
  ): Promise<string> {
    assertProviderWebhook(
      this.telephonyProvider,
      this.configService,
      request,
      signature,
      `/voice-calls/twiml/${voiceCallId}`,
    );
    return this.alertVoiceCall.buildQuestionTwiMl(voiceCallId);
  }

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post('twiml/:voiceCallId/answer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reponse du client a l appel vocal (DTMF ou reconnaissance vocale).' })
  async answer(
    @Param('voiceCallId', new ParseUUIDPipe()) voiceCallId: string,
    @Body() body: Record<string, unknown>,
    @Req() request: Request,
    @Headers('x-twilio-signature') signature?: string,
  ): Promise<string> {
    assertProviderWebhook(
      this.telephonyProvider,
      this.configService,
      request,
      signature,
      `/voice-calls/twiml/${voiceCallId}/answer`,
    );

    const digits = body.Digits ?? body.dtmf;
    const speech = body.SpeechResult ?? body.speech;

    await this.alertVoiceCall.submitClientInput(voiceCallId, {
      dtmf: digits === undefined || digits === null ? null : String(digits),
      speech: typeof speech === 'string' ? speech : null,
      providerCallId: typeof body.CallSid === 'string' ? body.CallSid : null,
    });

    return this.alertVoiceCall.buildClosingTwiMl(voiceCallId);
  }

  @ApiBearerAuth()
  @Get(':voiceCallId/recording')
  @Roles(...RECORDING_ROLES)
  @ApiOperation({
    summary: "Relire l'enregistrement de l'appel (relais authentifie vers le fournisseur).",
  })
  async recording(
    @Param('voiceCallId', new ParseUUIDPipe()) voiceCallId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const { body, contentType } = await this.alertVoiceCall.fetchRecording(voiceCallId);
    response.setHeader('Content-Type', contentType);
    response.setHeader('Cache-Control', 'private, max-age=300');
    return new StreamableFile(body);
  }

  @ApiBearerAuth()
  @Post(':voiceCallId/simulate/input')
  @Roles(...SIMULATION_ROLES)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Simuler la reponse du client (fournisseur STUB uniquement, developpement et tests).',
  })
  async simulateInput(
    @Param('voiceCallId', new ParseUUIDPipe()) voiceCallId: string,
    @Body() dto: SimulateCallInputDto,
  ) {
    this.assertStubProvider();
    const voiceCall = await this.alertVoiceCall.submitClientInput(voiceCallId, {
      dtmf: dto.dtmf ?? null,
      speech: dto.speech ?? null,
    });
    return { voiceCall };
  }

  @ApiBearerAuth()
  @Post(':voiceCallId/simulate/status')
  @Roles(...SIMULATION_ROLES)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Simuler un changement de statut d appel (fournisseur STUB uniquement).',
  })
  async simulateStatus(
    @Param('voiceCallId', new ParseUUIDPipe()) voiceCallId: string,
    @Body() dto: SimulateCallStatusDto,
  ) {
    this.assertStubProvider();
    const status = this.mapSimulatedStatus(dto.status);
    const voiceCall = await this.alertVoiceCall.applyCallStatusById(voiceCallId, status, dto.duration ?? null);
    return { voiceCall };
  }

  private assertStubProvider(): void {
    if (this.telephonyProvider.name !== 'STUB') {
      throw new ForbiddenException({
        message: 'La simulation est reservee au fournisseur STUB.',
        code: 'SIMULATION_NOT_AVAILABLE',
      });
    }
  }

  private mapSimulatedStatus(raw?: string): VoiceCallStatus {
    switch ((raw ?? 'completed').toLowerCase()) {
      case 'ringing':
        return VoiceCallStatus.RINGING;
      case 'in-progress':
      case 'in_progress':
        return VoiceCallStatus.IN_PROGRESS;
      case 'no-answer':
      case 'noanswer':
        return VoiceCallStatus.NO_ANSWER;
      case 'busy':
        return VoiceCallStatus.BUSY;
      case 'failed':
        return VoiceCallStatus.FAILED;
      case 'completed':
      default:
        return VoiceCallStatus.COMPLETED;
    }
  }
}
