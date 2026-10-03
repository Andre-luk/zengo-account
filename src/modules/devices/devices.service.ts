import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { buildPaginatedResult } from '@common/dto/pagination.dto';
import { ArmMode, DeviceStatus } from '@common/enums/device.enum';
import { AuthenticatedUser } from '@common/interfaces/authenticated-user.interface';
import { generateOpaqueToken, sha256 } from '@common/utils/identifier.util';
import { decodeSubDeviceState } from '@common/utils/sub-device-state.util';
import { Device } from '@database/entities/device.entity';
import { SubDevice } from '@database/entities/sub-device.entity';
import { DeviceCommandBus } from '@modules/devices/device-command.bus';
import { OrganizationScopeService } from '@modules/organizations/organizations.service';
import {
  CreateDeviceDto,
  QueryDevicesDto,
  SubDeviceDto,
  UpdateDeviceDto,
} from '@modules/devices/dto/device.dto';

/** Re-export pour les consommateurs historiques (tests, module IoT). */
export { decodeSubDeviceState };

@Injectable()
export class DevicesService {
  private readonly logger = new Logger(DevicesService.name);

  constructor(
    @InjectRepository(Device)
    private readonly devicesRepository: Repository<Device>,
    @InjectRepository(SubDevice)
    private readonly subDevicesRepository: Repository<SubDevice>,
    private readonly scopeService: OrganizationScopeService,
    private readonly commandBus: DeviceCommandBus,
  ) {}

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  async create(actor: AuthenticatedUser, dto: CreateDeviceDto): Promise<Device> {
    const existing = await this.devicesRepository.findOne({ where: { serialNumber: dto.serialNumber } });
    if (existing) throw new ConflictException('Un dispositif avec ce numero de serie existe deja.');

    if (dto.organizationId) {
      await this.scopeService.assertInScope(actor, dto.organizationId);
    }

    const device = this.devicesRepository.create({
      serialNumber: dto.serialNumber,
      model: dto.model ?? 'SafAlert Solar G1',
      imei: dto.imei ?? null,
      simNumber: dto.simNumber ?? null,
      alarmPhoneNumber: dto.alarmPhoneNumber ?? null,
      organizationId: dto.organizationId ?? actor.primaryOrganizationId ?? null,
      language: dto.language,
      status: DeviceStatus.PROVISIONED,
      armMode: ArmMode.DISARMED,
    });

    return this.devicesRepository.save(device);
  }

