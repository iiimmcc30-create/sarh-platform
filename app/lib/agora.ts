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

  // Native Agora is opt-in (development build). Avoid loading the package in Expo Go.
  if (process.env.EXPO_PUBLIC_AGORA_ENABLED !== 'true') {
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
