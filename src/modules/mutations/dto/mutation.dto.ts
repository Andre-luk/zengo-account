import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  IntegrationHorizon,
  IntegrationOutcome,
  MutationReason,
  MutationStatus,
} from '@common/enums/mutation.enum';
import { PaginationQueryDto } from '@common/dto/pagination.dto';

export class CreateMutationDto {
  @ApiProperty({ description: "Agence qui reprend le dossier." })
  @IsUUID()
  toOrganizationId!: string;

  @ApiProperty({ enum: MutationReason, description: 'Motif declare de la mutation.' })
  @IsEnum(MutationReason)
  reason!: MutationReason;

  @ApiPropertyOptional({
    description:
      "Precisions utiles au controle qualite : nouvelle adresse, date du demenagement, contacts deja prevenus...",
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class ReviewMutationDto {
  @ApiProperty({ description: 'true : valider le transfert ; false : le refuser (motif obligatoire).' })
  @IsBoolean()
  @Type(() => Boolean)
  approve!: boolean;

  @ApiPropertyOptional({ description: 'Commentaire de decision, obligatoire en cas de refus.' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  comment?: string;
}

export class RevertMutationDto {
  @ApiProperty({ description: "Motif du retour vers l'agence d'origine." })
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  reason!: string;
}

export class ReportIntegrationDto {
  @ApiProperty({ enum: IntegrationHorizon, description: "Horizon du rapport d'integration." })
  @IsEnum(IntegrationHorizon)
  @Type(() => Number)
  horizon!: IntegrationHorizon;

  @ApiProperty({ enum: IntegrationOutcome, description: 'Conclusion du suivi.' })
  @IsEnum(IntegrationOutcome)
  outcome!: IntegrationOutcome;

  @ApiPropertyOptional({ description: 'Observations du chargé de suivi.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class QueryMutationsDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @ApiPropertyOptional({ enum: MutationStatus })
  @IsOptional()
  @IsEnum(MutationStatus)
  status?: MutationStatus;

  @ApiPropertyOptional({ enum: MutationReason })
  @IsOptional()
  @IsEnum(MutationReason)
  reason?: MutationReason;

  @ApiPropertyOptional({ description: 'Ne retourner que les demandes en cours d instruction.' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  openOnly?: boolean;

  @ApiPropertyOptional({ description: 'Recherche sur la reference ou le nom du client.' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  search?: string;
}
