import { describeSessionDevice, maskIp } from './session-device';

describe('session device display', () => {
  it('labels common user agents', () => {
    expect(
      describeSessionDevice('Sarh/1 CFNetwork/1490 Darwin/23.0.0').platform,
    ).toBe('ios');
    expect(describeSessionDevice('okhttp/4.12.0')).toEqual({
      label: 'Android',
      platform: 'android',
    });
    expect(
      describeSessionDevice(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128 Safari/537.36',
      ),
    ).toEqual({ label: 'Chrome · Windows', platform: 'web' });
    expect(describeSessionDevice(null).platform).toBe('unknown');
  });

  it('coarsens IPs', () => {
    expect(maskIp('::ffff:185.12.34.56')).toBe('185.12.*.*');
    expect(maskIp('2001:db8:85a3::8a2e')).toBe('2001:db8:…');
    expect(maskIp(null)).toBeNull();
  });
});
