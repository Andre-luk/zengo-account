import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    description: 'Email ou numero de telephone du compte.',
    example: 'admin@zengo.cd',
  })
  @IsString()
  @MaxLength(160)
  identifier!: string;

  @ApiProperty({ example: 'MotDePasse1' })
  @IsString()
  @Length(1, 72)
  password!: string;

  @ApiPropertyOptional({ description: 'Code TOTP a 6 chiffres si la 2FA est active.' })
  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{6}$/, { message: 'Le code 2FA doit contenir 6 chiffres.' })
  totpCode?: string;
}

export class RefreshTokenDto {
  @ApiProperty({ description: 'Refresh token opaque renvoye lors de la connexion.' })
  @IsString()
  @Length(16, 512)
  refreshToken!: string;
}

export class EnableTwoFactorDto {
  @ApiProperty({ description: 'Code TOTP genere par l application d authentification.' })
  @IsString()
  @Matches(/^[0-9]{6}$/, { message: 'Le code 2FA doit contenir 6 chiffres.' })
  code!: string;
}

export class DisableTwoFactorDto {
  @ApiProperty()
  @IsString()
  @Length(1, 72)
  password!: string;
}

export class LoginResponseDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty()
  refreshToken!: string;

  @ApiProperty({ description: 'Duree de vie du token d acces, en secondes.' })
  expiresIn!: number;

  @ApiProperty({ example: 'Bearer' })
  tokenType!: string;

  @ApiProperty()
  user!: Record<string, unknown>;
}

export class ForgotPasswordDto {
  @ApiProperty({ description: 'Email du compte.' })
  @IsEmail()
  @MaxLength(160)
  email!: string;
}
