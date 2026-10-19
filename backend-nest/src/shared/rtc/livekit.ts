import { createHash } from 'crypto';
import {
  AccessToken,
  RoomServiceClient,
  TrackSource,
  TrackType,
  WebhookReceiver,
  type WebhookEvent,
} from 'livekit-server-sdk';
import { logger } from '../lib/logger';

export const LIVEKIT_HOST_TTL_SEC = 4 * 60 * 60;
export const LIVEKIT_VIEWER_TTL_SEC = 2 * 60 * 60;
export const LIVEKIT_COUNCIL_TTL_SEC = 2 * 60 * 60;

export type LivekitPublish = 'av' | 'audio' | 'none';

export interface LivekitConfig {
  url: string;
  httpUrl: string;
  apiKey: string;
  apiSecret: string;
}

export function isLivekitConfigured(): boolean {
  return getLivekitConfig() !== null;
}

export function getLivekitConfig(): LivekitConfig | null {
  const url = process.env.LIVEKIT_URL?.trim();
  const apiKey = process.env.LIVEKIT_API_KEY?.trim();
  const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();
  if (!url || !apiKey || !apiSecret) return null;
  if (!/^wss?:\/\//i.test(url) && !/^https?:\/\//i.test(url)) return null;
  return { url: toWsUrl(url), httpUrl: toHttpUrl(url), apiKey, apiSecret };
}

export function requireLivekitConfig(): LivekitConfig {
  const cfg = getLivekitConfig();
  if (!cfg) {
    throw new Error(
      '[LIVEKIT] LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET are required',
    );
  }
  return cfg;
}

/** Room name shared with the Agora channel (32 hex chars). */
export function liveRoomName(streamId: string): string {
  return streamId.replace(/-/g, '').toLowerCase();
}

/** Same shape as the Agora council channel so a provider switch keeps one room id. */
export function councilRoomName(councilId: string): string {
  return `council_${councilId.replace(/-/g, '').toLowerCase()}`;
}

export function streamIdFromRoom(room: string): string | null {
  if (!/^[0-9a-f]{32}$/i.test(room)) return null;
  return hyphenateUuid(room.toLowerCase());
}

export function councilIdFromRoom(room: string): string | null {
  const match = /^council_([0-9a-f]{32})$/i.exec(room);
  if (!match) return null;
  return hyphenateUuid(match[1].toLowerCase());
}

export async function createLivekitToken(input: {
  identity: string;
  room: string;
  ttlSeconds: number;
  publish: LivekitPublish;
}): Promise<string> {
  const { apiKey, apiSecret } = requireLivekitConfig();
  const token = new AccessToken(apiKey, apiSecret, {
    identity: input.identity,
    ttl: `${input.ttlSeconds}s`,
  });
  const publish = input.publish !== 'none';
  token.addGrant({
    roomJoin: true,
    room: input.room,
    canPublish: publish,
    canSubscribe: true,
    canPublishData: false,
    canPublishSources:
      input.publish === 'av'
        ? [TrackSource.CAMERA, TrackSource.MICROPHONE]
        : input.publish === 'audio'
          ? [TrackSource.MICROPHONE]
          : [],
  });
  return token.toJwt();
}

export async function receiveLivekitWebhook(
  rawBody: string,
  authorization: string | undefined,
): Promise<WebhookEvent> {
  const { apiKey, apiSecret } = requireLivekitConfig();
  const header = (authorization ?? '').replace(/^Bearer\s+/i, '').trim();
  const receiver = new WebhookReceiver(apiKey, apiSecret);
  return receiver.receive(rawBody, header);
}

/** SHA-256 of the raw body, base64 — the claim LiveKit puts in the webhook JWT. */
export function livekitBodySha256(rawBody: string): string {
  return createHash('sha256').update(rawBody).digest('base64');
}

export async function signLivekitWebhook(
  rawBody: string,
  apiKey: string,
  apiSecret: string,
): Promise<string> {
  const token = new AccessToken(apiKey, apiSecret, { ttl: '1m' });
  token.sha256 = livekitBodySha256(rawBody);
  return token.toJwt();
}

/** Best-effort. Never throws — a missing participant is normal (already left). */
export async function setLivekitPublish(input: {
  room: string;
  identity: string;
  publish: LivekitPublish;
  /** Also mute already-published audio when publish is revoked. */
  muteAudio?: boolean;
}): Promise<void> {
  const client = roomClient();
  if (!client) return;
  const publish = input.publish !== 'none';
  try {
    await client.updateParticipant(input.room, input.identity, {
      permission: {
        canSubscribe: true,
        canPublish: publish,
        canPublishData: false,
        canPublishSources:
          input.publish === 'av'
            ? [TrackSource.CAMERA, TrackSource.MICROPHONE]
            : input.publish === 'audio'
              ? [TrackSource.MICROPHONE]
              : [],
      },
    });
    if (input.muteAudio || !publish) {
      await muteAudioTracks(client, input.room, input.identity, true);
    }
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), room: input.room },
      'LiveKit updateParticipant failed',
    );
  }
}

export async function removeLivekitParticipant(
  room: string,
  identity: string,
): Promise<void> {
  const client = roomClient();
  if (!client) return;
  try {
    await client.removeParticipant(room, identity, {
      revokeTokenTs: BigInt(Math.floor(Date.now() / 1000)),
    });
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), room },
      'LiveKit removeParticipant failed',
    );
  }
}

export async function deleteLivekitRoom(room: string): Promise<void> {
  const client = roomClient();
  if (!client) return;
  try {
    await client.deleteRoom(room);
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), room },
      'LiveKit deleteRoom failed',
    );
  }
}

/** Participant identities currently in the room, or null when the API call fails. */
export async function listLivekitIdentities(
  room: string,
): Promise<string[] | null> {
  const client = roomClient();
  if (!client) return null;
  try {
    const participants = await client.listParticipants(room);
    return participants.map((p) => p.identity);
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), room },
      'LiveKit listParticipants failed',
    );
    return null;
  }
}

function roomClient(): RoomServiceClient | null {
  const cfg = getLivekitConfig();
  if (!cfg) return null;
  return new RoomServiceClient(cfg.httpUrl, cfg.apiKey, cfg.apiSecret);
}

async function muteAudioTracks(
  client: RoomServiceClient,
  room: string,
  identity: string,
  muted: boolean,
): Promise<void> {
  try {
    const participant = await client.getParticipant(room, identity);
    for (const track of participant.tracks ?? []) {
      if (track.type === TrackType.AUDIO && track.sid) {
        await client.mutePublishedTrack(room, identity, track.sid, muted);
      }
    }
  } catch {
    // Participant already left, or has not published yet.
  }
}

function hyphenateUuid(hex: string): string {
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function toWsUrl(url: string): string {
  if (/^https:\/\//i.test(url)) return url.replace(/^https:/i, 'wss:');
  if (/^http:\/\//i.test(url)) return url.replace(/^http:/i, 'ws:');
  return url;
}

function toHttpUrl(url: string): string {
  if (/^wss:\/\//i.test(url)) return url.replace(/^wss:/i, 'https:');
  if (/^ws:\/\//i.test(url)) return url.replace(/^ws:/i, 'http:');
  return url;
}
