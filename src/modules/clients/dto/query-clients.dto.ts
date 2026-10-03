import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { ToBoolean } from '@common/decorators/to-boolean.decorator';
import { PaginationQueryDto } from '@common/dto/pagination.dto';
import { ClientStatus, Language, OfferPack, SubscriptionStatus } from '@common/enums/client.enum';

export class QueryClientsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ClientStatus })
  @IsOptional()
  @IsEnum(ClientStatus)
  status?: ClientStatus;

  @ApiPropertyOptional({ enum: SubscriptionStatus })
  @IsOptional()
  @IsEnum(SubscriptionStatus)
  subscriptionStatus?: SubscriptionStatus;

  @ApiPropertyOptional({ enum: OfferPack })
  @IsOptional()
  @IsEnum(OfferPack)
  offerPack?: OfferPack;

  @ApiPropertyOptional({ enum: Language })
  @IsOptional()
  @IsEnum(Language)
  preferredLanguage?: Language;

  @ApiPropertyOptional({ description: 'Agence / PDC (defaut : perimetre de l utilisateur).' })
  @IsOptional()
  @IsUUID()
  organizationId?: string;

  @ApiPropertyOptional({ description: 'Inclure les agences descendantes de `organizationId`.' })
  @ToBoolean()
  @IsOptional()
  includeDescendants?: boolean;
}
