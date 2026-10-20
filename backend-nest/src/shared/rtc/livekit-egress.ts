import {
  EgressClient,
  EgressStatus,
  EncodingOptionsPreset,
  RoomServiceClient,
  S3Upload,
  SegmentedFileOutput,
  SegmentedFileProtocol,
  TrackSource,
  type EgressInfo,
} from 'livekit-server-sdk';
import { logger } from '../lib/logger';
import {
  HLS_PLAYLIST,
  hlsObjectPrefix,
  hlsPlaylistUrl,
  type HlsConfig,
} from './hls-config';
import { getLivekitConfig } from './livekit';

export { EgressStatus };

function client(): EgressClient | null {
  const cfg = getLivekitConfig();
  if (!cfg) return null;
  return new EgressClient(cfg.httpUrl, cfg.apiKey, cfg.apiSecret);
}

export function buildHlsOutput(cfg: HlsConfig, streamId: string) {
  const prefix = hlsObjectPrefix(cfg, streamId);
  return new SegmentedFileOutput({
    protocol: SegmentedFileProtocol.HLS_PROTOCOL,
    filenamePrefix: `${prefix}/seg`,
    playlistName: 'index.m3u8',
    livePlaylistName: HLS_PLAYLIST,
    segmentDuration: cfg.segmentSeconds,
    output: {
      case: 's3',
      value: new S3Upload({
        accessKey: cfg.accessKey,
        secret: cfg.secret,
        region: cfg.region,
        endpoint: cfg.endpoint,
        bucket: cfg.bucket,
        forcePathStyle: cfg.forcePathStyle,
      }),
    },
  });
}

export interface HlsEgressStarted {
  egressId: string;
  hlsUrl: string;
}

export class HostNotPublishingError extends Error {
  constructor() {
    super('host_not_publishing');
  }
}

/**
 * Start an HLS egress for a video room. `track` mode encodes the host's
 * camera + mic tracks directly (no headless Chrome, much cheaper); `room`
 * mode renders the room layout and needs far more CPU.
 */
export async function startHlsEgress(input: {
  cfg: HlsConfig;
  streamId: string;
  room: string;
  hostIdentity: string;
}): Promise<HlsEgressStarted> {
  const egress = client();
  const lk = getLivekitConfig();
  if (!egress || !lk) throw new Error('livekit_unavailable');
  const output = buildHlsOutput(input.cfg, input.streamId);
  let info: EgressInfo;
  if (input.cfg.mode === 'room') {
    info = await egress.startRoomCompositeEgress(input.room, output, {
      layout: 'speaker',
      encodingOptions: EncodingOptionsPreset.H264_720P_30,
    });
  } else {
    const rooms = new RoomServiceClient(lk.httpUrl, lk.apiKey, lk.apiSecret);
    const participant = await rooms
      .getParticipant(input.room, input.hostIdentity)
      .catch(() => null);
    const tracks = participant?.tracks ?? [];
    const video = tracks.find((t) => t.source === TrackSource.CAMERA && t.sid);
    const audio = tracks.find(
      (t) => t.source === TrackSource.MICROPHONE && t.sid,
    );
    if (!video?.sid) throw new HostNotPublishingError();
    info = await egress.startTrackCompositeEgress(input.room, output, {
      videoTrackId: video.sid,
      audioTrackId: audio?.sid,
      encodingOptions: EncodingOptionsPreset.H264_720P_30,
    });
  }
  return {
    egressId: info.egressId,
    hlsUrl: hlsPlaylistUrl(input.cfg, input.streamId),
  };
}

/** Best-effort stop; an already finished egress is not an error. */
export async function stopEgress(egressId: string): Promise<void> {
  const egress = client();
  if (!egress) return;
  try {
    await egress.stopEgress(egressId);
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), egressId },
      'LiveKit stopEgress failed',
    );
  }
}

export function egressFinished(status: EgressStatus | undefined): boolean {
  return (
    status === EgressStatus.EGRESS_COMPLETE ||
    status === EgressStatus.EGRESS_FAILED ||
    status === EgressStatus.EGRESS_ABORTED ||
    status === EgressStatus.EGRESS_LIMIT_REACHED
  );
}
