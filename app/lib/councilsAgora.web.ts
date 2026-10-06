// «المجالس» are native-only (Agora audio); the web build shows an "available in the app" note.
type AgoraModule = typeof import('react-native-agora');

export function isCouncilsFeatureEnabled(): boolean {
  return false;
}

export function getCouncilAgoraModule(): AgoraModule | null {
  return null;
}

export function isCouncilAudioAvailable(): boolean {
  return false;
}
