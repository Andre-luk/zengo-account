import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { connect, MqttClient } from 'mqtt';
import { Subscription } from 'rxjs';
import { SubDeviceCode } from '@common/enums/device.enum';
import { Device } from '@database/entities/device.entity';
import { AlertsService } from '@modules/alerts/alerts.service';
import { DeviceCommand, DeviceCommandBus } from '@modules/devices/device-command.bus';
import { DevicesService } from '@modules/devices/devices.service';
import {
  buildTopic,
  DEVICE_PLATFORM,
  MqttAction,
  MqttPlatform,
  parseTopic,
  SERVER_PLATFORM,
} from '@modules/iot/mqtt-topics';

interface SafAlertAuthPayload {
  sign?: string;
}

interface SafAlertHeartbeatPayload {
  token?: string;
  ver?: number;
  list?: Array<{ id: string; state: string }>;
}

interface SafAlertSubDevicePayload {
  token?: string;
  list?: Array<{ id: string; name: string; area_name?: string; code: string }>;
}

interface SafAlertDelSubDevicePayload {
  token?: string;
  ids?: string[];
}

interface SafAlertChangeArmModePayload {
  token?: string;
  mode?: number;
  way?: number;
}

interface SafAlertAlarmPayload {
  token?: string;
  id?: string;
  message?: string;
  name?: string;
  type?: number;
}

/**
 * Passerelle MQTT avec les kits SafAlert Solar G1.
 *
 * Implemente le protocole decrit dans `Safety_GuardMQTTDOCUMENT.pdf` :
 *   topics  : {prefix}/{SN}/{platform}/{action}
 *   actions : auth, heartbeat, alarm, syncSubdevice, delSubdevice, changeArmMode, ota
 *
 * Entrant  : la passerelle alimente DevicesService (heartbeat, etats des
 *            sous-appareils, alarmes).
 * Sortant  : elle ecoute le DeviceCommandBus et traduit les intentions du
 *            domaine en publications MQTT.
 *
 * La connexion est desactivee par defaut (`MQTT_ENABLED=false`) afin que
 * l'application demarre sans broker ; en production, renseigner MQTT_URL,
 * MQTT_USERNAME et MQTT_PASSWORD.
 */
