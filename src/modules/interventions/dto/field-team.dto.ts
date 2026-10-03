import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ToBoolean } from '@common/decorators/to-boolean.decorator';
import { PaginationQueryDto } from '@common/dto/pagination.dto';
import { FieldTeamStatus, TeamPositionSource } from '@common/enums/intervention.enum';
import { StationType } from '@common/enums/organization.enum';

export class CreateFieldTeamDto {
  @ApiProperty({ example: 'Equipe Alpha' })
  @IsString()
  @Length(2, 120)
  name!: string;

  @ApiPropertyOptional({ example: 'ALPHA' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  code?: string;

  @ApiProperty({ description: 'Station de rattachement (chambre de secours).' })
  @IsUUID()
  stationId!: string;

  @ApiProperty({ enum: StationType })
  @IsEnum(StationType)
  speciality!: StationType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  leaderName?: string;

  @ApiPropertyOptional({ example: '+243970255599' })
  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9]{7,20}$/, { message: 'Numero de telephone invalide.' })
  leaderPhone?: string;

  @ApiPropertyOptional({ default: 2 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  membersCount?: number;

  @ApiPropertyOptional({ example: 'KIN-1234' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  vehiclePlate?: string;

  @ApiPropertyOptional({ description: 'Position initiale (base de la station).' })
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
  @MaxLength(512)
  notes?: string;
}

export class UpdateFieldTeamDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(2, 120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  code?: string;

  @ApiPropertyOptional({ enum: StationType })
  @IsOptional()
  @IsEnum(StationType)
  speciality?: StationType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  leaderName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9]{7,20}$/, { message: 'Numero de telephone invalide.' })
  leaderPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  membersCount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  vehiclePlate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  notes?: string;
}

export class UpdateFieldTeamStatusDto {
  @ApiProperty({ enum: FieldTeamStatus })
  @IsEnum(FieldTeamStatus)
  status!: FieldTeamStatus;

  @ApiPropertyOptional({ description: 'Motif (maintenance, effectif incomplet...).' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;
}

export class TeamPositionDto {
  @ApiProperty()
  @IsLatitude()
  latitude!: number;

  @ApiProperty()
  @IsLongitude()
  longitude!: number;

  @ApiPropertyOptional({ description: 'Precision GPS annoncee, en metres.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000)
  accuracyMeters?: number;

  @ApiPropertyOptional({ description: 'Vitesse instantanee, en km/h.' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  @Max(300)
  speedKmh?: number;

  @ApiPropertyOptional({ description: 'Cap en degres (0 = nord).' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(359)
  headingDegrees?: number;

  @ApiPropertyOptional({ enum: TeamPositionSource, default: TeamPositionSource.APP })
  @IsOptional()
  @IsEnum(TeamPositionSource)
  source?: TeamPositionSource;

  @ApiPropertyOptional({
    description:
      "Mission a laquelle rattacher le releve. Laisser vide pendant une mission : le releve est rattache automatiquement a la mission en cours de l'equipe.",
  })
  @IsOptional()
  @IsUUID()
  interventionId?: string;
}

export class QueryFieldTeamsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: FieldTeamStatus })
  @IsOptional()
  @IsEnum(FieldTeamStatus)
  status?: FieldTeamStatus;

  @ApiPropertyOptional({ enum: StationType })
  @IsOptional()
  @IsEnum(StationType)
  speciality?: StationType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  stationId?: string;

  @ApiPropertyOptional({ description: 'Filtre sur une agence / zone (descendants inclus).' })
  @IsOptional()
  @IsUUID()
  organizationId?: string;

  @ApiPropertyOptional({ description: 'Ne conserver que les equipes disponibles.' })
  @ToBoolean()
  @IsOptional()
  availableOnly?: boolean;

  @ApiPropertyOptional({ description: 'Ne conserver que les equipes dont la position est recente.' })
  @ToBoolean()
  @IsOptional()
  withPositionOnly?: boolean;

  @ApiPropertyOptional({ description: 'Trier par distance croissante a ce point.' })
  @IsOptional()
  @IsLatitude()
  nearLatitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsLongitude()
  nearLongitude?: number;
}
