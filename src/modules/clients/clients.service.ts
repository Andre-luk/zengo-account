import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, QueryDeepPartialEntity, Repository } from 'typeorm';
import { buildPaginatedResult } from '@common/dto/pagination.dto';
import {
  ClientStatus,
  Currency,
  Language,
  OfferPack,
  SubscriptionStatus,
} from '@common/enums/client.enum';
import { OrganizationType } from '@common/enums/organization.enum';
import { Role } from '@common/enums/role.enum';
import { AuthenticatedUser } from '@common/interfaces/authenticated-user.interface';
import { buildZengoId, normalizePhone } from '@common/utils/identifier.util';
import { ClientProfile } from '@database/entities/client-profile.entity';
import { Device } from '@database/entities/device.entity';
import { Organization } from '@database/entities/organization.entity';
import { TariffGroup } from '@database/entities/tariff-group.entity';
import { OrganizationScopeService } from '@modules/organizations/organizations.service';
import { TariffsService } from '@modules/tariffs/tariffs.service';
import { UsersService } from '@modules/users/users.service';
import { CreateClientDto, UpdateClientDto } from '@modules/clients/dto/client.dto';
import { QueryClientsDto } from '@modules/clients/dto/query-clients.dto';

const CLIENT_RELATIONS = {
  organization: true,
  tariffGroup: true,
  device: true,
  user: true,
};

@Injectable()
export class ClientsService {
  constructor(
    @InjectRepository(ClientProfile)
    private readonly clientsRepository: Repository<ClientProfile>,
    @InjectRepository(Organization)
    private readonly organizationsRepository: Repository<Organization>,
    @InjectRepository(TariffGroup)
    private readonly tariffGroupsRepository: Repository<TariffGroup>,
    @InjectRepository(Device)
    private readonly devicesRepository: Repository<Device>,
    private readonly scopeService: OrganizationScopeService,
    private readonly usersService: UsersService,
    private readonly tariffsService: TariffsService,
  ) {}

  // ---------------------------------------------------------------------------
  // Creation d'un compte client (etape "Responsable plateforme Zengo")
  // ---------------------------------------------------------------------------

  async create(actor: AuthenticatedUser, dto: CreateClientDto) {
    const organization = await this.organizationsRepository.findOne({ where: { id: dto.organizationId } });
    if (!organization) throw new NotFoundException('Agence / organisation de rattachement introuvable.');
    if (![OrganizationType.AGENCY, OrganizationType.REGION, OrganizationType.ENTERPRISE].includes(organization.type)) {
      throw new BadRequestException(
        'Un compte client doit etre rattache a une agence, une zone ou une institution.',
      );
    }
    await this.scopeService.assertInScope(actor, organization.id);

    const tariffGroup = dto.tariffGroupId
      ? await this.tariffGroupsRepository.findOne({ where: { id: dto.tariffGroupId } })
      : null;
    if (dto.tariffGroupId && !tariffGroup) throw new NotFoundException('Groupe tarifaire introuvable.');

    const offerPack = dto.offerPack ?? tariffGroup?.offerPack ?? OfferPack.STANDARD;
    const sosButtonCount = this.resolveSosButtonCount(dto.sosButtonCount, tariffGroup);
    const primaryPhone = normalizePhone(dto.primaryPhone);

    const existingPhone = await this.clientsRepository.findOne({ where: { primaryPhone } });
    if (existingPhone) {
      throw new ConflictException('Un compte client existe deja avec ce numero de telephone.');
    }

    // 1) Compte de connexion (login client) si demande.
    let userId: string | null = null;
    let temporaryPassword: string | undefined;
    if (dto.createUserAccount !== false) {
      const { firstName, lastName } = this.splitFullName(dto.fullName);
      const created = await this.usersService.create({
        email: dto.loginEmail,
        phone: dto.loginEmail ? undefined : primaryPhone,
        firstName,
        lastName,
        password: dto.loginPassword,
        preferredLanguage: dto.preferredLanguage ?? Language.FRENCH,
        memberships: [{ organizationId: organization.id, role: Role.CLIENT, isPrimary: true }],
      });
      userId = created.user.id;
      temporaryPassword = created.temporaryPassword;
    }

    // 2) Fiche client avec identifiant Zengo unique.
    const client = await this.persistWithZengoId(organization.id, (zengoId) => {
      const entity = this.clientsRepository.create({
        zengoId,
        userId,
        organizationId: organization.id,
        fullName: dto.fullName.trim(),
        companyName: dto.companyName ?? null,
        primaryPhone,
        secondaryPhone: dto.secondaryPhone ? normalizePhone(dto.secondaryPhone) : null,
        emergencyContactName: dto.emergencyContactName ?? null,
        emergencyContactPhone: dto.emergencyContactPhone
          ? normalizePhone(dto.emergencyContactPhone)
          : null,
        preferredLanguage: dto.preferredLanguage ?? Language.FRENCH,
        address: dto.address ?? null,
        city: dto.city ?? null,
        country: dto.country ?? 'CD',
        latitude: dto.latitude ?? null,
        longitude: dto.longitude ?? null,
        offerPack,
        tariffGroupId: tariffGroup?.id ?? null,
        currency: dto.currency ?? Currency.USD,
        status: ClientStatus.PENDING,
        subscriptionStatus: SubscriptionStatus.PENDING,
        sosButtonCount,
        createdById: actor.id,
        notes: dto.notes ?? null,
      });
      return entity;
    });

    // 3) Rattachement d'un dispositif deja provisionne (optionnel).
    if (dto.deviceSerialNumber) {
      await this.assignDeviceBySerial(actor, client.id, dto.deviceSerialNumber);
    }

    return {
      client: await this.getByIdOrFail(client.id),
      pricing: await this.buildPricing(client.id),
      ...(temporaryPassword ? { temporaryPassword } : {}),
    };
  }

