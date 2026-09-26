import {
  getExpoVideoModule,
  isSameVideoPlayerSession,
  removeVideoPlayerSubscription,
} from '@/lib/expoVideo';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';

export type MediaViewerPlaybackPhase = 'loading' | 'playing' | 'paused' | 'ended';

export type MediaViewerPlaybackState = {
  phase: MediaViewerPlaybackPhase;
  currentTime: number;
  duration: number;
  progress: number;
  isPlaying: boolean;
};

type VideoPlayerLike = {
  playing: boolean;
  currentTime: number;
  duration: number;
  status: string;
  play: () => void;
  pause: () => void;
  timeUpdateEventInterval: number;
  addListener: (
    event: string,
    cb: (payload: Record<string, unknown>) => void,
  ) => { remove: () => void };
};

const EMPTY: MediaViewerPlaybackState = {
  phase: 'loading',
  currentTime: 0,
  duration: 0,
  progress: 0,
  isPlaying: false,
};

function safeProgress(currentTime: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  if (!Number.isFinite(currentTime) || currentTime < 0) return 0;
  return Math.min(1, currentTime / duration);
}

function phaseFromSnapshot(status: string, playing: boolean, ended: boolean): MediaViewerPlaybackPhase {
  if (ended) return 'ended';
  if (status === 'loading' || status === 'idle') return 'loading';
  if (playing) return 'playing';
  return 'paused';
}

function readPlayback(player: VideoPlayerLike, ended: boolean): MediaViewerPlaybackState {
  const duration = player.duration ?? 0;
  const currentTime = player.currentTime ?? 0;
  const playing = Boolean(player.playing);
  const status = player.status;
  return {
    phase: phaseFromSnapshot(status, playing, ended),
    currentTime,
    duration,
    progress: safeProgress(currentTime, duration),
    isPlaying: playing && !ended,
  };
}

function isLiveSession(
  player: VideoPlayerLike | null,
  generation: number,
  playerRef: { readonly current: VideoPlayerLike | null },
  generationRef: { readonly current: number },
  activeRef: { readonly current: boolean },
): player is VideoPlayerLike {
  return activeRef.current && isSameVideoPlayerSession(player, generation, playerRef, generationRef);
}

