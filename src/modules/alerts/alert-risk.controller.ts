import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { AuthenticatedUser } from '@common/interfaces/authenticated-user.interface';
import { AlertRiskService } from '@modules/alerts/alert-risk.service';

export class ZoneRiskQueryDto {
  @ApiPropertyOptional({ description: 'Profondeur de l historique, en jours.', default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days?: number;

  @ApiPropertyOptional({ description: 'Nombre de zones retournees.', default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({
    description: "Nombre minimal d'alertes pour qu'une maille soit etudiee : evite de qualifier une zone sur un evenement isole.",
    default: 2,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  minAlerts?: number;
}

/**
 * Analyse predictive du risque.
 *
 * Lecture seule, ouverte a tout utilisateur authentifie : les donnees sont
 * deja restreintes au perimetre de son perimetre organisationnel.
 */
@ApiTags('Analyse de risque')
@ApiBearerAuth()
@Controller('alerts/risk')
export class AlertRiskController {
  constructor(private readonly riskService: AlertRiskService) {}

  @Get('zones')
  @ApiOperation({
    summary:
      'Zones a risque du perimetre : maille, volume, part confirmee, tendance sur 7 jours et score explique.',
  })
  zones(@CurrentUser() user: AuthenticatedUser, @Query() query: ZoneRiskQueryDto) {
    return this.riskService.zones(user, query);
  }

  @Get('summary')
  @ApiOperation({
    summary:
      'Synthese : zones sensibles, repartition par ville, clients a declenchements repetes et seuils du modele.',
  })
  summary(@CurrentUser() user: AuthenticatedUser, @Query() query: ZoneRiskQueryDto) {
    return this.riskService.summary(user, query);
  }

  @Get('cities')
  @ApiOperation({ summary: 'Villes couvertes par le perimetre (filtres de la console).' })
  async cities(@CurrentUser() user: AuthenticatedUser) {
    return { items: await this.riskService.cities(user) };
  }
}
