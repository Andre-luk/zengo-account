import { SubDeviceStateBit } from '@common/enums/device.enum';

export interface DecodedSubDeviceState {
  raw: string;
  offline: boolean;
  tamper: boolean;
  lowBattery: boolean;
  open: boolean;
}

/**
 * Decode le champ `state` (8 caracteres) envoye par le heartbeat SafAlert.
 * Un bit a 1 signale l'anomalie correspondante ; `00000000` = tout est normal.
 *
 *   state[0] = 1 -> hors ligne
 *   state[5] = 1 -> sabotage (tamper)
 *   state[6] = 1 -> batterie faible
 *   state[7] = 1 -> contact ouvert (porte)
 */
export const decodeSubDeviceState = (state: string): DecodedSubDeviceState => {
  const bits = state.padEnd(8, '0').split('');
  return {
    raw: state,
    offline: bits[SubDeviceStateBit.OFFLINE] === '1',
    tamper: bits[SubDeviceStateBit.TAMPER] === '1',
    lowBattery: bits[SubDeviceStateBit.LOW_BATTERY] === '1',
    open: bits[SubDeviceStateBit.OPEN] === '1',
  };
};

/** Anomalies adressables par le banc d'essai (l'etat hors ligne vient du heartbeat lui-meme). */
export type SubDeviceAnomaly = 'NORMAL' | 'OPEN' | 'TAMPER' | 'LOW_BATTERY';

/**
 * Construit le champ `state` a partir d'un etat lisible : operation inverse de
 * `decodeSubDeviceState`, utilisee par le banc d'essai du materiel.
 */
export const encodeSubDeviceState = (state: SubDeviceAnomaly): string => {
  const bits = Array.from({ length: 8 }, () => '0');
  if (state === 'TAMPER') bits[SubDeviceStateBit.TAMPER] = '1';
  if (state === 'LOW_BATTERY') bits[SubDeviceStateBit.LOW_BATTERY] = '1';
  if (state === 'OPEN') bits[SubDeviceStateBit.OPEN] = '1';
  return bits.join('');
};
