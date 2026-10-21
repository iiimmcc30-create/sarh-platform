export type RtcProviderName = 'livekit' | 'agora';

/** `RTC_PROVIDER=livekit|agora`. Unset defaults to LiveKit. */
export function getRtcProvider(): RtcProviderName {
  const raw = (process.env.RTC_PROVIDER ?? 'livekit').trim().toLowerCase();
  return raw === 'agora' ? 'agora' : 'livekit';
}
