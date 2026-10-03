import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ToBoolean } from '@common/decorators/to-boolean.decorator';
import { PaginationQueryDto } from '@common/dto/pagination.dto';
import { OfferPack } from '@common/enums/client.enum';

export class CreateTariffGroupDto {
  @ApiProperty({ example: 'PREMIUM_SMALL' })
  @IsString()
  @Length(2, 40)
  @Matches(/^[A-Za-z0-9_]+$/, { message: 'Le code ne peut contenir que des lettres, chiffres et underscores.' })
  code!: string;

  @ApiProperty({ example: 'Premium Pack Small - Petits commerces' })
  @IsString()
  @Length(2, 120)
  name!: string;

  @ApiProperty({ enum: OfferPack })
  @IsEnum(OfferPack)
  offerPack!: OfferPack;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ example: 350, description: 'Frais de souscription produit (kit), en USD.' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  registrationFeeUsd!: number;

  @ApiProperty({ example: 25, description: 'Abonnement mensuel, en USD.' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  monthlyFeeUsd!: number;

  @ApiPropertyOptional({ default: 1, description: 'Boutons SOS inclus dans le kit.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(50)
  includedSosButtons?: number;

  @ApiPropertyOptional({ default: 5, description: 'Prix unitaire d un bouton SOS supplementaire, en USD.' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  sosButtonUnitPriceUsd?: number;

  @ApiPropertyOptional({ default: 10, description: 'Nombre maximum de boutons SOS configurables.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  maxSosButtons?: number;

  @ApiPropertyOptional({ example: 2800, description: 'Taux de change USD -> CDF.' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  exchangeRateUsdToCdf?: number;

  @ApiPropertyOptional({ type: Object, description: 'Fonctionnalites incluses (libre).' })
  @IsOptional()
  @IsObject()
  features?: Record<string, unknown>;
}

export class UpdateTariffGroupDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(2, 120)
  name?: string;

  @ApiPropertyOptional({ enum: OfferPack })
  @IsOptional()
  @IsEnum(OfferPack)
  offerPack?: OfferPack;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  registrationFeeUsd?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  monthlyFeeUsd?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(50)
  includedSosButtons?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  sosButtonUnitPriceUsd?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  maxSosButtons?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  exchangeRateUsdToCdf?: number;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  features?: Record<string, unknown>;
}

export class UpdateExchangeRateDto {
  @ApiProperty({ example: 2850 })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  exchangeRateUsdToCdf!: number;
}

export class QueryTariffGroupsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: OfferPack })
  @IsOptional()
  @IsEnum(OfferPack)
  offerPack?: OfferPack;

  @ApiPropertyOptional({ description: 'Inclure les groupes archives.' })
  @ToBoolean()
  @IsOptional()
  includeArchived?: boolean;
}

export class PricePreviewDto {
  @ApiProperty({ description: 'Groupe tarifaire applique.' })
  @IsString()
  tariffGroupId!: string;

  @ApiPropertyOptional({ default: 1, description: 'Nombre total de boutons SOS.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  sosButtonCount?: number;
}

export class ArchiveTariffGroupDto {
  @ApiProperty({ default: true })
  @IsBoolean()
  archived!: boolean;
}
