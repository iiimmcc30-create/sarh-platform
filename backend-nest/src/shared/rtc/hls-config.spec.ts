import { getHlsConfig, hlsConfigProblem, hlsPlaylistUrl } from './hls-config';
import { buildHlsOutput } from './livekit-egress';

const env = {
  HLS_S3_BUCKET: 'sarh-live',
  HLS_S3_ACCESS_KEY: 'k',
  HLS_S3_SECRET: 's',
  HLS_S3_ENDPOINT: 'https://acc.r2.cloudflarestorage.com',
  HLS_PUBLIC_BASE_URL: 'https://live-cdn.getsarh.com/',
};
const ID = '11111111-2222-4333-8444-555555555555';

describe('HLS config', () => {
  it('is off unless bucket, keys and public URL are all set', () => {
    expect(getHlsConfig({})).toBeNull();
    expect(getHlsConfig({ ...env, HLS_S3_SECRET: '' })).toBeNull();
  });

  it('builds the CDN playlist URL under the stream prefix', () => {
    const cfg = getHlsConfig(env)!;
    expect(cfg.region).toBe('auto');
    expect(cfg.mode).toBe('track');
    expect(hlsPlaylistUrl(cfg, ID)).toBe(
      `https://live-cdn.getsarh.com/live/${ID}/live.m3u8`,
    );
  });

  it('flags partial and non-https config', () => {
    expect(hlsConfigProblem({})).toBeNull();
    expect(hlsConfigProblem(env)).toBeNull();
    expect(hlsConfigProblem({ HLS_S3_BUCKET: 'x' })).toMatch(/Incomplete HLS/);
    expect(
      hlsConfigProblem({ ...env, HLS_PUBLIC_BASE_URL: 'http://cdn' }),
    ).toMatch(/https/);
  });

  it('writes an HLS segment output to S3 with the live playlist', () => {
    const out = buildHlsOutput(
      getHlsConfig({ ...env, HLS_SEGMENT_SECONDS: '4' })!,
      ID,
    );
    expect(out.filenamePrefix).toBe(`live/${ID}/seg`);
    expect(out.livePlaylistName).toBe('live.m3u8');
    expect(out.segmentDuration).toBe(4);
    expect(out.output.case).toBe('s3');
    expect(out.output.value).toMatchObject({
      bucket: 'sarh-live',
      endpoint: 'https://acc.r2.cloudflarestorage.com',
      forcePathStyle: true,
    });
  });
});