export function useMediaViewerPlayback(player: VideoPlayerLike | null, active: boolean) {
  const [state, setState] = useState<MediaViewerPlaybackState>(EMPTY);
  const endedRef = useRef(false);
  const playerRef = useRef<VideoPlayerLike | null>(player);
  const activeRef = useRef(active);
  const generationRef = useRef(0);

  playerRef.current = player;
  activeRef.current = active;

  const syncFromPlayer = useCallback((generation: number, bound: VideoPlayerLike | null) => {
    if (!isLiveSession(bound, generation, playerRef, generationRef, activeRef)) return;
    try {
      if (!isLiveSession(bound, generation, playerRef, generationRef, activeRef)) return;
      const next = readPlayback(bound, endedRef.current);
      if (!isLiveSession(bound, generation, playerRef, generationRef, activeRef)) return;
      setState(next);
    } catch {
      // Native player was released between the generation check and the property read.
    }
  }, []);

  // Layout cleanup runs before useVideoPlayer's passive release, so generation
  // is invalidated while the native player can still drop subscriptions.
  useLayoutEffect(() => {
    const generation = generationRef.current;
    const bound = player;
    const subs: Array<{ remove: () => void }> = [];
    const live = () => isLiveSession(bound, generation, playerRef, generationRef, activeRef);

    if (!bound || !active || !live()) {
      setState(EMPTY);
      return () => {
        generationRef.current += 1;
      };
    }

    endedRef.current = false;

    try {
      if (live()) bound.timeUpdateEventInterval = 0.25;
    } catch {
      // optional, or the player was released before the write landed
    }

    syncFromPlayer(generation, bound);

    const listen = (event: string, cb: (payload: Record<string, unknown>) => void) => {
      if (!live()) return;
      try {
        subs.push(
          bound.addListener(event, (payload) => {
            if (!live()) return;
            cb(payload);
          }),
        );
      } catch {
        // released before the listener was attached
      }
    };

    listen('timeUpdate', (payload) => {
      if (!live()) return;
      try {
        if (!live()) return;
        const currentTime = Number(payload.currentTime ?? bound.currentTime ?? 0);
        const duration = bound.duration ?? 0;
        const playing = Boolean(bound.playing);
        const status = bound.status;
        if (!live()) return;
        const ended = endedRef.current;
        setState((prev) => ({
          ...prev,
          currentTime,
          duration,
          progress: safeProgress(currentTime, duration),
          phase: phaseFromSnapshot(status, playing, ended),
          isPlaying: playing && !ended,
        }));
      } catch {
        // released
      }
    });
    listen('playingChange', () => {
      syncFromPlayer(generation, bound);
    });
    listen('statusChange', () => {
      syncFromPlayer(generation, bound);
    });
    listen('playToEnd', () => {
      if (!live()) return;
      endedRef.current = true;
      syncFromPlayer(generation, bound);
    });

    return () => {
      generationRef.current += 1;
      for (const sub of subs) removeVideoPlayerSubscription(sub);
    };
  }, [player, active, syncFromPlayer]);

  const togglePlay = useCallback(() => {
    const generation = generationRef.current;
    const current = playerRef.current;
    if (!isLiveSession(current, generation, playerRef, generationRef, activeRef)) return;
    if (endedRef.current) return;
    try {
      if (!isLiveSession(current, generation, playerRef, generationRef, activeRef)) return;
      if (current.playing) current.pause();
      else current.play();
    } catch {
      // released
    }
  }, []);

  const replay = useCallback(() => {
    const generation = generationRef.current;
    const current = playerRef.current;
    if (!isLiveSession(current, generation, playerRef, generationRef, activeRef)) return;
    endedRef.current = false;
    try {
      if (!isLiveSession(current, generation, playerRef, generationRef, activeRef)) return;
      current.currentTime = 0;
      if (!isLiveSession(current, generation, playerRef, generationRef, activeRef)) return;
      current.play();
    } catch {
      return;
    }
    syncFromPlayer(generation, current);
  }, [syncFromPlayer]);

  const seekTo = useCallback(
    (seconds: number) => {
      const generation = generationRef.current;
      const current = playerRef.current;
      if (!isLiveSession(current, generation, playerRef, generationRef, activeRef)) return;
      endedRef.current = false;
      try {
        if (!isLiveSession(current, generation, playerRef, generationRef, activeRef)) return;
        const duration = current.duration ?? 0;
        const next = duration > 0 ? Math.max(0, Math.min(duration, seconds)) : Math.max(0, seconds);
        if (!isLiveSession(current, generation, playerRef, generationRef, activeRef)) return;
        current.currentTime = next;
      } catch {
        return;
      }
      syncFromPlayer(generation, current);
    },
    [syncFromPlayer],
  );

  return { playback: state, togglePlay, replay, seekTo };
}

export type MediaViewerVideoPlayer = VideoPlayerLike;

export function isMediaViewerVideoPlayer(value: unknown): value is MediaViewerVideoPlayer {
  if (!value || typeof value !== 'object') return false;
  const p = value as Record<string, unknown>;
  return typeof p.play === 'function' && typeof p.pause === 'function';
}

/** No-op when expo-video is unavailable (web fallback). */
export function useMediaViewerPlaybackOptional(
  player: unknown,
  active: boolean,
): ReturnType<typeof useMediaViewerPlayback> {
  const typed = isMediaViewerVideoPlayer(player) ? player : null;
  return useMediaViewerPlayback(typed, active && isExpoVideoNativeAvailable());
}

function isExpoVideoNativeAvailable(): boolean {
  try {
    return Boolean(getExpoVideoModule());
  } catch {
    return false;
  }
}
