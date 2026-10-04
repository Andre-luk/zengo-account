import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '@common/dto/pagination.dto';
import {
  HealthConsentChannel,
  HealthConsentScope,
  HealthMeasurementSource,
  HealthMetric,
  HealthReadingStatus,
  NurseRequestPriority,
  NurseRequestStatus,
} from '@common/enums/health.enum';

export class RecordMeasurementDto {
  @ApiProperty({ description: 'Client concerne.' })
  @IsUUID()
  clientId!: string;

  @ApiProperty({ enum: HealthMetric })
  @IsEnum(HealthMetric)
  metric!: HealthMetric;

  @ApiProperty({
    description:
      'Valeur principale : systolique (mmHg), bpm, SpO2 (%), glycemie (mg/dL), temperature (°C) ou poids (kg).',
  })
  @Type(() => Number)
  @IsNumber()
  value!: number;

  @ApiPropertyOptional({
    description:
      'Valeur secondaire : diastolique pour la tension, taille en cm pour le poids.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  secondaryValue?: number;

  @ApiPropertyOptional({ description: 'Mesure realisee a jeun (glycemie).' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  fasting?: boolean;

  @ApiPropertyOptional({ description: 'Horodatage de la mesure (ISO 8601).' })
  @IsOptional()
  @IsISO8601()
  measuredAt?: string;

  @ApiPropertyOptional({ enum: HealthMeasurementSource, default: HealthMeasurementSource.MANUAL })
  @IsOptional()
  @IsEnum(HealthMeasurementSource)
  source?: HealthMeasurementSource;

  @ApiPropertyOptional({ description: 'Numero de serie du dispositif de mesure.' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  deviceSerial?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class QueryMeasurementsDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @ApiPropertyOptional({ enum: HealthMetric })
  @IsOptional()
  @IsEnum(HealthMetric)
  metric?: HealthMetric;

  @ApiPropertyOptional({ enum: HealthReadingStatus })
  @IsOptional()
  @IsEnum(HealthReadingStatus)
  status?: HealthReadingStatus;

  @ApiPropertyOptional({ description: 'Mesures a partir de cette date (ISO 8601).' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ description: 'Mesures jusqu a cette date (ISO 8601).' })
  @IsOptional()
  @IsISO8601()
  to?: string;

  @ApiPropertyOptional({ enum: HealthMeasurementSource })
  @IsOptional()
  @IsEnum(HealthMeasurementSource)
  source?: HealthMeasurementSource;

  @ApiPropertyOptional({ description: 'Ne retourner que les mesures critiques.' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  criticalOnly?: boolean;
}

export class GrantConsentDto {
  @ApiProperty({ enum: HealthConsentScope })
  @IsEnum(HealthConsentScope)
  scope!: HealthConsentScope;

  @ApiPropertyOptional({ enum: HealthConsentChannel, default: HealthConsentChannel.CLIENT_APP })
  @IsOptional()
  @IsEnum(HealthConsentChannel)
  channel?: HealthConsentChannel;

  @ApiPropertyOptional({
    description: 'Duree de validite en mois (par defaut 24, 0 = sans limite).',
    default: 24,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(120)
  months?: number;

  @ApiPropertyOptional({
    description: "Texte integral presente au client, conserve comme preuve.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  statement?: string;
}

export class RevokeConsentDto {
  @ApiProperty({ enum: HealthConsentScope })
  @IsEnum(HealthConsentScope)
  scope!: HealthConsentScope;

  @ApiProperty({ description: 'Motif du retrait (ex. choix du client).' })
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  reason!: string;
}

export class ExportHealthDataDto {
  @ApiProperty({ description: 'Motif de l export (tracabilite).' })
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  reason!: string;

  @ApiPropertyOptional({ description: 'Acces d urgence, sans consentement prealable.' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  emergency?: boolean;
}

export class CreateNurseRequestDto {
  @ApiProperty()
  @IsUUID()
  clientId!: string;

  @ApiProperty({ description: "Motif de l'appel (resume)." })
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  reason!: string;

  @ApiPropertyOptional({ description: 'Symptomes declares.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  symptoms?: string;

  @ApiPropertyOptional({ enum: NurseRequestPriority })
  @IsOptional()
  @IsEnum(NurseRequestPriority)
  priority?: NurseRequestPriority;

  @ApiPropertyOptional({
    description: 'Premier message ajoute au fil (facultatif).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;
}

export class NurseRequestMessageDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body!: string;
}

export class CompleteNurseRequestDto {
  @ApiProperty({ description: 'Conclusion de la prise en charge.' })
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  resolution!: string;

  @ApiPropertyOptional({ description: 'Conseils delivres au client.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  advice?: string;
}

export class CancelNurseRequestDto {
  @ApiProperty({ description: 'Motif d annulation.' })
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  reason!: string;
}

export class QueryNurseRequestsDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @ApiPropertyOptional({ enum: NurseRequestStatus })
  @IsOptional()
  @IsEnum(NurseRequestStatus)
  status?: NurseRequestStatus;

  @ApiPropertyOptional({ enum: NurseRequestPriority })
  @IsOptional()
  @IsEnum(NurseRequestPriority)
  priority?: NurseRequestPriority;

  @ApiPropertyOptional({ description: 'Ne retourner que les demandes non cloturees.' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  openOnly?: boolean;

  @ApiPropertyOptional({ description: 'Ne retourner que mes prises en charge.' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  mine?: boolean;
}
