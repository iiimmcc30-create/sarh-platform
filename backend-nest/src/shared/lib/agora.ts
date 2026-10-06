// src/lib/agora.ts — Agora RTC token generation (official agora-token package)

import { RtcTokenBuilder, RtcRole } from 'agora-token';

const APP_ID_LENGTH = 32;
const HOST_TOKEN_EXPIRE = 4 * 60 * 60; // 4 hours
const VIEWER_TOKEN_EXPIRE = 2 * 60 * 60; // 2 hours

export function getAgoraConfig(): { appId: string; appCertificate: string } {
  const appId = process.env.AGORA_APP_ID;
  const appCertificate = process.env.AGORA_APP_CERTIFICATE;

  if (!appId || appId.length !== APP_ID_LENGTH) {
    throw new Error(
      '[AGORA] AGORA_APP_ID missing or invalid (must be 32 chars)',
    );
  }
  if (!appCertificate || appCertificate.length < 32) {
    throw new Error('[AGORA] AGORA_APP_CERTIFICATE missing or too short');
  }
  return { appId, appCertificate };
}

/** Channel name derived from stream UUID (hex only, max 64 chars). */
export function streamIdToChannel(streamId: string): string {
  return streamId.replace(/-/g, '');
}

/** Deterministic uint32 from userId — same user always gets same Agora UID. */
export function uidFromUserId(userId: string): number {
  let hash = 2166136261;
  for (let i = 0; i < userId.length; i++) {
    hash ^= userId.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  // Agora UID must be non-zero uint32
  return hash === 0 ? 1 : hash;
}

function buildToken(
  channelName: string,
  uid: number,
  role: typeof RtcRole.PUBLISHER | typeof RtcRole.SUBSCRIBER,
  expireSeconds: number,
): string {
  const { appId, appCertificate } = getAgoraConfig();
  return RtcTokenBuilder.buildTokenWithUid(
    appId,
    appCertificate,
    channelName,
    uid,
    role,
    expireSeconds,
    expireSeconds,
  );
}

export function generateHostToken(
  streamId: string,
  userId: string,
): { token: string; uid: number } {
  const uid = uidFromUserId(userId);
  const channelName = streamIdToChannel(streamId);
  const token = buildToken(
    channelName,
    uid,
    RtcRole.PUBLISHER,
    HOST_TOKEN_EXPIRE,
  );
  return { token, uid };
}

export function generateViewerToken(
  streamId: string,
  userId: string,
): { token: string; uid: number } {
  const uid = uidFromUserId(userId);
  const channelName = streamIdToChannel(streamId);
  const token = buildToken(
    channelName,
    uid,
    RtcRole.SUBSCRIBER,
    VIEWER_TOKEN_EXPIRE,
  );
  return { token, uid };
}

// ─── «المجالس» (Voice Councils) — audio-only tokens ─────────────────────────
// Additive: the live-stream helpers above are unchanged.

/** Join privilege lifetime for every council member (seconds). */
export const COUNCIL_JOIN_TOKEN_EXPIRE = 2 * 60 * 60; // 2 hours
/**
 * Publish-audio privilege for speakers (seconds). Kept short on purpose: Agora tokens
 * cannot be revoked, so a demoted/muted speaker loses publishing at the next renewal
 * at the latest (renewal re-reads the role from the database).
 */
export const COUNCIL_SPEAKER_PUBLISH_EXPIRE = 10 * 60; // 10 minutes

type AccessToken2Ctor = new (
  appId: string,
  appCertificate: string,
  issueTs: number,
  expire: number,
) => { add_service(service: unknown): void; build(): string };
type ServiceRtcCtor = (new (
  channelName: string,
  uid: number | string,
) => { add_privilege(privilege: number, expire: number): void }) & {
  kPrivilegeJoinChannel: number;
  kPrivilegePublishAudioStream: number;
};

// `RtcTokenBuilder.buildTokenWithUidAndPrivilege` always embeds publish-video and
// publish-data privileges too. Councils must never publish video/data, so we use the
// same package's AccessToken2 primitives (identical token format) and grant only
// join (+ publish-audio for speakers).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const accessToken2 = require('agora-token/src/AccessToken2') as {
  AccessToken2: AccessToken2Ctor;
  ServiceRtc: ServiceRtcCtor;
};

/** Agora channel for a council: `council_` + UUID hex (39 chars, never collides with streams). */
export function councilIdToChannel(councilId: string): string {
  return `council_${councilId.replace(/-/g, '')}`;
}

export type CouncilRtcRole = 'publisher' | 'subscriber';

export interface CouncilRtcToken {
  token: string;
  uid: number;
  channel: string;
  role: CouncilRtcRole;
  /** Seconds until the join privilege (and token) expire. */
  expiresIn: number;
  /** Seconds until publish-audio expires (publishers only). */
  publishExpiresIn: number | null;
}

/**
 * Role-based council token. `subscriber` = join only (cannot publish anything once
 * Co-host token authentication is enabled in the Agora Console). `publisher` = join +
 * publish audio for COUNCIL_SPEAKER_PUBLISH_EXPIRE. Video/data publishing is never granted.
 */
export function generateCouncilToken(
  councilId: string,
  userId: string,
  role: CouncilRtcRole,
): CouncilRtcToken {
  const { appId, appCertificate } = getAgoraConfig();
  const uid = uidFromUserId(userId);
  const channel = councilIdToChannel(councilId);
  const { AccessToken2, ServiceRtc } = accessToken2;

  const token = new AccessToken2(
    appId,
    appCertificate,
    0,
    COUNCIL_JOIN_TOKEN_EXPIRE,
  );
  const service = new ServiceRtc(channel, uid);
  service.add_privilege(
    ServiceRtc.kPrivilegeJoinChannel,
    COUNCIL_JOIN_TOKEN_EXPIRE,
  );
  if (role === 'publisher') {
    service.add_privilege(
      ServiceRtc.kPrivilegePublishAudioStream,
      COUNCIL_SPEAKER_PUBLISH_EXPIRE,
    );
  }
  token.add_service(service);
  const built = token.build();
  if (!built) {
    throw new Error('[AGORA] council token build failed (check app id/cert)');
  }

  return {
    token: built,
    uid,
    channel,
    role,
    expiresIn: COUNCIL_JOIN_TOKEN_EXPIRE,
    publishExpiresIn:
      role === 'publisher' ? COUNCIL_SPEAKER_PUBLISH_EXPIRE : null,
  };
}

/** True when AGORA_APP_ID / AGORA_APP_CERTIFICATE are present and valid. */
export function isAgoraConfigured(): boolean {
  try {
    getAgoraConfig();
    return true;
  } catch {
    return false;
  }
}
