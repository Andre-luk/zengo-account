export const SERVER_PLATFORM = 'server';
export const DEVICE_PLATFORM = 'device';

export type MqttPlatform = typeof SERVER_PLATFORM | typeof DEVICE_PLATFORM;

/** Actions du protocole SafAlert (voir Safety_GuardMQTTDOCUMENT). */
export enum MqttAction {
  AUTH = 'auth',
  HEARTBEAT = 'heartbeat',
  ALARM = 'alarm',
  SYNC_SUBDEVICE = 'syncSubdevice',
  DEL_SUBDEVICE = 'delSubdevice',
  CHANGE_ARM_MODE = 'changeArmMode',
  OTA = 'ota',
  OTA_PROGRESS = 'otaProgress',
}

/** Construit un topic `{prefix}/{SN}/{platform}/{action}`. */
export const buildTopic = (
  prefix: string,
  serialNumber: string,
  platform: MqttPlatform,
  action: MqttAction,
): string => `${prefix}/${serialNumber}/${platform}/${action}`;

export interface ParsedTopic {
  prefix: string;
  serialNumber: string;
  platform: string;
  action: string;
}

/** Analyse un topic entrant ; retourne `null` si le format est inattendu. */
export const parseTopic = (topic: string): ParsedTopic | null => {
  const parts = topic.split('/');
  if (parts.length < 4) return null;
  const [prefix, serialNumber, platform, ...rest] = parts;
  if (!prefix || !serialNumber || !platform || rest.length === 0) return null;
  return { prefix, serialNumber, platform, action: rest.join('/') };
};
