import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '@common/interfaces/authenticated-user.interface';
import { ArmMode, SubDeviceCode } from '@common/enums/device.enum';
import { Device } from '@database/entities/device.entity';
import { SubDevice } from '@database/entities/sub-device.entity';
import {
  decodeSubDeviceState,
  DecodedSubDeviceState,
  encodeSubDeviceState,
} from '@common/utils/sub-device-state.util';
import { OrganizationScopeService } from '@modules/organizations/organizations.service';
import { AlertsService } from '@modules/alerts/alerts.service';
import { DevicesService } from '@modules/devices/devices.service';
import {
  SCENARIO_MESSAGE,
  SCENARIO_SUB_DEVICE,
  SimulateAlarmDto,
  SimulateArmModeDto,
  SimulateHeartbeatDto,
} from '@modules/simulation/dto/simulation.dto';

/** Sous-appareil tel que le banc d'essai le presente a l'operateur. */
export interface SimulatedSubDevice {
  id: string;
  subId: string;
  code: SubDeviceCode;
  name: string;
  areaName: string | null;
  state: string;
  decoded: DecodedSubDeviceState;
  lastSeenAt: Date | null;
}

/** Kit complet : ce que voit l'operateur avant de declencher. */
export interface SimulatedKit {
  id: string;
  serialNumber: string;
  status: string;
  armMode: ArmMode;
  firmwareVersion: number | null;
  lastSeenAt: Date | null;
  lastHeartbeatAt: Date | null;
  client: {
    id: string;
    zengoId: string;
    fullName: string;
    phone: string | null;
    address: string | null;
    city: string | null;
  } | null;
  organizationName: string | null;
  subDevices: SimulatedSubDevice[];
}

/**
 * Banc d'essai du materiel SafAlert.
 *
 * Le service ne rejoue pas une logique parallele : il emprunte **exactement**
 * le meme chemin que la passerelle MQTT (`devicesService.applyHeartbeat` et
 * `alertsService.ingestDeviceAlarm`). Tout ce que fait la console est donc
 * strictement identique a ce que produirait un vrai kit : meme type d'alerte
 * deduit du capteur, meme source SENSOR, meme appel vocal, meme temporisation.
 */
@Injectable()
export class SimulationService {
  private readonly logger = new Logger(SimulationService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly devicesService: DevicesService,
    private readonly alertsService: AlertsService,
    private readonly scopeService: OrganizationScopeService,
    @InjectRepository(Device) private readonly deviceRepository: Repository<Device>,
    @InjectRepository(SubDevice) private readonly subDeviceRepository: Repository<SubDevice>,
  ) {}

  /** Le banc d'essai n'existe pas hors developpement/demonstration. */
  get enabled(): boolean {
    return this.configService.get<boolean>('app.simulation.enabled', false);
  }

  private assertEnabled(): void {
    if (!this.enabled) {
      throw new NotFoundException("Le banc d'essai est desactive sur cette installation.");
    }
  }

  // ---------------------------------------------------------------------------
  // Consultation
  // ---------------------------------------------------------------------------

  /** Kits visibles par l'utilisateur, avec leurs capteurs et leur etat. */
  async listKits(actor: AuthenticatedUser, search?: string): Promise<SimulatedKit[]> {
    this.assertEnabled();

    const scope = await this.scopeService.getAccessibleOrganizationIds(actor);
    if (scope !== null && scope.length === 0) return [];

    const builder = this.deviceRepository
      .createQueryBuilder('device')
      .leftJoinAndSelect('device.client', 'client')
      .leftJoinAndSelect('device.organization', 'organization')
      .leftJoinAndSelect('device.subDevices', 'subDevice');

    if (scope !== null) builder.andWhere('device.organizationId IN (:...scope)', { scope });
    if (search) {
      builder.andWhere('(device.serialNumber ILIKE :search OR client.fullName ILIKE :search)', {
        search: `%${search}%`,
      });
    }

    // Les kits rattaches a un client d'abord : ce sont eux qui se pretent a la demo.
    const devices = await builder
      .orderBy('device.clientId', 'DESC')
      .addOrderBy('device.serialNumber', 'ASC')
      .take(50)
      .getMany();

    return devices.map((device) => this.toKit(device));
  }

  /** Detail d'un kit. */
  async getKit(actor: AuthenticatedUser, deviceId: string): Promise<SimulatedKit> {
    this.assertEnabled();
    const device = await this.devicesService.getByIdOrFail(deviceId);
    if (device.organizationId) await this.scopeService.assertInScope(actor, device.organizationId);
    const subDevices = await this.subDeviceRepository.find({
      where: { deviceId },
      order: { name: 'ASC' },
    });
    return this.toKit(Object.assign(device, { subDevices }));
  }

  // ---------------------------------------------------------------------------
  // Le kit parle
  // ---------------------------------------------------------------------------

