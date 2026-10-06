// «المجالس» — Agora module loader for councils ONLY.
// Gated by its own flag (EXPO_PUBLIC_COUNCILS_ENABLED) so live streaming keeps its
// own gating (`EXPO_PUBLIC_AGORA_ENABLED` in lib/agora.ts) untouched.
import Constants from 'expo-constants';

type AgoraModule = typeof import('react-native-agora');

let cached: AgoraModule | null | undefined;

export function isCouncilsFeatureEnabled(): boolean {
  return process.env.EXPO_PUBLIC_COUNCILS_ENABLED === 'true';
}

export function getCouncilAgoraModule(): AgoraModule | null {
  if (Constants.appOwnership === 'expo') return null; // Expo Go has no native Agora
  if (!isCouncilsFeatureEnabled()) return null;
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy native module (same as lib/agora.ts)
    cached = require('react-native-agora') as AgoraModule;
  } catch {
    cached = null;
  }
  return cached;
}

export function isCouncilAudioAvailable(): boolean {
  return getCouncilAgoraModule() !== null;
}
