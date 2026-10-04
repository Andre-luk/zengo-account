import { decodeSubDeviceState, encodeSubDeviceState } from './sub-device-state.util';

describe('decodeSubDeviceState', () => {
  it('interprete un etat nominal', () => {
    expect(decodeSubDeviceState('00000000')).toEqual({
      raw: '00000000',
      offline: false,
      tamper: false,
      lowBattery: false,
      open: false,
    });
  });

  it('detecte un contact ouvert (bit 7)', () => {
    expect(decodeSubDeviceState('00000001').open).toBe(true);
  });

  it('detecte une batterie faible (bit 6)', () => {
    expect(decodeSubDeviceState('00000010').lowBattery).toBe(true);
  });

  it('detecte un sabotage (bit 5)', () => {
    expect(decodeSubDeviceState('00000100').tamper).toBe(true);
  });

  it('detecte un sous-appareil hors ligne (bit 0)', () => {
    expect(decodeSubDeviceState('10000000').offline).toBe(true);
  });

  it('gere les etats cumules et les valeurs courtes', () => {
    const state = decodeSubDeviceState('10000111');
    expect(state.offline).toBe(true);
    expect(state.tamper).toBe(true);
    expect(state.lowBattery).toBe(true);
    expect(state.open).toBe(true);

    expect(decodeSubDeviceState('1').offline).toBe(true);
  });
});

describe('encodeSubDeviceState', () => {
  it('encode un etat nominal', () => {
    expect(encodeSubDeviceState('NORMAL')).toBe('00000000');
  });

  it('encode un contact ouvert (bit 7)', () => {
    expect(encodeSubDeviceState('OPEN')).toBe('00000001');
  });

  it('encode une batterie faible (bit 6)', () => {
    expect(encodeSubDeviceState('LOW_BATTERY')).toBe('00000010');
  });

  it('encode un sabotage (bit 5)', () => {
    expect(encodeSubDeviceState('TAMPER')).toBe('00000100');
  });

  it('fait l aller-retour avec le decodeur', () => {
    for (const state of ['NORMAL', 'OPEN', 'TAMPER', 'LOW_BATTERY'] as const) {
      const decoded = decodeSubDeviceState(encodeSubDeviceState(state));
      expect(decoded.open).toBe(state === 'OPEN');
      expect(decoded.tamper).toBe(state === 'TAMPER');
      expect(decoded.lowBattery).toBe(state === 'LOW_BATTERY');
    }
  });
});
