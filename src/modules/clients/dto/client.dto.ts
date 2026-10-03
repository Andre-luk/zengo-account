import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ClientStatus, Currency, Language, OfferPack } from '@common/enums/client.enum';

export class CreateClientDto {
  @ApiProperty({ example: 'Jean Kabila' })
  @IsString()
  @Length(2, 160)
  fullName!: string;

  @ApiPropertyOptional({ description: 'Raison sociale (packs institutions / sur-mesure).' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  companyName?: string;

  @ApiProperty({ example: '+243970255599' })
  @IsString()
  @Matches(/^\+?[0-9]{7,20}$/, { message: 'Numero de telephone principal invalide.' })
  primaryPhone!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9]{7,20}$/, { message: 'Numero de telephone secondaire invalide.' })
  secondaryPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  emergencyContactName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9]{7,20}$/, { message: 'Numero du contact d urgence invalide.' })
  emergencyContactPhone?: string;

  @ApiPropertyOptional({ enum: Language, default: Language.FRENCH })
  @IsOptional()
  @IsEnum(Language)
  preferredLanguage?: Language;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  country?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsLongitude()
  longitude?: number;

  @ApiProperty({ description: 'Agence / point de distribution de rattachement.' })
  @IsUUID()
  organizationId!: string;

  @ApiPropertyOptional({ enum: OfferPack, default: OfferPack.STANDARD })
  @IsOptional()
  @IsEnum(OfferPack)
  offerPack?: OfferPack;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  tariffGroupId?: string;

  @ApiPropertyOptional({ enum: Currency, default: Currency.USD })
  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

  @ApiPropertyOptional({ description: 'Nombre de boutons SOS factures (1 inclus dans le kit).', default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  sosButtonCount?: number;

  @ApiPropertyOptional({
    description: 'Creer le compte de connexion (app mobile). Par defaut : true.',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  createUserAccount?: boolean;

  @ApiPropertyOptional({ description: 'Email de connexion du client (sinon le telephone est utilise).' })
  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  loginEmail?: string;

  @ApiPropertyOptional({ description: 'Mot de passe initial (sinon genere).' })
  @IsOptional()
  @IsString()
  @Length(8, 72)
  loginPassword?: string;

  @ApiPropertyOptional({ description: 'Numero de serie du dispositif deja provisionne a lier.' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  deviceSerialNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateClientDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(2, 160)
  fullName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  companyName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9]{7,20}$/, { message: 'Numero de telephone principal invalide.' })
  primaryPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9]{7,20}$/, { message: 'Numero de telephone secondaire invalide.' })
  secondaryPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  emergencyContactName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9]{7,20}$/, { message: 'Numero du contact d urgence invalide.' })
  emergencyContactPhone?: string;

  @ApiPropertyOptional({ enum: Language })
  @IsOptional()
  @IsEnum(Language)
  preferredLanguage?: Language;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  country?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsLongitude()
  longitude?: number;

  @ApiPropertyOptional({ enum: OfferPack })
  @IsOptional()
  @IsEnum(OfferPack)
  offerPack?: OfferPack;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  tariffGroupId?: string;

  @ApiPropertyOptional({ enum: Currency })
  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  sosButtonCount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateClientStatusDto {
  @ApiProperty({ enum: ClientStatus })
  @IsEnum(ClientStatus)
  status!: ClientStatus;
}

export class AssignDeviceDto {
  @ApiProperty({ description: 'Identifiant du dispositif a rattacher au client.' })
  @IsUUID()
  deviceId!: string;

  @ApiPropertyOptional({ description: 'Numero de serie, alternative a `deviceId`.' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  serialNumber?: string;
}