  // ---------------------------------------------------------------------------
  // Lecture
  // ---------------------------------------------------------------------------

  async findAll(actor: AuthenticatedUser, query: QueryClientsDto) {
    const scope = await this.scopeService.getAccessibleOrganizationIds(actor);
    if (scope !== null && scope.length === 0) {
      return buildPaginatedResult<ClientProfile>([], 0, query.page, query.limit);
    }

    const builder = this.clientsRepository
      .createQueryBuilder('client')
      .leftJoinAndSelect('client.organization', 'organization')
      .leftJoinAndSelect('client.tariffGroup', 'tariffGroup')
      .leftJoinAndSelect('client.device', 'device');

    if (scope !== null) {
      builder.andWhere('client.organizationId IN (:...scope)', { scope });
    }
    if (query.organizationId) {
      if (query.includeDescendants) {
        const organization = await this.organizationsRepository.findOne({ where: { id: query.organizationId } });
        if (!organization) throw new NotFoundException('Organisation introuvable.');
        builder.andWhere(
          'organization.path = :orgPath OR organization.path LIKE :orgPathLike',
          { orgPath: organization.path, orgPathLike: `${organization.path}/%` },
        );
      } else {
        builder.andWhere('client.organizationId = :organizationId', {
          organizationId: query.organizationId,
        });
      }
    }
    if (query.status) builder.andWhere('client.status = :status', { status: query.status });
    if (query.subscriptionStatus) {
      builder.andWhere('client.subscriptionStatus = :subscriptionStatus', {
        subscriptionStatus: query.subscriptionStatus,
      });
    }
    if (query.offerPack) builder.andWhere('client.offerPack = :offerPack', { offerPack: query.offerPack });
    if (query.preferredLanguage) {
      builder.andWhere('client.preferredLanguage = :language', { language: query.preferredLanguage });
    }
    if (query.search) {
      builder.andWhere(
        new Brackets((qb) => {
          qb.where('client.fullName ILIKE :search', { search: `%${query.search}%` })
            .orWhere('client.zengoId ILIKE :search', { search: `%${query.search}%` })
            .orWhere('client.primaryPhone ILIKE :search', { search: `%${query.search}%` })
            .orWhere('client.companyName ILIKE :search', { search: `%${query.search}%` })
            .orWhere('device.serialNumber ILIKE :search', { search: `%${query.search}%` });
        }),
      );
    }

    builder
      .orderBy('client.createdAt', query.order.toUpperCase() as 'ASC' | 'DESC')
      .skip(query.skip)
      .take(query.limit);

    const [items, total] = await builder.getManyAndCount();
    return buildPaginatedResult(items, total, query.page, query.limit);
  }

  async findOne(actor: AuthenticatedUser, id: string): Promise<ClientProfile> {
    const client = await this.getByIdOrFail(id);
    await this.scopeService.assertInScope(actor, client.organizationId);
    return client;
  }

  /** Profil du client connecte (application mobile). */
  async findMyProfile(userId: string): Promise<ClientProfile> {
    const client = await this.clientsRepository.findOne({
      where: { userId },
      relations: CLIENT_RELATIONS,
    });
    if (!client) throw new NotFoundException('Aucun compte client associe a cet utilisateur.');
    return client;
  }

