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
