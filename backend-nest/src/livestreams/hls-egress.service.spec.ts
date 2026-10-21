import { HlsEgressService } from './hls-egress.service';
import * as egress from '../shared/rtc/livekit-egress';
import * as probe from '../shared/rtc/hls-probe';

jest.mock('../shared/rtc/livekit-egress', () => ({
  ...jest.requireActual('../shared/rtc/livekit-egress'),
  startHlsEgress: jest.fn(),
  stopEgress: jest.fn(),
}));
jest.mock('../shared/rtc/hls-probe', () => ({
  playlistHasSegments: jest.fn(),
}));

const ID = '11111111-2222-4333-8444-555555555555';
const URL_ = `https://cdn.test/live/${ID}/live.m3u8`;

type Stream = {
  id: string;
  hostId: string;
  isLive: boolean;
  viewers: number;
  hlsUrl: string | null;
  hlsEgressId: string | null;
};

describe('HlsEgressService state machine', () => {
  const env = { ...process.env };
  const live: Stream = {
    id: ID,
    hostId: 'host',
    isLive: true,
    viewers: 0,
    hlsUrl: null,
    hlsEgressId: null,
  };

  beforeEach(() => {
    process.env.LIVEKIT_URL = 'wss://rtc.test';
    process.env.LIVEKIT_API_KEY = 'k';
    process.env.LIVEKIT_API_SECRET = 'secretsecretsecretsecretsecretsecret';
    process.env.HLS_S3_BUCKET = 'b';
    process.env.HLS_S3_ACCESS_KEY = 'a';
    process.env.HLS_S3_SECRET = 's';
    process.env.HLS_PUBLIC_BASE_URL = 'https://cdn.test';
  });
  afterEach(() => {
    process.env = { ...env };
    jest.clearAllMocks();
  });

  function make(initial: Partial<Stream> | null = {}) {
    let stream: Stream | null = initial ? { ...live, ...initial } : null;
    const store = new Map<string, unknown>();
    const repo = {
      findStreamForHls: jest.fn(async () => (stream ? { ...stream } : null)),
      setStreamHlsPreparing: jest.fn(async (_id: string, egressId: string) => {
        if (stream) stream = { ...stream, hlsEgressId: egressId, hlsUrl: null };
      }),
      setStreamHlsReady: jest.fn(
        async (_id: string, _e: string, url: string) => {
          if (stream) stream = { ...stream, hlsUrl: url };
        },
      ),
      clearStreamHls: jest.fn(async () => {
        if (stream) stream = { ...stream, hlsUrl: null, hlsEgressId: null };
      }),
    };
    const redis = {
      cacheGet: jest.fn(async (k: string) => store.get(k) ?? null),
      cacheSet: jest.fn(async (k: string, v: unknown) => void store.set(k, v)),
      cacheDel: jest.fn(async (k: string) => void store.delete(k)),
    };
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const svc = new HlsEgressService(
      repo as never,
      logger as never,
      redis as never,
    );
    return { svc, repo, store };
  }

  it('start -> preparing: the playlist URL is NOT exposed until segments exist', async () => {
    (egress.startHlsEgress as jest.Mock).mockResolvedValue({
      egressId: 'EG_1',
      hlsUrl: URL_,
    });
    (probe.playlistHasSegments as jest.Mock).mockResolvedValue(false);
    const { svc, repo } = make();
    const res = await svc.start(ID);
    expect(res).toMatchObject({
      started: true,
      state: 'preparing',
      hlsUrl: null,
    });
    expect(repo.setStreamHlsPreparing).toHaveBeenCalledWith(ID, 'EG_1');
    expect(repo.setStreamHlsReady).not.toHaveBeenCalled();
  });

  it('preparing -> ready once the playlist lists a segment', async () => {
    (probe.playlistHasSegments as jest.Mock).mockResolvedValue(true);
    const { svc, repo } = make({ hlsEgressId: 'EG_1' });
    await expect(svc.status(ID)).resolves.toMatchObject({
      state: 'ready',
      hlsUrl: URL_,
    });
    expect(repo.setStreamHlsReady).toHaveBeenCalledWith(ID, 'EG_1', URL_);
  });

  it('preparing -> failed(timeout) when no segments appear in time, and the egress is stopped', async () => {
    (probe.playlistHasSegments as jest.Mock).mockResolvedValue(false);
    process.env.HLS_READY_TIMEOUT_SECONDS = '1';
    const { svc, repo, store } = make({ hlsEgressId: 'EG_1' });
    store.set(`live:hls:started:${ID}`, Date.now() - 5000);
    await expect(svc.status(ID)).resolves.toMatchObject({
      state: 'failed',
      reason: 'timeout',
    });
    expect(egress.stopEgress).toHaveBeenCalledWith('EG_1');
    expect(repo.clearStreamHls).toHaveBeenCalled();
    await expect(svc.status(ID)).resolves.toMatchObject({
      state: 'failed',
      reason: 'timeout',
    });
  });

  it('no egress worker / start error surfaces as failed instead of hanging', async () => {
    (egress.startHlsEgress as jest.Mock).mockRejectedValue(
      new Error('no response from servers'),
    );
    const { svc } = make();
    await expect(svc.start(ID)).rejects.toMatchObject({
      status: 502,
      error: 'hls_start_failed',
    });
    await expect(svc.status(ID)).resolves.toMatchObject({
      state: 'failed',
      reason: 'egress_unavailable',
    });
  });

  it('a start that never answers is cut off by the start timeout', async () => {
    process.env.HLS_EGRESS_START_TIMEOUT_SECONDS = '1';
    (egress.startHlsEgress as jest.Mock).mockReturnValue(
      new Promise(() => undefined),
    );
    const { svc } = make();
    await expect(svc.start(ID)).rejects.toMatchObject({ status: 502 });
    await expect(svc.status(ID)).resolves.toMatchObject({ state: 'failed' });
  }, 10000);

  it('host not publishing yet -> 409 and failed(host_not_publishing)', async () => {
    (egress.startHlsEgress as jest.Mock).mockRejectedValue(
      new egress.HostNotPublishingError(),
    );
    const { svc } = make();
    await expect(svc.start(ID)).rejects.toMatchObject({
      status: 409,
      error: 'host_not_publishing',
    });
  });

  it('is idempotent while an egress exists', async () => {
    (probe.playlistHasSegments as jest.Mock).mockResolvedValue(false);
    const { svc } = make({ hlsEgressId: 'EG_9' });
    await expect(svc.start(ID)).resolves.toMatchObject({
      started: false,
      state: 'preparing',
    });
    expect(egress.startHlsEgress).not.toHaveBeenCalled();
  });

  it('refuses when HLS is not configured, the stream is missing, or not live', async () => {
    delete process.env.HLS_S3_BUCKET;
    await expect(make().svc.start(ID)).rejects.toMatchObject({ status: 503 });
    process.env.HLS_S3_BUCKET = 'b';
    await expect(make(null).svc.start(ID)).rejects.toMatchObject({
      status: 404,
    });
    await expect(make({ isLive: false }).svc.start(ID)).rejects.toMatchObject({
      status: 409,
    });
  });

  it('egress_ended with an error -> failed (not silently off)', async () => {
    const { svc } = make({ hlsEgressId: 'EG_3', hlsUrl: URL_ });
    await svc.handleEgressEvent(
      'egress_ended',
      { egressId: 'EG_3', error: 'encoder crashed' },
      ID,
    );
    await expect(svc.status(ID)).resolves.toMatchObject({
      state: 'failed',
      reason: 'encoder crashed',
    });
  });

  it('egress_ended with a FAILED status and no message is still failed', async () => {
    const { svc } = make({ hlsEgressId: 'EG_3' });
    await svc.handleEgressEvent(
      'egress_ended',
      { egressId: 'EG_3', status: 4 },
      ID,
    );
    await expect(svc.status(ID)).resolves.toMatchObject({
      state: 'failed',
      reason: 'egress_failed',
    });
  });

  it('a clean egress_ended just goes back to off', async () => {
    const { svc } = make({ hlsEgressId: 'EG_3', hlsUrl: URL_ });
    await svc.handleEgressEvent(
      'egress_ended',
      { egressId: 'EG_3', status: 3 },
      ID,
    );
    await expect(svc.status(ID)).resolves.toMatchObject({
      state: 'off',
      hlsUrl: null,
    });
  });

  it('egress_started recovers the preparing state when the API call lost the write', async () => {
    const { svc, repo } = make({ hlsEgressId: null });
    await svc.handleEgressEvent('egress_started', { egressId: 'EG_4' }, ID);
    expect(repo.setStreamHlsPreparing).toHaveBeenCalledWith(ID, 'EG_4');
    expect(repo.setStreamHlsReady).not.toHaveBeenCalled();
  });

  it('stops the egress and clears the stored state', async () => {
    const { svc, repo } = make({ hlsUrl: URL_, hlsEgressId: 'EG_2' });
    await expect(svc.stop(ID)).resolves.toEqual({ stopped: true });
    expect(egress.stopEgress).toHaveBeenCalledWith('EG_2');
    expect(repo.clearStreamHls).toHaveBeenCalledWith(ID, 'EG_2');
  });
});
