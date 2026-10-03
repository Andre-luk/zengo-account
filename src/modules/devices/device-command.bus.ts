import { Injectable } from '@nestjs/common';
import { Subject, Subscription } from 'rxjs';

/** Intentions de commande adressees a un dispositif SafAlert. */
export type DeviceCommandType =
  | 'ARM_MODE'
  | 'TRIGGER_ALARM'
  | 'DEVICE_AUTH'
  | 'SYNC_SUBDEVICES'
  | 'FIRMWARE_UPDATE';

export interface DeviceCommand {
  type: DeviceCommandType;
  serialNumber: string;
  payload: Record<string, unknown>;
}

/**
 * Bus interne de commandes dispositif.
 *
 * Le domaine (DevicesService) publie des *intentions* ; l'infrastructure
 * (module IoT / MQTT) les traduit en messages du protocole SafAlert. Cette
 * separation evite une dependance circulaire entre le module Devices et le
 * module IoT, et permet de tester le domaine sans broker MQTT.
 */
@Injectable()
export class DeviceCommandBus {
  private readonly subject = new Subject<DeviceCommand>();

  publish(command: DeviceCommand): void {
    this.subject.next(command);
  }

  subscribe(handler: (command: DeviceCommand) => void): Subscription {
    return this.subject.subscribe(handler);
  }
}