  async getByIdOrFail(id: string): Promise<ClientProfile> {
    const client = await this.clientsRepository.findOne({ where: { id }, relations: CLIENT_RELATIONS });
    if (!client) throw new NotFoundException('Compte client introuvable.');
    return client;
  }

  // ---------------------------------------------------------------------------
  // Mise a jour
  // ---------------------------------------------------------------------------

  async update(actor: AuthenticatedUser, id: string, dto: UpdateClientDto): Promise<ClientProfile> {
    const client = await this.findOne(actor, id);

    // `update()` (et non `save()`) evite que la relation inverse `device`
    // chargee ne soit renvoyee a NULL lors de l'ecriture.
    const changes: QueryDeepPartialEntity<ClientProfile> = {};

    if (dto.tariffGroupId !== undefined && dto.tariffGroupId !== client.tariffGroupId) {
      const tariffGroup = await this.tariffGroupsRepository.findOne({ where: { id: dto.tariffGroupId } });
      if (!tariffGroup) throw new NotFoundException('Groupe tarifaire introuvable.');
      changes.tariffGroupId = tariffGroup.id;
      changes.offerPack = tariffGroup.offerPack;
    }

    if (dto.sosButtonCount !== undefined) {
      const tariffGroup = client.tariffGroupId
        ? await this.tariffGroupsRepository.findOne({ where: { id: client.tariffGroupId } })
        : null;
      changes.sosButtonCount = this.resolveSosButtonCount(dto.sosButtonCount, tariffGroup);
    }

    if (dto.fullName !== undefined) changes.fullName = dto.fullName.trim();
    if (dto.companyName !== undefined) changes.companyName = dto.companyName;
    if (dto.primaryPhone !== undefined) changes.primaryPhone = normalizePhone(dto.primaryPhone);
    if (dto.secondaryPhone !== undefined) {
      changes.secondaryPhone = dto.secondaryPhone ? normalizePhone(dto.secondaryPhone) : null;
    }
    if (dto.emergencyContactName !== undefined) changes.emergencyContactName = dto.emergencyContactName;
    if (dto.emergencyContactPhone !== undefined) {
      changes.emergencyContactPhone = dto.emergencyContactPhone
        ? normalizePhone(dto.emergencyContactPhone)
        : null;
    }
    if (dto.preferredLanguage !== undefined) changes.preferredLanguage = dto.preferredLanguage;
    if (dto.address !== undefined) changes.address = dto.address;
    if (dto.city !== undefined) changes.city = dto.city;
    if (dto.country !== undefined) changes.country = dto.country;
    if (dto.latitude !== undefined) changes.latitude = dto.latitude;
    if (dto.longitude !== undefined) changes.longitude = dto.longitude;
    if (dto.offerPack !== undefined) changes.offerPack = dto.offerPack;
    if (dto.currency !== undefined) changes.currency = dto.currency;
    if (dto.notes !== undefined) changes.notes = dto.notes;

    if (Object.keys(changes).length > 0) {
      await this.clientsRepository.update(client.id, changes);
    }

    return this.getByIdOrFail(client.id);
  }

  async updateStatus(
    actor: AuthenticatedUser,
    id: string,
    status: ClientStatus,
  ): Promise<ClientProfile> {
    const client = await this.findOne(actor, id);
    await this.clientsRepository.update(client.id, { status });
    return this.getByIdOrFail(client.id);
  }

  // ---------------------------------------------------------------------------
  // Rattachement du dispositif SafAlert
  // ---------------------------------------------------------------------------

  async assignDevice(actor: AuthenticatedUser, clientId: string, deviceId: string) {
    const client = await this.findOne(actor, clientId);
    const device = await this.devicesRepository.findOne({ where: { id: deviceId } });
    if (!device) throw new NotFoundException('Dispositif introuvable.');

    return this.linkDevice(actor, client, device);
  }

  async assignDeviceBySerial(actor: AuthenticatedUser, clientId: string, serialNumber: string) {
    const client = await this.findOne(actor, clientId);
    const device = await this.devicesRepository.findOne({ where: { serialNumber } });
    if (!device) throw new NotFoundException(`Dispositif "${serialNumber}" introuvable.`);

    return this.linkDevice(actor, client, device);
  }

  async unassignDevice(actor: AuthenticatedUser, clientId: string): Promise<ClientProfile> {
    const client = await this.findOne(actor, clientId);
    if (!client.device) throw new BadRequestException('Aucun dispositif n est rattache a ce client.');

    await this.devicesRepository.update(client.device.id, { clientId: null });
    return this.getByIdOrFail(client.id);
  }

