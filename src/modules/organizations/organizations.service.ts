import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { buildPaginatedResult } from '@common/dto/pagination.dto';
import { NATIONAL_SCOPE_ROLES, Role } from '@common/enums/role.enum';
import { OrganizationStatus, OrganizationType } from '@common/enums/organization.enum';
import { AuthenticatedUser } from '@common/interfaces/authenticated-user.interface';
import { Organization } from '@database/entities/organization.entity';
import { CreateOrganizationDto } from '@modules/organizations/dto/create-organization.dto';
import { QueryOrganizationsDto } from '@modules/organizations/dto/query-organizations.dto';
import { UpdateOrganizationDto } from '@modules/organizations/dto/update-organization.dto';

/**
 * Service de portee organisationnelle : determine les organisations
 * accessibles a un utilisateur en fonction de ses appartenances et de son role.
 *
 * Regle : un role de portee nationale voit tout, les autres voient leur(s)
 * organisation(s) de rattachement et leurs descendants. Les clients finaux
 * (role CLIENT) ne derivent pas leur perimetre des organisations.
 */
@Injectable()
export class OrganizationScopeService {
  constructor(
    @InjectRepository(Organization)
    private readonly organizationRepository: Repository<Organization>,
  ) {}

  /**
   * @returns `null` si l'utilisateur a une portee nationale (aucune restriction),
   *          sinon la liste des identifiants d'organisations accessibles.
   */
  async getAccessibleOrganizationIds(user: AuthenticatedUser): Promise<string[] | null> {
    if (user.isSuperAdmin || user.roles.some((role) => NATIONAL_SCOPE_ROLES.has(role))) {
      return null;
    }

    const memberships = user.memberships.filter((membership) => membership.role !== Role.CLIENT);
    if (memberships.length === 0) return [];

    const query = this.organizationRepository
      .createQueryBuilder('organization')
      .select('organization.id', 'id');

    const conditions: string[] = [];
    const parameters: Record<string, string> = {};

    memberships.forEach((membership, index) => {
      const pathKey = `path${index}`;
      const likeKey = `pathLike${index}`;
      conditions.push(`(organization.path = :${pathKey} OR organization.path LIKE :${likeKey})`);
      parameters[pathKey] = membership.organizationPath;
      parameters[likeKey] = `${membership.organizationPath}/%`;
    });

    query.where(conditions.join(' OR ')).setParameters(parameters);

    const rows = await query.getRawMany<{ id: string }>();
    return rows.map((row) => row.id);
  }

  /** Verifie qu'une organisation est dans le perimetre de l'utilisateur. */
  async assertInScope(user: AuthenticatedUser, organizationId: string): Promise<void> {
    const scope = await this.getAccessibleOrganizationIds(user);
    if (scope === null) return;
    if (!scope.includes(organizationId)) {
      throw new ForbiddenException("Acces refuse : organisation hors de votre perimetre.");
    }
  }

