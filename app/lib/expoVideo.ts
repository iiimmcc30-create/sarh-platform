export type ExpoVideoPlayer = {
  loop: boolean;
  muted: boolean;
  play: () => void;
  pause: () => void;
  currentTime: number;
  playing: boolean;
  status: string;
  keepScreenOnWhilePlaying: boolean;
  addListener: (
    event: string,
    cb: (payload: { currentTime?: number; status?: string; isPlaying?: boolean }) => void,
  ) => { remove: () => void };
};

type ExpoVideoModule = {
  useVideoPlayer: (
    source: string | { uri: string },
    setup: (player: ExpoVideoPlayer) => void,
  ) => ExpoVideoPlayer;
  VideoView: React.ComponentType<Record<string, unknown>>;
};

let cached: ExpoVideoModule | null | undefined;

/** Load expo-video once; require() throws if native ExpoVideo is missing from the APK. */
export function getExpoVideoModule(): ExpoVideoModule | null {
  if (cached !== undefined) return cached;

  try {
    cached = require('expo-video') as ExpoVideoModule;
  } catch {
    cached = null;
  }
  return cached;
}

export function isExpoVideoNativeAvailable(): boolean {
  return getExpoVideoModule() != null;
}

export function resetExpoVideoModuleCache(): void {
  cached = undefined;
}