  /** Finalise l'installation : lie le dispositif et active le compte client. */
  async completeInstallation(actor: AuthenticatedUser, clientId: string, deviceId: string) {
    const client = await this.findOne(actor, clientId);

    if (client.device && client.device.id !== deviceId) {
      throw new ConflictException('Ce client possede deja un dispositif rattache.');
    }

    const device = await this.devicesRepository.findOne({ where: { id: deviceId } });
    if (!device) throw new NotFoundException('Dispositif introuvable.');

    const otherOwner = await this.clientsRepository.findOne({ where: { device: { id: deviceId } } });
    if (otherOwner && otherOwner.id !== client.id) {
      throw new ConflictException('Ce dispositif est deja rattache a un autre client.');
    }

    await this.devicesRepository.update(device.id, {
      clientId: client.id,
      language: client.preferredLanguage,
      organizationId: client.organizationId,
    });

    await this.clientsRepository.update(client.id, {
      installationDate: new Date(),
      installedById: actor.id,
      status: client.status === ClientStatus.PENDING ? ClientStatus.ACTIVE : client.status,
    });

    return this.getByIdOrFail(client.id);
  }

  // ---------------------------------------------------------------------------
  // Tarification (apercu du kit + boutons SOS)
  // ---------------------------------------------------------------------------

  async buildPricing(clientId: string) {
    const client = await this.getByIdOrFail(clientId);

    if (!client.tariffGroup) {
      return {
        currency: client.currency,
        tariffGroupCode: null,
        registrationFeeUsd: null,
        monthlyFeeUsd: null,
        totalSosButtons: client.sosButtonCount,
        extraSosButtons: null,
        sosButtonsTotalUsd: null,
        totalKitUsd: null,
        totalMonthlyUsd: null,
        totalKitCdf: null,
        totalMonthlyCdf: null,
      };
    }

    return {
      ...this.tariffsService.computePrice(client.tariffGroup, client.sosButtonCount),
      currency: client.currency,
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers prives
  // ---------------------------------------------------------------------------

  private async linkDevice(
    actor: AuthenticatedUser,
    client: ClientProfile,
    device: Device,
  ): Promise<ClientProfile> {
    if (client.device && client.device.id !== device.id) {
      throw new ConflictException(
        'Ce client possede deja un dispositif. Chaque compte est lie a un seul appareil (sauf packs sur mesure).',
      );
    }

    const otherOwner = await this.clientsRepository.findOne({ where: { device: { id: device.id } } });
    if (otherOwner && otherOwner.id !== client.id) {
      throw new ConflictException('Ce dispositif est deja rattache a un autre client.');
    }

    await this.devicesRepository.update(device.id, {
      clientId: client.id,
      language: client.preferredLanguage,
      organizationId: client.organizationId,
    });

    return this.getByIdOrFail(client.id);
  }

  /**
   * Cree la fiche client en generant un identifiant Zengo unique.
   * En cas de collision (creation concurrente), l'operation est retentee.
   */
  private async persistWithZengoId(
    organizationId: string,
    build: (zengoId: string) => ClientProfile,
    attempt = 0,
  ): Promise<ClientProfile> {
    const organization = await this.organizationsRepository.findOne({ where: { id: organizationId } });
    if (!organization) throw new NotFoundException('Organisation introuvable.');

    const existingCount = await this.clientsRepository.count({
      where: { organizationId },
      withDeleted: true,
    });

    const zengoId = buildZengoId(organization.code, existingCount + 1 + attempt);
    const client = build(zengoId);

    try {
      return await this.clientsRepository.save(client);
    } catch (error) {
      const isUniqueViolation =
        typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505';
      if (isUniqueViolation && attempt < 5) {
        return this.persistWithZengoId(organizationId, build, attempt + 1);
      }
      throw error;
    }
  }

  private resolveSosButtonCount(requested: number | undefined, tariffGroup: TariffGroup | null): number {
    const count = requested ?? tariffGroup?.includedSosButtons ?? 1;
    const max = tariffGroup?.maxSosButtons ?? 10;
    if (count < 1) throw new BadRequestException('Au moins un bouton SOS est requis.');
    if (count > max) {
      throw new BadRequestException(`Le nombre maximal de boutons SOS est de ${max} pour ce groupe tarifaire.`);
    }
    return count;
  }

  private splitFullName(fullName: string): { firstName: string; lastName: string } {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 1) return { firstName: parts[0], lastName: parts[0] };
    const lastName = parts.pop() as string;
    return { firstName: parts.join(' '), lastName };
  }
}
