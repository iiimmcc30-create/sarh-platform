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