  /** Le kit se declare en ligne et remonte l'etat de ses capteurs. */
  async sendHeartbeat(
    actor: AuthenticatedUser,
    deviceId: string,
    dto: SimulateHeartbeatDto,
  ): Promise<SimulatedKit> {
    this.assertEnabled();
    const device = await this.devicesService.findOne(actor, deviceId);

    const subDevices = await this.subDeviceRepository.find({ where: { deviceId } });
    if (subDevices.length === 0) {
      throw new NotFoundException('Ce kit ne declare aucun capteur.');
    }

    const target = dto.subDeviceCode
      ? subDevices.find((item) => item.code === dto.subDeviceCode)
      : subDevices[0];
    if (!target) throw new NotFoundException(`Aucun capteur ${dto.subDeviceCode} sur ce kit.`);

    await this.devicesService.applyHeartbeat(device, {
      ver: dto.firmwareVersion ?? device.firmwareVersion ?? 1002,
      list: [{ id: target.subId, state: encodeSubDeviceState(dto.state ?? 'NORMAL') }],
    });

    this.logger.log(
      `Banc d'essai : heartbeat du kit ${device.serialNumber} (${target.name} = ${dto.state ?? 'NORMAL'}).`,
    );
    return this.getKit(actor, deviceId);
  }

  /** Le kit annonce un nouveau mode d'armement (retour `changeArmMode`). */
  async setArmMode(
    actor: AuthenticatedUser,
    deviceId: string,
    dto: SimulateArmModeDto,
  ): Promise<SimulatedKit> {
    this.assertEnabled();
    await this.devicesService.recordArmMode(deviceId, dto.armMode);
    this.logger.log(`Banc d'essai : kit ${deviceId} passe en mode ${ArmMode[dto.armMode]}.`);
    return this.getKit(actor, deviceId);
  }

  /**
   * Le capteur se declenche : l'alarme entre dans le pipeline du ZMC par le
   * meme appel que celui utilise par la passerelle MQTT.
   */
  async triggerAlarm(actor: AuthenticatedUser, deviceId: string, dto: SimulateAlarmDto) {
    this.assertEnabled();
    const device = await this.devicesService.findOne(actor, deviceId);

    const code = dto.subDeviceCode ?? (dto.scenario ? SCENARIO_SUB_DEVICE[dto.scenario] : null);
    const subDevices = await this.subDeviceRepository.find({ where: { deviceId } });
    const subDevice = code
      ? subDevices.find((item) => item.code === code)
      : subDevices.find((item) => item.code === SubDeviceCode.DC) ?? subDevices[0];

    if (!subDevice) {
      throw new NotFoundException(
        code ? `Ce kit ne possede aucun capteur ${code}.` : 'Ce kit ne declare aucun capteur.',
      );
    }

    await this.devicesService.touch(device.id);

    const message =
      dto.message ?? (dto.scenario ? SCENARIO_MESSAGE[dto.scenario] : "Declenchement du capteur pendant l'armement.");

    const alert = await this.alertsService.ingestDeviceAlarm(
      device,
      { id: subDevice.subId, name: subDevice.name, message, type: 0 },
      { autoVoiceCall: dto.autoVoiceCall },
    );

    this.logger.warn(
      `Banc d'essai : alarme simulee sur ${device.serialNumber} -> ${alert.reference} ` +
        `[${alert.type}/${alert.severity}]${alert.occurrenceCount > 1 ? ` (occurrence ${alert.occurrenceCount})` : ''}`,
    );

    return alert;
  }

  // ---------------------------------------------------------------------------
  // Interne
  // ---------------------------------------------------------------------------

  private toKit(device: Device & { subDevices?: SubDevice[] }): SimulatedKit {
    return {
      id: device.id,
      serialNumber: device.serialNumber,
      status: device.status,
      armMode: device.armMode,
      firmwareVersion: device.firmwareVersion ?? null,
      lastSeenAt: device.lastSeenAt ?? null,
      lastHeartbeatAt: device.lastHeartbeatAt ?? null,
      client: device.client
        ? {
            id: device.client.id,
            zengoId: device.client.zengoId,
            fullName: device.client.fullName,
            phone: device.client.primaryPhone ?? null,
            address: device.client.address ?? null,
            city: device.client.city ?? null,
          }
        : null,
      organizationName: device.organization?.name ?? null,
      subDevices: (device.subDevices ?? []).map((subDevice) => ({
        id: subDevice.id,
        subId: subDevice.subId,
        code: subDevice.code,
        name: subDevice.name,
        areaName: subDevice.areaName ?? null,
        state: subDevice.state,
        decoded: decodeSubDeviceState(subDevice.state),
        lastSeenAt: subDevice.lastSeenAt ?? null,
      })),
    };
  }
}
