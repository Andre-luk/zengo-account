import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Audit } from '@common/decorators/audit.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { Roles } from '@common/decorators/roles.decorator';
import { Role } from '@common/enums/role.enum';
import { AuditAction } from '@common/enums/user.enum';
import { AuthenticatedUser } from '@common/interfaces/authenticated-user.interface';
import {
  ArchiveTariffGroupDto,
  CreateTariffGroupDto,
  PricePreviewDto,
  QueryTariffGroupsDto,
  UpdateExchangeRateDto,
  UpdateTariffGroupDto,
} from '@modules/tariffs/dto/tariff.dto';
import { TariffsService } from '@modules/tariffs/tariffs.service';

const TARIFF_READERS = [
  Role.SUPER_ADMIN,
  Role.NATIONAL_DIRECTOR,
  Role.TECHNICAL_DIRECTOR,
  Role.DAF,
  Role.ACCOUNTANT,
  Role.PLATFORM_MANAGER,
  Role.REGION_MANAGER,
  Role.AGENCY_MANAGER,
] as const;

@ApiTags('Tarification')
@ApiBearerAuth()
@Controller('tariff-groups')
export class TariffsController {
  constructor(private readonly tariffsService: TariffsService) {}

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.DAF)
  @Audit(AuditAction.CREATE, 'TariffGroup')
  @ApiOperation({ summary: 'Creer un groupe tarifaire (DAF).' })
  create(@Body() dto: CreateTariffGroupDto) {
    return this.tariffsService.create(dto);
  }

  @Get()
  @Roles(...TARIFF_READERS)
  @ApiOperation({ summary: 'Lister les groupes tarifaires.' })
  findAll(@Query() query: QueryTariffGroupsDto) {
    return this.tariffsService.findAll(query);
  }

  @Post('price-preview')
  @Roles(...TARIFF_READERS)
  @ApiOperation({
    summary: 'Calculer le prix du kit (boutons SOS) et de l abonnement, en USD et CDF.',
  })
  previewPrice(@Body() dto: PricePreviewDto) {
    return this.tariffsService.previewPrice(dto);
  }

  @Get(':id')
  @Roles(...TARIFF_READERS)
  @ApiOperation({ summary: 'Detail d un groupe tarifaire.' })
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.tariffsService.findOneOrFail(id);
  }

  @Patch(':id')
  @Roles(Role.SUPER_ADMIN, Role.DAF)
  @Audit(AuditAction.UPDATE, 'TariffGroup')
  @ApiOperation({ summary: 'Modifier un groupe tarifaire.' })
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateTariffGroupDto) {
    return this.tariffsService.update(id, dto);
  }

  @Patch(':id/exchange-rate')
  @Roles(Role.SUPER_ADMIN, Role.DAF)
  @Audit(AuditAction.UPDATE, 'TariffGroup')
  @ApiOperation({ summary: 'Mettre a jour le taux de change USD -> CDF.' })
  updateExchangeRate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateExchangeRateDto,
  ) {
    return this.tariffsService.updateExchangeRate(id, dto.exchangeRateUsdToCdf);
  }

  @Delete(':id')
  @Roles(Role.SUPER_ADMIN, Role.DAF)
  @Audit(AuditAction.STATUS_CHANGE, 'TariffGroup')
  @ApiOperation({ summary: 'Archiver / restaurer un groupe tarifaire.' })
  setArchived(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ArchiveTariffGroupDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    void user;
    return this.tariffsService.setArchived(id, dto.archived);
  }
}
