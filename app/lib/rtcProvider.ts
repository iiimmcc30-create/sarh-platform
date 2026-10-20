export type RtcProviderName = 'livekit' | 'agora';

/** Build-time provider. Unset follows the server default (LiveKit). */
export function rtcProvider(): RtcProviderName {
  return process.env.EXPO_PUBLIC_RTC_PROVIDER === 'agora' ? 'agora' : 'livekit';
}

/**
 * Video live (host + watch) is on unless a build sets EXPO_PUBLIC_LIVE_ENABLED=false.
 * Councils keep their own EXPO_PUBLIC_COUNCILS_ENABLED flag.
 */
export function isLiveBroadcastEnabled(): boolean {
  return process.env.EXPO_PUBLIC_LIVE_ENABLED !== 'false';
}

export interface RtcCredentialsHint {
  provider?: RtcProviderName | null;
  livekitUrl?: string | null;
  livekitToken?: string | null;
  agoraToken?: string | null;
}

/**
 * Which SDK to use for ONE session. The backend's answer wins (so flipping RTC_PROVIDER on the
 * server needs no app update); the build-time env is only the default before any credentials exist.
 * A running session is never migrated: this is evaluated once, at join.
 */
export function providerFromCreds(creds?: RtcCredentialsHint | null): RtcProviderName {
  if (creds?.provider === 'agora') return 'agora';
  if (creds?.provider === 'livekit') return 'livekit';
  if (creds?.livekitUrl && creds.livekitToken) return 'livekit';
  if (creds?.agoraToken) return 'agora';
  return rtcProvider();
}
