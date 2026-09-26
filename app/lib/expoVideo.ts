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

/**
 * True only while `player` is still the instance owned by this session.
 * A released VideoPlayer stays a JS object (its shared-object id included),
 * so identity plus generation is the lifetime check — not object presence.
 */
export function isSameVideoPlayerSession<T extends object>(
  player: T | null,
  generation: number,
  playerRef: { readonly current: T | null },
  generationRef: { readonly current: number },
): player is T {
  return player != null && playerRef.current === player && generationRef.current === generation;
}

export function removeVideoPlayerSubscription(
  subscription: { remove: () => void } | null | undefined,
): void {
  if (!subscription) return;
  try {
    subscription.remove();
  } catch {
    // Native shared object was already released.
  }
}
