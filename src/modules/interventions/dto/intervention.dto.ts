import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ToBoolean } from '@common/decorators/to-boolean.decorator';
import { PaginationQueryDto } from '@common/dto/pagination.dto';
import {
  InterventionAbortReason,
  InterventionOutcome,
  InterventionStatus,
} from '@common/enums/intervention.enum';

export class CreateInterventionDto {
  @ApiProperty({ description: 'Alerte a traiter.' })
  @IsUUID()
  alertId!: string;

  @ApiPropertyOptional({
    description:
      "Equipe designee. Si absent, le systeme engage l'equipe disponible la plus proche (specialite adaptee au type d'alerte).",
  })
  @IsOptional()
  @IsUUID()
  teamId?: string;

  @ApiPropertyOptional({ description: 'Affectation station a l origine de la mission.' })
  @IsOptional()
  @IsUUID()
  dispatchId?: string;

  @ApiPropertyOptional({ description: 'Consigne transmise a l equipe.' })
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  note?: string;
}

export class AdvanceInterventionDto {
  @ApiPropertyOptional({ description: 'Observation ajoutee au dossier de mission.' })
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  note?: string;
}

export class AbortInterventionDto {
  @ApiProperty({ enum: InterventionAbortReason })
  @IsEnum(InterventionAbortReason)
  reason!: InterventionAbortReason;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  note?: string;
}

export class CreateInterventionReportDto {
  @ApiProperty({ enum: InterventionOutcome })
  @IsEnum(InterventionOutcome)
  outcome!: InterventionOutcome;

  @ApiProperty({ description: 'Synthese de l intervention.' })
  @IsString()
  @MaxLength(2000)
  summary!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  actionsTaken?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  damages?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  peopleAssisted?: number;

  @ApiPropertyOptional({ type: [String], description: 'References des photos prises sur place.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(512, { each: true })
  photos?: string[];

  @ApiPropertyOptional({ description: 'Nom du signataire du bon de reception.' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  signatureName?: string;

  @ApiPropertyOptional({
    description:
      "Cloture l'alerte si elle est encore ouverte (le rapport devient le compte rendu officiel).",
    default: true,
  })
  @ToBoolean()
  @IsOptional()
  closeAlert?: boolean;

  @ApiPropertyOptional({ description: 'Le client a ete informe de la cloture.', default: false })
  @ToBoolean()
  @IsOptional()
  clientNotified?: boolean;
}

export class QueryInterventionsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: InterventionStatus })
  @IsOptional()
  @IsEnum(InterventionStatus)
  status?: InterventionStatus;

  @ApiPropertyOptional({ description: 'Ne conserver que les missions en cours.' })
  @ToBoolean()
  @IsOptional()
  openOnly?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  alertId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  teamId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  stationId?: string;

  @ApiPropertyOptional({ description: 'Filtre sur une agence / zone (descendants inclus).' })
  @IsOptional()
  @IsUUID()
  organizationId?: string;

  @ApiPropertyOptional({ description: 'Missions affectees a partir de cette date (ISO 8601).' })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ description: 'Missions affectees jusqu a cette date (ISO 8601).' })
  @IsOptional()
  @IsString()
  to?: string;
}
