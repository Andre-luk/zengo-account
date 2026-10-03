import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Repository } from 'typeorm';
import { DeviceStatus } from '@common/enums/device.enum';
import { Device } from '@database/entities/device.entity';

const PRESENCE_INTERVAL_NAME = 'device-presence-watchdog';

/**
 * Supervision de disponibilite du parc.
 *
 * Un dispositif qui n'a plus envoye de heartbeat au-dela du delai configure
 * (`DEVICE_OFFLINE_AFTER_SECONDS`) passe « hors ligne » : le ZMC et la console
 * technique voient immediatement les kits muets, et l'exploitation peut
 * planifier une intervention de maintenance.
 */
@Injectable()
export class DevicePresenceTask implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DevicePresenceTask.name);
  private running = false;

  constructor(
    @InjectRepository(Device)
    private readonly deviceRepository: Repository<Device>,
    private readonly configService: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  onModuleInit(): void {
    const intervalSeconds = this.configService.get<number>('app.devices.presenceIntervalSeconds', 60);

    const handle = setInterval(() => {
      void this.markSilentDevicesOffline();
    }, intervalSeconds * 1_000);

    this.schedulerRegistry.addInterval(PRESENCE_INTERVAL_NAME, handle);
  }

  onModuleDestroy(): void {
    if (this.schedulerRegistry.doesExist('interval', PRESENCE_INTERVAL_NAME)) {
      this.schedulerRegistry.deleteInterval(PRESENCE_INTERVAL_NAME);
    }
  }

  async markSilentDevicesOffline(): Promise<number> {
    if (this.running) return 0;
    this.running = true;

    try {
      const offlineAfterSeconds = this.configService.get<number>('app.devices.offlineAfterSeconds', 300);
      const threshold = new Date(Date.now() - offlineAfterSeconds * 1_000);

      const result = await this.deviceRepository
        .createQueryBuilder()
        .update(Device)
        .set({ status: DeviceStatus.OFFLINE })
        .where('status IN (:...statuses)', { statuses: [DeviceStatus.ACTIVE, DeviceStatus.PROVISIONED] })
        .andWhere('last_heartbeat_at IS NOT NULL')
        .andWhere('last_heartbeat_at < :threshold', { threshold })
        .execute();

      const affected = result.affected ?? 0;
      if (affected > 0) {
        this.logger.warn(`${affected} dispositif(s) marque(s) hors ligne (heartbeat obsolete).`);
      }
      return affected;
    } catch (error) {
      this.logger.error(
        `Echec de la supervision de presence : ${error instanceof Error ? error.message : String(error)}`,
      );
      return 0;
    } finally {
      this.running = false;
    }
  }
}
