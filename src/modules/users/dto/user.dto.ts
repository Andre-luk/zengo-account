import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Language } from '@common/enums/client.enum';
import { Role } from '@common/enums/role.enum';
import { UserStatus } from '@common/enums/user.enum';
import { PaginationQueryDto } from '@common/dto/pagination.dto';

export class MembershipDto {
  @ApiProperty()
  @IsUUID()
  organizationId!: string;

  @ApiProperty({ enum: Role })
  @IsEnum(Role)
  role!: Role;

  @ApiPropertyOptional({ default: false, description: 'Rattachement principal.' })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

export class CreateUserDto {
  @ApiPropertyOptional({ example: 'agent@zengo.cd' })
  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  email?: string;

  @ApiPropertyOptional({ example: '+243970000000' })
  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9]{7,20}$/, { message: 'Numero de telephone invalide.' })
  phone?: string;

  @ApiProperty()
  @IsString()
  @Length(1, 80)
  firstName!: string;

  @ApiProperty()
  @IsString()
  @Length(1, 80)
  lastName!: string;

  @ApiPropertyOptional({
    description:
      'Mot de passe initial. Si omis, un mot de passe temporaire est genere et renvoye dans la reponse.',
  })
  @IsOptional()
  @IsString()
  @Length(8, 72)
  password?: string;

  @ApiPropertyOptional({ enum: Language, default: Language.FRENCH })
  @IsOptional()
  @IsEnum(Language)
  preferredLanguage?: Language;

  @ApiPropertyOptional({ enum: UserStatus, default: UserStatus.ACTIVE })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @ApiPropertyOptional({ type: [MembershipDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MembershipDto)
  memberships?: MembershipDto[];
}

export class UpdateUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9]{7,20}$/, { message: 'Numero de telephone invalide.' })
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 80)
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 80)
  lastName?: string;

  @ApiPropertyOptional({ enum: Language })
  @IsOptional()
  @IsEnum(Language)
  preferredLanguage?: Language;
}

export class UpdateUserStatusDto {
  @ApiProperty({ enum: UserStatus })
  @IsEnum(UserStatus)
  status!: UserStatus;
}

export class ResetPasswordDto {
  @ApiPropertyOptional({ description: 'Nouveau mot de passe. Si omis, un temporaire est genere.' })
  @IsOptional()
  @IsString()
  @Length(8, 72)
  password?: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  currentPassword!: string;

  @ApiProperty()
  @IsString()
  @Length(8, 72)
  newPassword!: string;
}

export class AddMembershipDto extends MembershipDto {}

export class AssignRoleDto {
  @ApiProperty({ enum: Role })
  @IsEnum(Role)
  role!: Role;

  @ApiProperty()
  @IsUUID()
  organizationId!: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

export class CreateUserResponseDto {
  @ApiProperty()
  user!: CreateUserDto;

  @ApiPropertyOptional({ description: 'Mot de passe temporaire, retourne une seule fois.' })
  temporaryPassword?: string;
}

export class QueryUsersDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: Role })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @ApiPropertyOptional({ enum: UserStatus })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  organizationId?: string;
}
