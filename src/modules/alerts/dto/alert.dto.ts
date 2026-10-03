import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ToBoolean } from '@common/decorators/to-boolean.decorator';
import { PaginationQueryDto } from '@common/dto/pagination.dto';
import {
  AlertResolution,
  AlertSeverity,
  AlertSource,
  AlertStatus,
  AlertType,
} from '@common/enums/alert.enum';

export class CreateManualAlertDto {
  @ApiProperty({ enum: AlertType, description: 'Nature de l alerte.' })
  @IsEnum(AlertType)
  type!: AlertType;

  @ApiPropertyOptional({
    description: 'Client concerne. Obligatoire pour un operateur, ignore pour un client.',
  })
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @ApiPropertyOptional({ enum: AlertSource })
  @IsOptional()
  @IsEnum(AlertSource)
  source?: AlertSource;

  @ApiPropertyOptional({ enum: AlertSeverity })
  @IsOptional()
  @IsEnum(AlertSeverity)
  severity?: AlertSeverity;

  @ApiPropertyOptional({ description: 'Commentaire libre (contexte, localisation precise...).' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiPropertyOptional({ description: 'Declencher l appel vocal IA (defaut : oui).' })
  @ToBoolean()
  @IsOptional()
  autoVoiceCall?: boolean;
}

export class DispatchAlertDto {
  @ApiPropertyOptional({
    type: [String],
    description:
      'Stations a alerter. Si vide, le systeme choisit automatiquement les stations adaptees (type d alerte puis agence).',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  stationIds?: string[];

  @ApiPropertyOptional({ description: 'Commentaire joint a la mission.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class EscalateAlertDto {
  @ApiPropertyOptional({ description: 'Motif de l escalade manuelle.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional({
    description: 'Escalader au niveau regional (au lieu de toutes les equipes du PDC).',
  })
  @ToBoolean()
  @IsOptional()
  regional?: boolean;
}

export class ResolveAlertDto {
  @ApiProperty({ enum: AlertResolution })
  @IsEnum(AlertResolution)
  resolution!: AlertResolution;

  @ApiPropertyOptional({ description: 'Compte rendu de cloture.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class AddAlertNoteDto {
  @ApiProperty()
  @IsString()
  @MaxLength(2000)
  note!: string;
}

export class AcknowledgeAlertDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class QueryAlertsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: AlertStatus, description: 'Filtre sur un statut precis.' })
  @IsOptional()
  @IsEnum(AlertStatus)
  status?: AlertStatus;

  @ApiPropertyOptional({ description: 'Ne conserver que les alertes encore ouvertes.' })
  @ToBoolean()
  @IsOptional()
  openOnly?: boolean;

  @ApiPropertyOptional({ enum: AlertType })
  @IsOptional()
  @IsEnum(AlertType)
  type?: AlertType;

  @ApiPropertyOptional({ enum: AlertSeverity })
  @IsOptional()
  @IsEnum(AlertSeverity)
  severity?: AlertSeverity;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  organizationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @ApiPropertyOptional({ description: 'Alertes provenant d un dispositif precis.' })
  @IsOptional()
  @IsUUID()
  deviceId?: string;

  @ApiPropertyOptional({ description: 'Declenchees a partir de cette date (ISO 8601).' })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ description: 'Declenchees jusqu a cette date (ISO 8601).' })
  @IsOptional()
  @IsString()
  to?: string;
}

export class UpdateDispatchStatusDto {
  @ApiProperty({ enum: ['ACKNOWLEDGED', 'DECLINED', 'ARRIVED', 'COMPLETED'] })
  @IsEnum(['ACKNOWLEDGED', 'DECLINED', 'ARRIVED', 'COMPLETED'] as const)
  status!: 'ACKNOWLEDGED' | 'DECLINED' | 'ARRIVED' | 'COMPLETED';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class SimulateCallInputDto {
  @ApiPropertyOptional({ description: 'Touche DTMF composee par le client (1 ou 2).' })
  @IsOptional()
  @IsString()
  @MaxLength(4)
  dtmf?: string;

  @ApiPropertyOptional({ description: 'Reponse vocale du client (simulation ASR).' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  speech?: string;
}

export class SimulateCallStatusDto {
  @ApiPropertyOptional({
    enum: ['ringing', 'in-progress', 'completed', 'no-answer', 'busy', 'failed'],
  })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  duration?: number;
}
