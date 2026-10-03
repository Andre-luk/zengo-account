import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { ToBoolean } from '@common/decorators/to-boolean.decorator';
import { PaginationQueryDto } from '@common/dto/pagination.dto';
import { OrganizationStatus, OrganizationType } from '@common/enums/organization.enum';

export class QueryOrganizationsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: OrganizationType })
  @IsOptional()
  @IsEnum(OrganizationType)
  type?: OrganizationType;

  @ApiPropertyOptional({ enum: OrganizationStatus })
  @IsOptional()
  @IsEnum(OrganizationStatus)
  status?: OrganizationStatus;

  @ApiPropertyOptional({ description: 'Filtre sur le parent direct.' })
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @ApiPropertyOptional({
    description: 'Si vrai, renvoie aussi les organisations descendantes de `parentId`.',
  })
  @ToBoolean()
  @IsOptional()
  includeDescendants?: boolean;
}