@Injectable()
export class MqttService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MqttService.name);
  private client: MqttClient | null = null;
  private commandSubscription: Subscription | null = null;
  private readonly prefix: string;
  private readonly enabled: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly devicesService: DevicesService,
    private readonly alertsService: AlertsService,
    private readonly commandBus: DeviceCommandBus,
  ) {
    this.prefix = this.configService.get<string>('app.mqtt.topicPrefix', 'sg');
    this.enabled = this.configService.get<boolean>('app.mqtt.enabled', false);
  }

  onModuleInit(): void {
    this.commandSubscription = this.commandBus.subscribe((command) => this.dispatch(command));

    if (!this.enabled) {
      this.logger.log('Passerelle MQTT desactivee (MQTT_ENABLED=false).');
      return;
    }

    const url = this.configService.get<string>('app.mqtt.url', 'mqtt://localhost:1883');
    const username = this.configService.get<string>('app.mqtt.username');
    const password = this.configService.get<string>('app.mqtt.password');

    this.client = connect(url, {
      username: username || undefined,
      password: password || undefined,
      clean: true,
      reconnectPeriod: 5_000,
    });

    this.client.on('connect', () => {
      this.logger.log(`Connecte au broker MQTT : ${url}`);
      this.client?.subscribe(`${this.prefix}/+/${DEVICE_PLATFORM}/+`, { qos: 1 }, (error) => {
        if (error) this.logger.error(`Abonnement MQTT impossible : ${error.message}`);
      });
    });

    this.client.on('message', (topic, payload) => {
      void this.handleMessage(topic, payload.toString());
    });

    this.client.on('error', (error) => this.logger.error(`Erreur MQTT : ${error.message}`));
  }

  onModuleDestroy(): void {
    this.commandSubscription?.unsubscribe();
    this.client?.end(true);
  }

  // ---------------------------------------------------------------------------
  // Sortant : traduction des intentions du domaine
  // ---------------------------------------------------------------------------

  private dispatch(command: DeviceCommand): void {
    switch (command.type) {
      case 'ARM_MODE':
        this.publish(command.serialNumber, SERVER_PLATFORM, MqttAction.CHANGE_ARM_MODE, command.payload);
        break;
      case 'TRIGGER_ALARM':
        this.publish(command.serialNumber, SERVER_PLATFORM, MqttAction.ALARM, command.payload);
        break;
      case 'DEVICE_AUTH':
        this.publish(command.serialNumber, SERVER_PLATFORM, MqttAction.AUTH, command.payload);
        break;
      case 'SYNC_SUBDEVICES':
        this.publish(command.serialNumber, SERVER_PLATFORM, MqttAction.SYNC_SUBDEVICE, command.payload);
        break;
      case 'FIRMWARE_UPDATE':
        this.publish(command.serialNumber, SERVER_PLATFORM, MqttAction.OTA, command.payload);
        break;
      default:
        this.logger.debug(`Commande dispositif non geree : ${String(command.type)}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Entrant : traitement des messages des centrales
  // ---------------------------------------------------------------------------

  private async handleMessage(topic: string, rawPayload: string): Promise<void> {
    const parsed = parseTopic(topic);
    if (!parsed || parsed.platform !== DEVICE_PLATFORM) return;

    let payload: Record<string, unknown>;
    try {
      payload = rawPayload ? (JSON.parse(rawPayload) as Record<string, unknown>) : {};
    } catch {
      this.logger.warn(`Payload MQTT illisible sur ${topic}`);
      return;
    }

    try {
      switch (parsed.action) {
        case MqttAction.AUTH:
          await this.handleAuth(parsed.serialNumber, payload as SafAlertAuthPayload);
          break;
        case MqttAction.HEARTBEAT:
          await this.handleHeartbeat(parsed.serialNumber, payload as SafAlertHeartbeatPayload);
          break;
        case MqttAction.ALARM:
          await this.handleAlarm(parsed.serialNumber, payload as SafAlertAlarmPayload);
          break;
        case MqttAction.SYNC_SUBDEVICE:
          await this.handleSyncSubDevice(parsed.serialNumber, payload as SafAlertSubDevicePayload);
          break;
        case MqttAction.DEL_SUBDEVICE:
          await this.handleDeleteSubDevice(parsed.serialNumber, payload as SafAlertDelSubDevicePayload);
          break;
        case MqttAction.CHANGE_ARM_MODE:
          await this.handleChangeArmMode(parsed.serialNumber, payload as SafAlertChangeArmModePayload);
          break;
        case MqttAction.OTA:
          await this.handleOtaRequest(parsed.serialNumber, payload as { ver?: number });
          break;
        default:
          this.logger.debug(`Action MQTT non geree : ${parsed.action}`);
      }
    } catch (error) {
      this.logger.error(
        `Echec du traitement MQTT (${topic}) : ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async handleAuth(serialNumber: string, payload: SafAlertAuthPayload): Promise<void> {
    const device = await this.devicesService.findBySerial(serialNumber);
    if (!device) {
      this.logger.warn(`auth recu pour un dispositif inconnu : ${serialNumber}`);
      return;
    }

    const token = await this.devicesService.storeNewToken(device.id);
    this.commandBus.publish({
      type: 'DEVICE_AUTH',
      serialNumber,
      payload: { token, time_string: this.formatTimeString(new Date()) },
    });

    this.logger.log(`Dispositif ${serialNumber} authentifie (signature : ${payload.sign ? 'oui' : 'non'}).`);
  }

  private async handleHeartbeat(serialNumber: string, payload: SafAlertHeartbeatPayload): Promise<void> {
    const device = await this.requireDevice(serialNumber, payload.token);
    if (!device) return;

    await this.devicesService.applyHeartbeat(device, payload);
  }

  private async handleAlarm(serialNumber: string, payload: SafAlertAlarmPayload): Promise<void> {
    const device = await this.requireDevice(serialNumber, payload.token);
    if (!device) return;

    await this.devicesService.touch(device.id);

    // Injection de l'alarme dans le pipeline du ZMC : creation de l'alerte,
    // diffusion temps reel, appel vocal IA et demarrage de la temporisation.
    const alert = await this.alertsService.ingestDeviceAlarm(device, {
      id: payload.id,
      message: payload.message,
      name: payload.name,
      type: payload.type,
    });

    this.logger.warn(
      `ALARME [${serialNumber}] ${alert.reference} [${alert.type}/${alert.severity}]` +
        `${alert.occurrenceCount > 1 ? ` (occurrence ${alert.occurrenceCount})` : ''} : ${
          payload.message ?? payload.name ?? 'sans description'
        }`,
    );
  }

  private async handleSyncSubDevice(
    serialNumber: string,
    payload: SafAlertSubDevicePayload,
  ): Promise<void> {
    const device = await this.requireDevice(serialNumber, payload.token);
    if (!device) return;

    const items = (payload.list ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      areaName: item.area_name,
      code: item.code as SubDeviceCode,
    }));

    await this.devicesService.upsertSubDevices(device.id, items);
    this.logger.log(`Sous-appareils synchronises pour ${serialNumber} : ${items.length}.`);
  }

  private async handleDeleteSubDevice(
    serialNumber: string,
    payload: SafAlertDelSubDevicePayload,
  ): Promise<void> {
    const device = await this.requireDevice(serialNumber, payload.token);
    if (!device) return;

    const removed = await this.devicesService.removeSubDevices(device.id, payload.ids ?? []);
    this.logger.log(`Sous-appareils supprimes pour ${serialNumber} : ${removed}.`);
  }

  private async handleChangeArmMode(
    serialNumber: string,
    payload: SafAlertChangeArmModePayload,
  ): Promise<void> {
    const device = await this.requireDevice(serialNumber, payload.token);
    if (!device) return;

    if (payload.mode !== undefined && [0, 1, 2].includes(payload.mode)) {
      await this.devicesService.recordArmMode(device.id, payload.mode, payload.way);
      this.logger.log(`Changement de mode (${payload.mode}) signale par ${serialNumber}.`);
    }
  }

  private async handleOtaRequest(serialNumber: string, payload: { ver?: number }): Promise<void> {
    const device = await this.devicesService.findBySerial(serialNumber);
    if (!device) return;

    this.logger.log(`Demande de mise a jour OTA de ${serialNumber} (version ${payload.ver ?? '?'}).`);
    // TODO : publier l'URL de firmware signee lorsque le serveur OTA sera en place.
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async requireDevice(serialNumber: string, token?: string): Promise<Device | null> {
    if (!token) {
      this.logger.warn(`Token manquant pour ${serialNumber}.`);
      return null;
    }
    return this.devicesService.validateDeviceToken(serialNumber, token);
  }

  private publish(
    serialNumber: string,
    platform: MqttPlatform,
    action: MqttAction,
    payload: Record<string, unknown>,
  ): void {
    const topic = buildTopic(this.prefix, serialNumber, platform, action);
    if (!this.client) {
      this.logger.debug(`MQTT inactif - publication ignoree : ${topic} ${JSON.stringify(payload)}`);
      return;
    }
    this.client.publish(topic, JSON.stringify(payload), { qos: 1 });
  }

  private formatTimeString(date: Date): string {
    const pad = (value: number) => String(value).padStart(2, '0');
    return (
      `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
      `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
    );
  }
}