  /** Filtre une liste d'identifiants d'organisations selon le perimetre. */
  async listInScope(user: AuthenticatedUser): Promise<string[] | null> {
    return this.getAccessibleOrganizationIds(user);
  }
}

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectRepository(Organization)
    private readonly organizationRepository: Repository<Organization>,
    private readonly scopeService: OrganizationScopeService,
  ) {}

  async create(dto: CreateOrganizationDto): Promise<Organization> {
    const existingCode = await this.organizationRepository.findOne({ where: { code: dto.code.toUpperCase() } });
    if (existingCode) {
      throw new ConflictException(`Le code "${dto.code}" est deja utilise.`);
    }

    let parent: Organization | null = null;
    if (dto.parentId) {
      parent = await this.organizationRepository.findOne({ where: { id: dto.parentId } });
      if (!parent) throw new NotFoundException('Organisation parente introuvable.');
    } else if (dto.type !== OrganizationType.NATIONAL) {
      throw new BadRequestException(
        'Une organisation parente (parentId) est requise pour toute organisation autre que nationale.',
      );
    }

    this.assertHierarchyAllowed(parent, dto.type);

    const organization = this.organizationRepository.create({
      name: dto.name,
      code: dto.code.toUpperCase(),
      type: dto.type,
      stationType: dto.stationType ?? null,
      parentId: parent?.id ?? null,
      address: dto.address ?? null,
      city: dto.city ?? null,
      country: dto.country ?? null,
      latitude: dto.latitude ?? null,
      longitude: dto.longitude ?? null,
      contactPhone: dto.contactPhone ?? null,
      contactEmail: dto.contactEmail ?? null,
      metadata: dto.metadata ?? {},
      status: OrganizationStatus.ACTIVE,
      depth: parent ? parent.depth + 1 : 0,
      path: '',
    });

    const saved = await this.organizationRepository.save(organization);
    saved.path = parent ? `${parent.path}/${saved.id}` : `/${saved.id}`;
    return this.organizationRepository.save(saved);
  }

  async findAll(user: AuthenticatedUser, query: QueryOrganizationsDto) {
    const scope = await this.scopeService.getAccessibleOrganizationIds(user);

    const builder = this.organizationRepository
      .createQueryBuilder('organization')
      .leftJoinAndSelect('organization.parent', 'parent')
      .orderBy('organization.name', 'ASC')
      .skip(query.skip)
      .take(query.limit);

    if (scope !== null) {
      if (scope.length === 0) {
        return buildPaginatedResult<Organization>([], 0, query.page, query.limit);
      }
      builder.andWhere('organization.id IN (:...scope)', { scope });
    }

    if (query.type) builder.andWhere('organization.type = :type', { type: query.type });
    if (query.status) builder.andWhere('organization.status = :status', { status: query.status });

    if (query.parentId) {
      if (query.includeDescendants) {
        const parent = await this.findOneInScope(user, query.parentId);
        builder.andWhere('(organization.path = :parentPath OR organization.path LIKE :descendantsPath)', {
          parentPath: parent.path,
          descendantsPath: `${parent.path}/%`,
        });
      } else {
        builder.andWhere('organization.parentId = :parentId', { parentId: query.parentId });
      }
    }

    if (query.search) {
      builder.andWhere(
        '(organization.name ILIKE :search OR organization.code ILIKE :search OR organization.city ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }

    const [items, total] = await builder.getManyAndCount();
    return buildPaginatedResult(items, total, query.page, query.limit);
  }

  async findOneInScope(user: AuthenticatedUser, id: string): Promise<Organization> {
    const organization = await this.organizationRepository.findOne({
      where: { id },
      relations: { parent: true, children: true },
    });
    if (!organization) throw new NotFoundException('Organisation introuvable.');
    await this.scopeService.assertInScope(user, organization.id);
    return organization;
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateOrganizationDto): Promise<Organization> {
    const organization = await this.findOneInScope(user, id);

    if (dto.code && dto.code.toUpperCase() !== organization.code) {
      const existing = await this.organizationRepository.findOne({ where: { code: dto.code.toUpperCase() } });
      if (existing) throw new ConflictException(`Le code "${dto.code}" est deja utilise.`);
      organization.code = dto.code.toUpperCase();
    }

    if (dto.parentId !== undefined && dto.parentId !== organization.parentId) {
      await this.moveOrganization(organization, dto.parentId ?? null);
    }

    if (dto.type && dto.type !== organization.type) {
      const parent = organization.parentId
        ? await this.organizationRepository.findOne({ where: { id: organization.parentId } })
        : null;
      this.assertHierarchyAllowed(parent, dto.type);
      organization.type = dto.type;
    }

    Object.assign(organization, {
      name: dto.name ?? organization.name,
      stationType: dto.stationType !== undefined ? dto.stationType : organization.stationType,
      address: dto.address !== undefined ? dto.address : organization.address,
      city: dto.city !== undefined ? dto.city : organization.city,
      country: dto.country !== undefined ? dto.country : organization.country,
      latitude: dto.latitude !== undefined ? dto.latitude : organization.latitude,
      longitude: dto.longitude !== undefined ? dto.longitude : organization.longitude,
      contactPhone: dto.contactPhone !== undefined ? dto.contactPhone : organization.contactPhone,
      contactEmail: dto.contactEmail !== undefined ? dto.contactEmail : organization.contactEmail,
      metadata: dto.metadata ?? organization.metadata,
    });

    return this.organizationRepository.save(organization);
  }

  async updateStatus(
    user: AuthenticatedUser,
    id: string,
    status: OrganizationStatus,
  ): Promise<Organization> {
    const organization = await this.findOneInScope(user, id);
    organization.status = status;
    return this.organizationRepository.save(organization);
  }

  async remove(user: AuthenticatedUser, id: string): Promise<void> {
    const organization = await this.findOneInScope(user, id);

    const childrenCount = await this.organizationRepository.count({ where: { parentId: organization.id } });
    if (childrenCount > 0) {
      throw new ConflictException(
        'Impossible de supprimer une organisation possedant des sous-organisations.',
      );
    }

    organization.status = OrganizationStatus.ARCHIVED;
    await this.organizationRepository.save(organization);
    await this.organizationRepository.softDelete(organization.id);
  }

  /** Retourne les descendants directs et indirects d'une organisation. */
  async findDescendants(organizationId: string): Promise<Organization[]> {
    const organization = await this.organizationRepository.findOne({ where: { id: organizationId } });
    if (!organization) return [];
    return this.organizationRepository
      .createQueryBuilder('organization')
      .where('organization.path LIKE :path', { path: `${organization.path}/%` })
      .orderBy('organization.depth', 'ASC')
      .getMany();
  }

  async findByIds(ids: string[]): Promise<Organization[]> {
    if (ids.length === 0) return [];
    return this.organizationRepository.find({ where: { id: In(ids) } });
  }

  async findByCode(code: string): Promise<Organization | null> {
    return this.organizationRepository.findOne({ where: { code: code.toUpperCase() } });
  }

  async countByType(type: OrganizationType): Promise<number> {
    return this.organizationRepository.count({ where: { type } });
  }

  private async moveOrganization(organization: Organization, newParentId: string | null): Promise<void> {
    if (newParentId === null) {
      if (organization.type !== OrganizationType.NATIONAL) {
        throw new BadRequestException('Seule une organisation nationale peut etre racine.');
      }
      organization.parentId = null;
      organization.parent = null;
      organization.depth = 0;
      organization.path = `/${organization.id}`;
      return;
    }

    const newParent = await this.organizationRepository.findOne({ where: { id: newParentId } });
    if (!newParent) throw new NotFoundException('Nouvelle organisation parente introuvable.');
    if (newParent.path.startsWith(`${organization.path}/`) || newParent.id === organization.id) {
      throw new BadRequestException('Une organisation ne peut pas etre deplacee sous elle-meme.');
    }

    this.assertHierarchyAllowed(newParent, organization.type);

    const oldPath = organization.path;
    organization.parentId = newParent.id;
    organization.depth = newParent.depth + 1;
    organization.path = `${newParent.path}/${organization.id}`;
    await this.organizationRepository.save(organization);

    // Met a jour le chemin materialise des descendants.
    const descendants = await this.organizationRepository
      .createQueryBuilder('organization')
      .where('organization.path LIKE :path', { path: `${oldPath}/%` })
      .getMany();

    for (const descendant of descendants) {
      descendant.path = descendant.path.replace(oldPath, organization.path);
      descendant.depth = descendant.path.split('/').length - 2;
    }
    if (descendants.length > 0) {
      await this.organizationRepository.save(descendants);
    }
  }

  /** Contraintes de hierarchie : NATIONAL > REGION > AGENCY > STATION / ENTERPRISE. */
  private assertHierarchyAllowed(parent: Organization | null, childType: OrganizationType): void {
    if (!parent) {
      if (childType !== OrganizationType.NATIONAL) {
        throw new BadRequestException('Une organisation nationale est la racine de la hierarchie.');
      }
      return;
    }

    const allowedChildren: Record<OrganizationType, OrganizationType[]> = {
      [OrganizationType.NATIONAL]: [OrganizationType.NATIONAL, OrganizationType.REGION, OrganizationType.ENTERPRISE],
      [OrganizationType.REGION]: [OrganizationType.AGENCY],
      [OrganizationType.AGENCY]: [OrganizationType.STATION, OrganizationType.ENTERPRISE],
      [OrganizationType.STATION]: [],
      [OrganizationType.ENTERPRISE]: [OrganizationType.ENTERPRISE],
    };

    if (!allowedChildren[parent.type].includes(childType)) {
      throw new BadRequestException(
        `Une organisation de type ${childType} ne peut pas etre rattachee a une organisation de type ${parent.type}.`,
      );
    }
  }
}
