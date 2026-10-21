// «المجالس» on the web build. Agora has no web SDK here (react-native-agora is native-only),
// but LiveKit (livekit-client) runs in the browser, so councils work on web when the RTC
// provider is LiveKit. Same flag semantics as the native file (lib/councilsAgora.ts).
import { rtcProvider } from '@/lib/rtcProvider';

type AgoraModule = typeof import('react-native-agora');

/** On unless explicitly disabled with `EXPO_PUBLIC_COUNCILS_ENABLED=false` (mirrors native). */
export function isCouncilsFeatureEnabled(): boolean {
  return process.env.EXPO_PUBLIC_COUNCILS_ENABLED !== 'false';
}

/** Never on web: react-native-agora is a native module. */
export function getCouncilAgoraModule(): AgoraModule | null {
  return null;
}

/** Web audio = LiveKit in the browser. */
export function isCouncilAudioAvailable(): boolean {
  return rtcProvider() === 'livekit' && isCouncilsFeatureEnabled();
}

/**
 * Council routes show the "use the app" notice instead of the room when this is true.
 * On web that is whenever browser audio is impossible (Agora provider or flag off).
 */
export function isCouncilsWebBlocked(): boolean {
  return !isCouncilAudioAvailable();
}

/** Why the web build cannot open councils (Agora provider vs. feature off). */
export function councilsWebBlockedReason(): 'agora' | 'disabled' | null {
  if (!isCouncilsFeatureEnabled()) return 'disabled';
  if (rtcProvider() !== 'livekit') return 'agora';
  return null;
}
