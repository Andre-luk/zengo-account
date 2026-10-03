import { buildTopic, DEVICE_PLATFORM, MqttAction, parseTopic, SERVER_PLATFORM } from './mqtt-topics';

describe('buildTopic', () => {
  it('respecte le format {prefix}/{SN}/{platform}/{action}', () => {
    expect(buildTopic('sg', '3003004fba2394', DEVICE_PLATFORM, MqttAction.ALARM)).toBe(
      'sg/3003004fba2394/device/alarm',
    );
    expect(buildTopic('sg', '3003004fba2394', SERVER_PLATFORM, MqttAction.CHANGE_ARM_MODE)).toBe(
      'sg/3003004fba2394/server/changeArmMode',
    );
  });

  it('utilise un prefixe configurable', () => {
    expect(buildTopic('zengo', 'ABC123', DEVICE_PLATFORM, MqttAction.HEARTBEAT)).toBe(
      'zengo/ABC123/device/heartbeat',
    );
  });
});

describe('parseTopic', () => {
  it('analyse un topic conforme', () => {
    expect(parseTopic('sg/3003004fba2394/device/alarm')).toEqual({
      prefix: 'sg',
      serialNumber: '3003004fba2394',
      platform: 'device',
      action: 'alarm',
    });
  });

  it('reconstruit les actions composees', () => {
    expect(parseTopic('sg/SN1/server/syncSubdevice')?.action).toBe('syncSubdevice');
    expect(parseTopic('sg/SN1/device/ota/progress')?.action).toBe('ota/progress');
  });

  it('rejette les topics malformes', () => {
    expect(parseTopic('sg')).toBeNull();
    expect(parseTopic('sg/SN1/device')).toBeNull();
    expect(parseTopic('sg//device/alarm')).toBeNull();
  });

  it('est l inverse de buildTopic', () => {
    const topic = buildTopic('sg', 'SN42', DEVICE_PLATFORM, MqttAction.SYNC_SUBDEVICE);
    const parsed = parseTopic(topic);
    expect(parsed?.serialNumber).toBe('SN42');
    expect(parsed?.platform).toBe(DEVICE_PLATFORM);
    expect(parsed?.action).toBe(MqttAction.SYNC_SUBDEVICE);
  });
});
