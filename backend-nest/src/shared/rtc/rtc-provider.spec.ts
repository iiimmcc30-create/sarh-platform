import { getRtcProvider } from './rtc-provider';

describe('RTC provider selection', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  it('defaults to livekit; only an explicit agora (any case/space) selects agora', () => {
    delete process.env.RTC_PROVIDER;
    expect(getRtcProvider()).toBe('livekit');
    process.env.RTC_PROVIDER = ' Agora ';
    expect(getRtcProvider()).toBe('agora');
    process.env.RTC_PROVIDER = 'nonsense';
    expect(getRtcProvider()).toBe('livekit');
  });

  it('is read on every call, so flipping the env switches NEW sessions with no code change', () => {
    process.env.RTC_PROVIDER = 'livekit';
    expect(getRtcProvider()).toBe('livekit');
    process.env.RTC_PROVIDER = 'agora';
    expect(getRtcProvider()).toBe('agora');
  });
});
