export interface CouncilVideoProfile {
  maxHeight: number;
  maxWidth: number;
  maxFps: number;
  maxBitrateKbps: number;
  simulcast: true;
}

const clamp = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, n));

function intEnv(raw: string | undefined, fallback: number): number {
  const n = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Camera limits for golden councils (env-driven, 540p default, 720p ceiling). The LiveKit
 * server does not enforce resolution: these are sent to the client with the token and
 * applied as capture/encoding options (simulcast always on). Token grants decide WHO may
 * publish video; this decides how heavy it is.
 */
export function getCouncilVideoProfile(
  env: NodeJS.ProcessEnv = process.env,
): CouncilVideoProfile {
  const maxHeight = clamp(intEnv(env.COUNCIL_VIDEO_MAX_HEIGHT, 540), 180, 720);
  const maxFps = clamp(intEnv(env.COUNCIL_VIDEO_MAX_FPS, 24), 10, 30);
  const defaultKbps = maxHeight >= 720 ? 1500 : maxHeight >= 540 ? 900 : 500;
  return {
    maxHeight,
    maxWidth: Math.round((maxHeight * 16) / 9),
    maxFps,
    maxBitrateKbps: clamp(
      intEnv(env.COUNCIL_VIDEO_MAX_BITRATE_KBPS, defaultKbps),
      150,
      2500,
    ),
    simulcast: true,
  };
}
