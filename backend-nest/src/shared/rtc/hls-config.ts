/** HLS output: S3-compatible bucket (R2, B2, MinIO, S3) fronted by a CDN. */
export interface HlsConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKey: string;
  secret: string;
  forcePathStyle: boolean;
  publicBaseUrl: string;
  pathPrefix: string;
  segmentSeconds: number;
  mode: 'track' | 'room';
}

export const HLS_PLAYLIST = 'live.m3u8';
export const HLS_LATENCY_SECONDS = 10;

export function getHlsConfig(
  env: NodeJS.ProcessEnv = process.env,
): HlsConfig | null {
  const bucket = env.HLS_S3_BUCKET?.trim();
  const accessKey = env.HLS_S3_ACCESS_KEY?.trim();
  const secret = env.HLS_S3_SECRET?.trim();
  const publicBaseUrl = env.HLS_PUBLIC_BASE_URL?.trim().replace(/\/+$/, '');
  if (!bucket || !accessKey || !secret || !publicBaseUrl) return null;
  if (!/^https?:\/\//i.test(publicBaseUrl)) return null;
  const segments = Number.parseInt(env.HLS_SEGMENT_SECONDS ?? '', 10);
  return {
    endpoint: env.HLS_S3_ENDPOINT?.trim() ?? '',
    region: env.HLS_S3_REGION?.trim() || 'auto',
    bucket,
    accessKey,
    secret,
    forcePathStyle: env.HLS_S3_FORCE_PATH_STYLE?.trim() !== 'false',
    publicBaseUrl,
    pathPrefix: (env.HLS_PATH_PREFIX?.trim() || 'live').replace(
      /^\/+|\/+$/g,
      '',
    ),
    segmentSeconds: segments >= 1 && segments <= 10 ? segments : 2,
    mode: env.LIVE_HLS_EGRESS_MODE?.trim() === 'room' ? 'room' : 'track',
  };
}

export function isHlsConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return getHlsConfig(env) !== null;
}

/** Object key prefix for one stream (no leading/trailing slash). */
export function hlsObjectPrefix(cfg: HlsConfig, streamId: string): string {
  return `${cfg.pathPrefix}/${streamId}`;
}

export function hlsPlaylistUrl(cfg: HlsConfig, streamId: string): string {
  return `${cfg.publicBaseUrl}/${hlsObjectPrefix(cfg, streamId)}/${HLS_PLAYLIST}`;
}

/** Partially filled HLS_* vars are a deploy mistake worth failing on. */
export function hlsConfigProblem(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const keys = [
    'HLS_S3_BUCKET',
    'HLS_S3_ACCESS_KEY',
    'HLS_S3_SECRET',
    'HLS_PUBLIC_BASE_URL',
  ];
  const set = keys.filter((k) => env[k]?.trim());
  if (set.length === 0 || set.length === keys.length) {
    const url = env.HLS_PUBLIC_BASE_URL?.trim();
    if (url && !/^https:\/\//i.test(url)) {
      return 'HLS_PUBLIC_BASE_URL must be an https:// URL';
    }
    return null;
  }
  return `Incomplete HLS config: set all of ${keys.join(', ')}`;
}
