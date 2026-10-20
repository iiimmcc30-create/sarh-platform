import Constants from 'expo-constants';

type AgoraModule = typeof import('react-native-agora');

let cached: AgoraModule | null | undefined;

export function isExpoGoEnvironment(): boolean {
  return Constants.appOwnership === 'expo';
}

export function isAgoraAvailable(): boolean {
  return !isExpoGoEnvironment() && getAgoraModule() !== null;
}

export function getAgoraModule(): AgoraModule | null {
  if (isExpoGoEnvironment()) {
    return null;
  }

  // Agora is the fallback RTC provider and ships in the same build as LiveKit, so switching
  // RTC_PROVIDER on the server needs no app update. Opt out with EXPO_PUBLIC_AGORA_ENABLED=false.
  if (process.env.EXPO_PUBLIC_AGORA_ENABLED === 'false') {
    return null;
  }

  if (cached !== undefined) {
    return cached;
  }

  try {
    cached = require('react-native-agora') as AgoraModule;
    return cached;
  } catch {
    cached = null;
    return null;
  }
}

export const VideoSourceType = {
  VideoSourceCamera: 0,
  VideoSourceRemote: 9,
} as const;
