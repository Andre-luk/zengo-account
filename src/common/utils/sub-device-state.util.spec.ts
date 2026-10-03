import { decodeSubDeviceState } from './sub-device-state.util';

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
