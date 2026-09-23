import Constants from 'expo-constants';

type AgoraModule = typeof import('react-native-agora');

export function isExpoGoEnvironment(): boolean {
  return Constants.appOwnership === 'expo';
}

export function isAgoraAvailable(): boolean {
  return false;
}

export function getAgoraModule(): AgoraModule | null {
  return null;
}

export const VideoSourceType = {
  VideoSourceCamera: 0,
  VideoSourceRemote: 9,
} as const;
