/**
 * Load-aware WebRTC admission. One LiveKit room lives on one node, so the
 * per-room cap protects a single node; the cluster cap (per-node limit x node
 * count) protects the whole fleet. 0 disables a limit.
 */
export interface RtcLimits {
  maxViewersPerRoom: number;
  maxCouncilParticipants: number;
  maxParticipantsPerNode: number;
  nodeCount: number;
}

function intEnv(name: string, fallback: number, env: NodeJS.ProcessEnv) {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function getRtcLimits(env: NodeJS.ProcessEnv = process.env): RtcLimits {
  return {
    maxViewersPerRoom: intEnv('LIVEKIT_MAX_VIEWERS_PER_ROOM', 250, env),
    maxCouncilParticipants: intEnv(
      'LIVEKIT_MAX_COUNCIL_PARTICIPANTS',
      200,
      env,
    ),
    maxParticipantsPerNode: intEnv('LIVEKIT_MAX_PARTICIPANTS_PER_NODE', 0, env),
    nodeCount: Math.max(1, intEnv('LIVEKIT_NODE_COUNT', 1, env)),
  };
}

/** Total WebRTC viewers the fleet is allowed to carry, or 0 when unlimited. */
export function clusterViewerCap(limits: RtcLimits): number {
  return limits.maxParticipantsPerNode > 0
    ? limits.maxParticipantsPerNode * limits.nodeCount
    : 0;
}

export type ViewerAdmission =
  | { mode: 'webrtc' }
  | { mode: 'hls'; hlsUrl: string }
  | {
      mode: 'full';
      reason: 'room_full' | 'cluster_full';
      /** HLS is configured but not running yet: a start may help the next try. */
      hlsStartable: boolean;
    };

export function decideViewerAdmission(input: {
  roomViewers: number;
  clusterViewers: number;
  limits: RtcLimits;
  hlsUrl: string | null;
  hlsStartable: boolean;
  /** Already in the room (token refresh / reconnect): never bounce them. */
  alreadyInRoom: boolean;
}): ViewerAdmission {
  const { limits } = input;
  if (input.alreadyInRoom) return { mode: 'webrtc' };
  const roomFull =
    limits.maxViewersPerRoom > 0 &&
    input.roomViewers >= limits.maxViewersPerRoom;
  const cap = clusterViewerCap(limits);
  const clusterFull = cap > 0 && input.clusterViewers >= cap;
  if (!roomFull && !clusterFull) return { mode: 'webrtc' };
  if (input.hlsUrl) return { mode: 'hls', hlsUrl: input.hlsUrl };
  return {
    mode: 'full',
    reason: roomFull ? 'room_full' : 'cluster_full',
    hlsStartable: input.hlsStartable,
  };
}

/** Whether the viewer count says the room is at the point where HLS should start. */
export function shouldAutostartHls(
  viewers: number,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const threshold = intEnv('LIVE_HLS_AUTOSTART_VIEWERS', 0, env);
  return threshold > 0 && viewers >= threshold;
}
