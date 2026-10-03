import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { buildPaginatedResult } from '@common/dto/pagination.dto';
import { TariffGroup } from '@database/entities/tariff-group.entity';
import {
  CreateTariffGroupDto,
  PricePreviewDto,
  QueryTariffGroupsDto,
  UpdateTariffGroupDto,
} from '@modules/tariffs/dto/tariff.dto';

export interface KitPriceBreakdown {
  tariffGroupCode: string;
  tariffGroupName: string;
  currency: 'USD';
  registrationFeeUsd: number;
  monthlyFeeUsd: number;
  includedSosButtons: number;
  totalSosButtons: number;
  extraSosButtons: number;
  sosButtonUnitPriceUsd: number;
  sosButtonsTotalUsd: number;
  totalKitUsd: number;
  totalMonthlyUsd: number;
  exchangeRateUsdToCdf: number | null;
  totalKitCdf: number | null;
  totalMonthlyCdf: number | null;
}

@Injectable()
export class TariffsService {
  constructor(
    @InjectRepository(TariffGroup)
    private readonly tariffGroupsRepository: Repository<TariffGroup>,
  ) {}

  async create(dto: CreateTariffGroupDto): Promise<TariffGroup> {
    const code = dto.code.toUpperCase();
    const existing = await this.tariffGroupsRepository.findOne({ where: { code } });
    if (existing) throw new ConflictException(`Le groupe tarifaire "${code}" existe deja.`);

    const group = this.tariffGroupsRepository.create({
      code,
      name: dto.name,
      offerPack: dto.offerPack,
      description: dto.description ?? null,
      registrationFeeUsd: dto.registrationFeeUsd.toFixed(2),
      monthlyFeeUsd: dto.monthlyFeeUsd.toFixed(2),
      includedSosButtons: dto.includedSosButtons ?? 1,
      sosButtonUnitPriceUsd: (dto.sosButtonUnitPriceUsd ?? 5).toFixed(2),
      maxSosButtons: dto.maxSosButtons ?? 10,
      exchangeRateUsdToCdf: dto.exchangeRateUsdToCdf?.toFixed(4) ?? null,
      features: dto.features ?? {},
    });

    return this.tariffGroupsRepository.save(group);
  }

  async findAll(query: QueryTariffGroupsDto) {
    const builder = this.tariffGroupsRepository.createQueryBuilder('tariff');

    if (!query.includeArchived) {
      builder.andWhere('tariff.archivedAt IS NULL AND tariff.isActive = true');
    }
    if (query.offerPack) builder.andWhere('tariff.offerPack = :offerPack', { offerPack: query.offerPack });
    if (query.search) {
      builder.andWhere(
        new Brackets((qb) => {
          qb.where('tariff.name ILIKE :search', { search: `%${query.search}%` }).orWhere(
            'tariff.code ILIKE :search',
            { search: `%${query.search}%` },
          );
        }),
      );
    }

    builder
      .orderBy('tariff.registrationFeeUsd', 'ASC')
      .skip(query.skip)
      .take(query.limit);

    const [items, total] = await builder.getManyAndCount();
    return buildPaginatedResult(items, total, query.page, query.limit);
  }

  async findOneOrFail(id: string): Promise<TariffGroup> {
    const group = await this.tariffGroupsRepository.findOne({ where: { id } });
    if (!group) throw new NotFoundException('Groupe tarifaire introuvable.');
    return group;
  }

  async update(id: string, dto: UpdateTariffGroupDto): Promise<TariffGroup> {
    const group = await this.findOneOrFail(id);

    Object.assign(group, {
      name: dto.name ?? group.name,
      offerPack: dto.offerPack ?? group.offerPack,
      description: dto.description !== undefined ? dto.description : group.description,
      registrationFeeUsd:
        dto.registrationFeeUsd !== undefined ? dto.registrationFeeUsd.toFixed(2) : group.registrationFeeUsd,
      monthlyFeeUsd:
        dto.monthlyFeeUsd !== undefined ? dto.monthlyFeeUsd.toFixed(2) : group.monthlyFeeUsd,
      includedSosButtons: dto.includedSosButtons ?? group.includedSosButtons,
      sosButtonUnitPriceUsd:
        dto.sosButtonUnitPriceUsd !== undefined
          ? dto.sosButtonUnitPriceUsd.toFixed(2)
          : group.sosButtonUnitPriceUsd,
      maxSosButtons: dto.maxSosButtons ?? group.maxSosButtons,
      exchangeRateUsdToCdf:
        dto.exchangeRateUsdToCdf !== undefined
          ? dto.exchangeRateUsdToCdf.toFixed(4)
          : group.exchangeRateUsdToCdf,
      features: dto.features ?? group.features,
    });

    if (group.maxSosButtons < group.includedSosButtons) {
      throw new ConflictException(
        'Le nombre maximum de boutons SOS ne peut pas etre inferieur au nombre inclus.',
      );
    }

    return this.tariffGroupsRepository.save(group);
  }

  /** Mise a jour du taux de change USD -> CDF (DAF). */
  async updateExchangeRate(id: string, rate: number): Promise<TariffGroup> {
    const group = await this.findOneOrFail(id);
    group.exchangeRateUsdToCdf = rate.toFixed(4);
    return this.tariffGroupsRepository.save(group);
  }

  /** Archivage (conservation de l'historique tarifaire). */
  async setArchived(id: string, archived: boolean): Promise<TariffGroup> {
    const group = await this.findOneOrFail(id);
    group.archivedAt = archived ? new Date() : null;
    group.isActive = !archived;
    return this.tariffGroupsRepository.save(group);
  }

  /**
   * Calcul du prix du kit : frais de souscription + boutons SOS supplementaires.
   * Exemple du cahier des charges : 3 boutons -> 150 + (2 x 5) = 160 USD.
   */
  computePrice(group: TariffGroup, totalSosButtons: number): KitPriceBreakdown {
    const included = group.includedSosButtons;
    const unitPrice = Number(group.sosButtonUnitPriceUsd);
    const extra = Math.max(0, totalSosButtons - included);
    const registrationFee = Number(group.registrationFeeUsd);
    const monthlyFee = Number(group.monthlyFeeUsd);
    const rate = group.exchangeRateUsdToCdf ? Number(group.exchangeRateUsdToCdf) : null;
    const totalKit = registrationFee + extra * unitPrice;

    return {
      tariffGroupCode: group.code,
      tariffGroupName: group.name,
      currency: 'USD',
      registrationFeeUsd: registrationFee,
      monthlyFeeUsd: monthlyFee,
      includedSosButtons: included,
      totalSosButtons,
      extraSosButtons: extra,
      sosButtonUnitPriceUsd: unitPrice,
      sosButtonsTotalUsd: Number((extra * unitPrice).toFixed(2)),
      totalKitUsd: Number(totalKit.toFixed(2)),
      totalMonthlyUsd: monthlyFee,
      exchangeRateUsdToCdf: rate,
      totalKitCdf: rate === null ? null : Number((totalKit * rate).toFixed(2)),
      totalMonthlyCdf: rate === null ? null : Number((monthlyFee * rate).toFixed(2)),
    };
  }

  async previewPrice(dto: PricePreviewDto): Promise<KitPriceBreakdown> {
    const group = await this.findOneOrFail(dto.tariffGroupId);
    const requested = dto.sosButtonCount ?? group.includedSosButtons;
    if (requested > group.maxSosButtons) {
      throw new ConflictException(
        `Le nombre maximal de boutons SOS est de ${group.maxSosButtons} pour ce groupe tarifaire.`,
      );
    }
    return this.computePrice(group, requested);
  }
}