  async findAll(actor: AuthenticatedUser, query: QueryDevicesDto) {
    const scope = await this.scopeService.getAccessibleOrganizationIds(actor);
    if (scope !== null && scope.length === 0) {
      return buildPaginatedResult<Device>([], 0, query.page, query.limit);
    }

    const builder = this.devicesRepository
      .createQueryBuilder('device')
      .leftJoinAndSelect('device.client', 'client')
      .leftJoinAndSelect('device.organization', 'organization');

    if (scope !== null) {
      builder.andWhere('device.organizationId IN (:...scope)', { scope });
    }
    if (query.status) builder.andWhere('device.status = :status', { status: query.status });
    if (query.armMode !== undefined) builder.andWhere('device.armMode = :armMode', { armMode: query.armMode });
    if (query.organizationId) {
      builder.andWhere('device.organizationId = :organizationId', { organizationId: query.organizationId });
    }
    if (query.clientId) builder.andWhere('device.clientId = :clientId', { clientId: query.clientId });
    if (query.unassignedOnly) builder.andWhere('device.clientId IS NULL');
    if (query.search) {
      builder.andWhere(
        '(device.serialNumber ILIKE :search OR device.imei ILIKE :search OR device.simNumber ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }

    builder
      .orderBy('device.createdAt', query.order.toUpperCase() as 'ASC' | 'DESC')
      .skip(query.skip)
      .take(query.limit);

    const [items, total] = await builder.getManyAndCount();
    return buildPaginatedResult(items, total, query.page, query.limit);
  }

  async findOne(actor: AuthenticatedUser, id: string): Promise<Device> {
    const device = await this.getByIdOrFail(id);
    if (device.organizationId) await this.scopeService.assertInScope(actor, device.organizationId);
    return device;
  }

  async getByIdOrFail(id: string): Promise<Device> {
    const device = await this.devicesRepository.findOne({
      where: { id },
      relations: { client: true, organization: true, subDevices: true },
    });
    if (!device) throw new NotFoundException('Dispositif introuvable.');
    return device;
  }

  async findBySerial(serialNumber: string): Promise<Device | null> {
    return this.devicesRepository.findOne({
      where: { serialNumber },
      relations: { client: true, organization: true, subDevices: true },
    });
  }

  /** Recherche incluant l'empreinte du token (usage authentification MQTT). */
  async findBySerialWithToken(serialNumber: string): Promise<Device | null> {
    return this.devicesRepository
      .createQueryBuilder('device')
      .addSelect('device.tokenHash')
      .leftJoinAndSelect('device.client', 'client')
      .where('device.serialNumber = :serialNumber', { serialNumber })
      .getOne();
  }

  async update(actor: AuthenticatedUser, id: string, dto: UpdateDeviceDto): Promise<Device> {
    const device = await this.findOne(actor, id);

    if (dto.organizationId && dto.organizationId !== device.organizationId) {
      await this.scopeService.assertInScope(actor, dto.organizationId);
      device.organizationId = dto.organizationId;
    }

    Object.assign(device, {
      model: dto.model ?? device.model,
      imei: dto.imei !== undefined ? dto.imei : device.imei,
      simNumber: dto.simNumber !== undefined ? dto.simNumber : device.simNumber,
      alarmPhoneNumber:
        dto.alarmPhoneNumber !== undefined ? dto.alarmPhoneNumber : device.alarmPhoneNumber,
      language: dto.language ?? device.language,
      firmwareTargetVersion:
        dto.firmwareTargetVersion !== undefined ? dto.firmwareTargetVersion : device.firmwareTargetVersion,
    });

    return this.devicesRepository.save(device);
  }

  async updateStatus(actor: AuthenticatedUser, id: string, status: DeviceStatus): Promise<Device> {
    const device = await this.findOne(actor, id);
    device.status = status;

    if (status === DeviceStatus.DISABLED) {
      // "If the device is disabled, the token can be set to empty."
      await this.devicesRepository
        .createQueryBuilder()
        .update(Device)
        .set({ tokenHash: null })
        .where('id = :id', { id: device.id })
        .execute();
    }

    return this.devicesRepository.save(device);
  }

  /** Regenere le token du dispositif (le prochain `auth` renverra le nouveau). */
  async regenerateToken(actor: AuthenticatedUser, id: string): Promise<{ token: string }> {
    const device = await this.findOne(actor, id);
    const token = await this.storeNewToken(device.id);

    if (device.status === DeviceStatus.DISABLED) {
      device.status = DeviceStatus.PROVISIONED;
      await this.devicesRepository.save(device);
    }

    return { token };
  }

  // ---------------------------------------------------------------------------
  // Armement / desarmement (topic `changeArmMode`)
  // ---------------------------------------------------------------------------

  async setArmMode(
    actor: AuthenticatedUser,
    id: string,
    mode: ArmMode,
    way?: number,
  ): Promise<{
    device: Device;
    command: { type: 'ARM_MODE'; payload: Record<string, unknown> };
  }> {
    const device = await this.findOne(actor, id);
    device.armMode = mode;
    await this.devicesRepository.save(device);

    const payload: Record<string, unknown> = { mode, ...(way ? { way } : {}) };
    this.commandBus.publish({ type: 'ARM_MODE', serialNumber: device.serialNumber, payload });

    return { device, command: { type: 'ARM_MODE', payload } };
  }

  /** Enregistre un changement de mode signale par la centrale (retour MQTT). */
  async recordArmMode(deviceId: string, mode: number, way?: number): Promise<void> {
    if (![ArmMode.DISARMED, ArmMode.AWAY, ArmMode.STAY].includes(mode as ArmMode)) return;

    await this.devicesRepository.update(deviceId, {
      armMode: mode as ArmMode,
      lastSeenAt: new Date(),
    });
    this.logger.log(
      `Mode d armement du dispositif ${deviceId} mis a jour : ${mode}${way ? ` (way=${way})` : ''}.`,
    );
  }

  // ---------------------------------------------------------------------------
  // Sous-appareils (topics `syncSubdevice` / `delSubdevice`)
  // ---------------------------------------------------------------------------

  async listSubDevices(actor: AuthenticatedUser, deviceId: string) {
    const device = await this.findOne(actor, deviceId);
    const subDevices = await this.subDevicesRepository.find({
      where: { deviceId: device.id },
      order: { name: 'ASC' },
    });
    return subDevices.map((subDevice) => ({
      ...subDevice,
      decodedState: decodeSubDeviceState(subDevice.state),
    }));
  }

  /** Enregistre (upsert) les sous-appareils declares par la centrale. */
  async upsertSubDevices(deviceId: string, items: SubDeviceDto[]): Promise<SubDevice[]> {
    const saved: SubDevice[] = [];

    for (const item of items) {
      let subDevice = await this.subDevicesRepository.findOne({
        where: { deviceId, subId: item.id },
      });
      if (!subDevice) {
        subDevice = this.subDevicesRepository.create({
          deviceId,
          subId: item.id,
          name: item.name,
          areaName: item.areaName ?? null,
          code: item.code,
        });
      } else {
        subDevice.name = item.name;
        subDevice.areaName = item.areaName ?? subDevice.areaName;
        subDevice.code = item.code;
      }
      subDevice.lastSeenAt = new Date();
      saved.push(await this.subDevicesRepository.save(subDevice));
    }

    return saved;
  }

  /** Supprime des sous-appareils (`ffffffff` = tous). */
  async removeSubDevices(deviceId: string, ids: string[]): Promise<number> {
    if (ids.some((id) => id.toLowerCase() === 'ffffffff')) {
      const result = await this.subDevicesRepository.delete({ deviceId });
      return result.affected ?? 0;
    }
    if (ids.length === 0) return 0;
    const result = await this.subDevicesRepository.delete({ deviceId, subId: In(ids) });
    return result.affected ?? 0;
  }

  // ---------------------------------------------------------------------------
  // Traitement des messages entrants (appele par le module IoT)
  // ---------------------------------------------------------------------------

  /** Applique un heartbeat : met a jour les etats et la disponibilite du dispositif. */
  async applyHeartbeat(
    device: Device,
    payload: { ver?: number; list?: Array<{ id: string; state: string }> },
  ): Promise<void> {
    const now = new Date();

    device.lastSeenAt = now;
    device.lastHeartbeatAt = now;
    if (typeof payload.ver === 'number') device.firmwareVersion = payload.ver;
    // Un heartbeat prouve que la centrale est joignable : un dispositif marque
    // hors ligne par la supervision de presence repasse automatiquement actif.
    if (device.status === DeviceStatus.PROVISIONED || device.status === DeviceStatus.OFFLINE) {
      device.status = DeviceStatus.ACTIVE;
    }
    await this.devicesRepository.save(device);

    for (const entry of payload.list ?? []) {
      const subDevice = await this.subDevicesRepository.findOne({
        where: { deviceId: device.id, subId: entry.id },
      });
      if (!subDevice) continue;
      const changed = subDevice.state !== entry.state;
      subDevice.state = entry.state;
      subDevice.lastSeenAt = now;
      if (changed) subDevice.lastStateChangeAt = now;
      await this.subDevicesRepository.save(subDevice);
    }
  }

  /** Verifie le token presente par un dispositif lors de `auth`. */
  async validateDeviceToken(serialNumber: string, token: string): Promise<Device | null> {
    const device = await this.findBySerialWithToken(serialNumber);
    if (!device?.tokenHash) return null;
    return device.tokenHash === sha256(token) ? device : null;
  }

  /** Emet (et stocke) un nouveau token pour un dispositif. */
  async storeNewToken(deviceId: string): Promise<string> {
    const token = generateOpaqueToken(24);
    await this.devicesRepository
      .createQueryBuilder()
      .update(Device)
      .set({ tokenHash: sha256(token) })
      .where('id = :id', { id: deviceId })
      .execute();
    return token;
  }

  /** Marque un dispositif comme hors ligne (tache planifiee). */
  async markOffline(deviceId: string): Promise<void> {
    await this.devicesRepository.update(deviceId, { status: DeviceStatus.OFFLINE });
  }

  async touch(deviceId: string): Promise<void> {
    await this.devicesRepository.update(deviceId, { lastSeenAt: new Date() });
    this.logger.debug(`Dispositif ${deviceId} actif.`);
  }
}
