import { LivestreamsService } from './livestreams.service';
import * as livekit from '../shared/rtc/livekit';

jest.mock('../shared/rtc/livekit', () => ({
  ...jest.requireActual('../shared/rtc/livekit'),
  listLivekitIdentities: jest.fn(),
  createLivekitToken: jest.fn(async () => 'jwt'),
}));

const ID = '11111111-2222-4333-8444-555555555555';

describe('LivestreamsService.getViewerToken admission', () => {
  const env = { ...process.env };
  beforeEach(() => {
    process.env.RTC_PROVIDER = 'livekit';
    process.env.LIVEKIT_URL = 'wss://rtc.test';
    process.env.LIVEKIT_API_KEY = 'k';
    process.env.LIVEKIT_API_SECRET = 'secretsecretsecretsecretsecretsecret';
    process.env.LIVEKIT_MAX_VIEWERS_PER_ROOM = '2';
  });
  afterEach(() => {
    process.env = { ...env };
    jest.clearAllMocks();
  });

  function make(
    stream: Record<string, unknown>,
    hlsEnabled = false,
    hlsStatus: Record<string, unknown> = {
      state: 'off',
      hlsUrl: null,
      reason: null,
      retryAfterSeconds: 3,
    },
  ) {
    const repo = {
      findStreamForToken: jest.fn(async () => ({
        id: ID,
        hostId: 'host',
        isLive: true,
        viewers: 2,
        hlsUrl: null,
        hlsEgressId: null,
        ...stream,
      })),
      sumLiveViewers: jest.fn(async () => 0),
    };
    const hls = {
      isEnabled: () => hlsEnabled,
      status: jest.fn(async () => hlsStatus),
      start: jest.fn(async () => undefined),
    };
    const svc = new LivestreamsService(
      repo as never,
      {} as never,
      {} as never,
      { info: jest.fn(), error: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      hls as never,
    );
    return { svc, hls };
  }
  const viewer = { userId: 'v1' } as never;

  it('admits below the cap with a WebRTC token', async () => {
    (livekit.listLivekitIdentities as jest.Mock).mockResolvedValue(null);
    const { svc } = make({ viewers: 1 });
    await expect(svc.getViewerToken(ID, viewer)).resolves.toMatchObject({
      mode: 'webrtc',
      livekitToken: 'jwt',
    });
  });

  const full = ['host', 'a', 'b'];

  it('returns the HLS playlist only when the HLS service reports it ready', async () => {
    (livekit.listLivekitIdentities as jest.Mock).mockResolvedValue(full);
    const { svc } = make({}, true, {
      state: 'ready',
      hlsUrl: 'https://cdn/x.m3u8',
      reason: null,
      retryAfterSeconds: 3,
    });
    await expect(svc.getViewerToken(ID, viewer)).resolves.toMatchObject({
      mode: 'hls',
      hlsUrl: 'https://cdn/x.m3u8',
      livekitToken: null,
      hlsLatencySeconds: 10,
    });
  });

  it('full + HLS preparing -> 503 hls_preparing with a retry hint (no URL leaked)', async () => {
    (livekit.listLivekitIdentities as jest.Mock).mockResolvedValue(full);
    const { svc } = make({}, true, {
      state: 'preparing',
      hlsUrl: null,
      reason: null,
      retryAfterSeconds: 3,
    });
    await expect(svc.getViewerToken(ID, viewer)).rejects.toMatchObject({
      status: 503,
      error: 'hls_preparing',
      details: { hlsState: 'preparing', retryAfterSeconds: 3 },
    });
  });

  it('full + HLS failed -> 503 hls_failed so the app can wait for a WebRTC slot', async () => {
    (livekit.listLivekitIdentities as jest.Mock).mockResolvedValue(full);
    const { svc } = make({}, true, {
      state: 'failed',
      hlsUrl: null,
      reason: 'timeout',
      retryAfterSeconds: 10,
    });
    await expect(svc.getViewerToken(ID, viewer)).rejects.toMatchObject({
      status: 503,
      error: 'hls_failed',
      details: { hlsState: 'failed', reason: 'timeout' },
    });
  });

  it('full + HLS off but startable -> starts egress and answers hls_preparing', async () => {
    (livekit.listLivekitIdentities as jest.Mock).mockResolvedValue(full);
    const { svc, hls } = make({}, true);
    hls.status
      .mockResolvedValueOnce({
        state: 'off',
        hlsUrl: null,
        reason: null,
        retryAfterSeconds: 3,
      })
      .mockResolvedValueOnce({
        state: 'preparing',
        hlsUrl: null,
        reason: null,
        retryAfterSeconds: 3,
      });
    await expect(svc.getViewerToken(ID, viewer)).rejects.toMatchObject({
      error: 'hls_preparing',
    });
    expect(hls.start).toHaveBeenCalledWith(ID);
  });

  it('full without HLS configured -> plain 503 room_full', async () => {
    (livekit.listLivekitIdentities as jest.Mock).mockResolvedValue(full);
    const { svc } = make({}, false);
    await expect(svc.getViewerToken(ID, viewer)).rejects.toMatchObject({
      status: 503,
      error: 'room_full',
      details: { hlsState: 'off' },
    });
  });

  it('lets a viewer already in the room refresh their token', async () => {
    (livekit.listLivekitIdentities as jest.Mock).mockResolvedValue([
      'host',
      'v1',
      'b',
    ]);
    const { svc } = make({});
    await expect(svc.getViewerToken(ID, viewer)).resolves.toMatchObject({
      mode: 'webrtc',
    });
  });

  it('provider switch: the same service answers livekit, then agora after RTC_PROVIDER flips', async () => {
    (livekit.listLivekitIdentities as jest.Mock).mockResolvedValue(null);
    process.env.AGORA_APP_ID = 'a'.repeat(32);
    process.env.AGORA_APP_CERTIFICATE = 'b'.repeat(32);
    const { svc } = make({ viewers: 0 });
    await expect(svc.getViewerToken(ID, viewer)).resolves.toMatchObject({
      provider: 'livekit',
      livekitToken: 'jwt',
      agoraToken: null,
    });
    process.env.RTC_PROVIDER = 'agora';
    const res = await svc.getViewerToken(ID, viewer);
    expect(res).toMatchObject({
      provider: 'agora',
      livekitToken: null,
      livekitUrl: null,
      agoraAppId: 'a'.repeat(32),
      mode: 'webrtc',
    });
    expect(typeof (res as { agoraToken: string }).agoraToken).toBe('string');
  });

  it('agora provider never applies LiveKit room caps or HLS', async () => {
    process.env.RTC_PROVIDER = 'agora';
    process.env.AGORA_APP_ID = 'a'.repeat(32);
    process.env.AGORA_APP_CERTIFICATE = 'b'.repeat(32);
    const { svc } = make({ viewers: 9999 }, true);
    await expect(svc.getViewerToken(ID, viewer)).resolves.toMatchObject({
      provider: 'agora',
      mode: 'webrtc',
    });
  });
});
