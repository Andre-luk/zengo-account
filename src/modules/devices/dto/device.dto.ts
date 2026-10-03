import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '@common/dto/pagination.dto';
import { ToBoolean } from '@common/decorators/to-boolean.decorator';
import { Language } from '@common/enums/client.enum';
import { ArmMode, DeviceStatus, SubDeviceCode } from '@common/enums/device.enum';

export class CreateDeviceDto {
  @ApiProperty({ example: '3003004fba2394', description: 'Numero de serie (SN) du kit SafAlert.' })
  @IsString()
  @Length(4, 64)
  @Matches(/^[A-Za-z0-9]+$/, { message: 'Le numero de serie ne doit contenir que des caracteres alphanumeriques.' })
  serialNumber!: string;

  @ApiPropertyOptional({ default: 'SafAlert Solar G1' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  model?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  imei?: string;

  @ApiPropertyOptional({ description: 'Numero de la carte SIM Data M2M.' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  simNumber?: string;

  @ApiPropertyOptional({ description: 'Numero appele par la centrale pour les alertes automatiques.' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  alarmPhoneNumber?: string;

  @ApiPropertyOptional({ description: 'Agence proprietaire du parc.' })
  @IsOptional()
  @IsUUID()
  organizationId?: string;

  @ApiPropertyOptional({ enum: Language })
  @IsOptional()
  @IsEnum(Language)
  language?: Language;
}

export class UpdateDeviceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  model?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  imei?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  simNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  alarmPhoneNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  organizationId?: string;

  @ApiPropertyOptional({ enum: Language })
  @IsOptional()
  @IsEnum(Language)
  language?: Language;

  @ApiPropertyOptional({ description: 'Version de firmware cible pour une mise a jour OTA.' })
  @IsOptional()
  @IsInt()
  firmwareTargetVersion?: number;
}

export class UpdateDeviceStatusDto {
  @ApiProperty({ enum: DeviceStatus })
  @IsEnum(DeviceStatus)
  status!: DeviceStatus;
}

export class SetArmModeDto {
  @ApiProperty({
    enum: ArmMode,
    description: '0 = desarme, 1 = arme (away), 2 = arme partiel (stay).',
  })
  @IsEnum(ArmMode)
  mode!: ArmMode;

  @ApiPropertyOptional({ description: 'Si 6, il s agit d une synchronisation.' })
  @IsOptional()
  @IsInt()
  way?: number;
}

export class QueryDevicesDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: DeviceStatus })
  @IsOptional()
  @IsEnum(DeviceStatus)
  status?: DeviceStatus;

  @ApiPropertyOptional({ enum: ArmMode })
  @IsOptional()
  @IsEnum(ArmMode)
  armMode?: ArmMode;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  organizationId?: string;

  @ApiPropertyOptional({ description: 'Filtre sur le client detenteur.' })
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @ApiPropertyOptional({ description: 'Uniquement les dispositifs non rattaches a un client.' })
  @ToBoolean()
  @IsOptional()
  unassignedOnly?: boolean;
}

export class SubDeviceDto {
  @ApiProperty({ example: '00411400', description: 'Identifiant du sous-appareil (8 caracteres).' })
  @IsString()
  @Length(1, 8)
  id!: string;

  @ApiProperty({ example: 'Porte entree' })
  @IsString()
  @MaxLength(80)
  name!: string;

  @ApiPropertyOptional({ example: 'bedroom' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  areaName?: string;

  @ApiProperty({ enum: SubDeviceCode })
  @IsEnum(SubDeviceCode)
  code!: SubDeviceCode;
}

export class SyncSubDevicesDto {
  @ApiProperty({ type: [SubDeviceDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SubDeviceDto)
  subDevices!: SubDeviceDto[];
}
