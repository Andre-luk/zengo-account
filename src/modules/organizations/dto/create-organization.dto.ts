import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsLatitude,
  IsLongitude,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { OrganizationType, StationType } from '@common/enums/organization.enum';

export class CreateOrganizationDto {
  @ApiProperty({ example: 'Zone Regionale Kinshasa' })
  @IsString()
  @Length(2, 160)
  name!: string;

  @ApiProperty({ example: 'KIN', description: 'Code court unique (majuscules, chiffres, tirets).' })
  @IsString()
  @Length(2, 32)
  @Matches(/^[A-Za-z0-9-]+$/, { message: 'Le code ne peut contenir que des lettres, chiffres et tirets.' })
  code!: string;

  @ApiProperty({ enum: OrganizationType })
  @IsEnum(OrganizationType)
  type!: OrganizationType;

  @ApiPropertyOptional({ enum: StationType, description: 'Obligatoire pour une organisation de type STATION.' })
  @ValidateIf((dto: CreateOrganizationDto) => dto.type === OrganizationType.STATION)
  @IsEnum(StationType)
  stationType?: StationType;

  @ApiPropertyOptional({ description: 'Organisation parente (obligatoire sauf pour le niveau NATIONAL).' })
  @IsOptional()
  @IsUUID()
  parentId?: string;

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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  contactPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  contactEmail?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
