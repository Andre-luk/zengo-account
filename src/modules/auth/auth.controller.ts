import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { Public } from '@common/decorators/public.decorator';
import { AuthenticatedUser } from '@common/interfaces/authenticated-user.interface';
import { extractIpAddress, extractUserAgent } from '@common/utils/request.util';
import { AuthService, AuthRequestContext } from '@modules/auth/auth.service';
import {
  DisableTwoFactorDto,
  EnableTwoFactorDto,
  LoginDto,
  RefreshTokenDto,
} from '@modules/auth/dto/auth.dto';

const buildContext = (request: Request): AuthRequestContext => ({
  ipAddress: extractIpAddress(request),
  userAgent: extractUserAgent(request),
});

@ApiTags('Authentification')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  // Garde-fou anti-DoS uniquement : la protection contre le bourrage d'identifiants
  // est assuree par le verrouillage du compte (5 echecs -> 15 min). Une limite trop
  // basse penaliserait un centre d'appel dont les operateurs partagent une meme IP.
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Connexion (email ou telephone + mot de passe, + code 2FA si active).',
  })
  login(@Body() dto: LoginDto, @Req() request: Request) {
    return this.authService.login(dto, buildContext(request));
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rafraichir le token d acces (rotation du refresh token).' })
  refresh(@Body() dto: RefreshTokenDto, @Req() request: Request) {
    return this.authService.refresh(dto, buildContext(request));
  }

  @ApiBearerAuth()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deconnecter la session courante.' })
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RefreshTokenDto,
    @Req() request: Request,
  ) {
    await this.authService.logout(user.id, dto, buildContext(request));
    return { success: true };
  }

  @ApiBearerAuth()
  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deconnecter toutes les sessions de l utilisateur.' })
  async logoutAll(@CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    await this.authService.logoutAll(user.id, buildContext(request));
    return { success: true };
  }

  @ApiBearerAuth()
  @Post('2fa/setup')
  @ApiOperation({ summary: 'Demarrer l activation de la double authentification (TOTP).' })
  beginTwoFactor(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.beginTwoFactorSetup(user.id);
  }

  @ApiBearerAuth()
  @Post('2fa/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirmer l activation de la double authentification.' })
  confirmTwoFactor(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: EnableTwoFactorDto,
    @Req() request: Request,
  ) {
    return this.authService.confirmTwoFactor(user.id, dto, buildContext(request));
  }

  @ApiBearerAuth()
  @Post('2fa/disable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Desactiver la double authentification.' })
  disableTwoFactor(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DisableTwoFactorDto,
    @Req() request: Request,
  ) {
    return this.authService.disableTwoFactor(user.id, dto, buildContext(request));
  }

  @ApiBearerAuth()
  @Get('session')
  @ApiOperation({ summary: 'Verifier la validite de la session courante.' })
  session(@CurrentUser() user: AuthenticatedUser) {
    return { user };
  }
}
