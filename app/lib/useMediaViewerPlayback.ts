import { getExpoVideoModule } from '@/lib/expoVideo';
import { useCallback, useEffect, useRef, useState } from 'react';

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

function phaseFromPlayer(player: VideoPlayerLike, ended: boolean): MediaViewerPlaybackPhase {
  if (ended) return 'ended';
  if (player.status === 'loading' || player.status === 'idle') return 'loading';
  if (player.playing) return 'playing';
  return 'paused';
}

export function useMediaViewerPlayback(player: VideoPlayerLike | null, active: boolean) {
  const [state, setState] = useState<MediaViewerPlaybackState>(EMPTY);
  const endedRef = useRef(false);

  const syncFromPlayer = useCallback(() => {
    if (!player) return;
    const duration = player.duration ?? 0;
    const currentTime = player.currentTime ?? 0;
    setState({
      phase: phaseFromPlayer(player, endedRef.current),
      currentTime,
      duration,
      progress: safeProgress(currentTime, duration),
      isPlaying: Boolean(player.playing) && !endedRef.current,
    });
  }, [player]);

  useEffect(() => {
    endedRef.current = false;
    if (!player || !active) {
      setState(EMPTY);
      return;
    }

    try {
      player.timeUpdateEventInterval = 0.25;
    } catch {
      // optional
    }

    syncFromPlayer();

    const subs = [
      player.addListener('timeUpdate', (payload) => {
        const currentTime = Number(payload.currentTime ?? player.currentTime ?? 0);
        const duration = player.duration ?? 0;
        setState((prev) => ({
          ...prev,
          currentTime,
          duration,
          progress: safeProgress(currentTime, duration),
          phase: endedRef.current ? 'ended' : phaseFromPlayer(player, endedRef.current),
          isPlaying: Boolean(player.playing) && !endedRef.current,
        }));
      }),
      player.addListener('playingChange', () => syncFromPlayer()),
      player.addListener('statusChange', () => syncFromPlayer()),
      player.addListener('playToEnd', () => {
        endedRef.current = true;
        syncFromPlayer();
      }),
    ];

    return () => {
      subs.forEach((s) => s.remove());
    };
  }, [player, active, syncFromPlayer]);

  const togglePlay = useCallback(() => {
    if (!player) return;
    if (endedRef.current) return;
    if (player.playing) player.pause();
    else player.play();
  }, [player]);

  const replay = useCallback(() => {
    if (!player) return;
    endedRef.current = false;
    try {
      player.currentTime = 0;
    } catch {
      // ignore
    }
    player.play();
    syncFromPlayer();
  }, [player, syncFromPlayer]);

  const seekTo = useCallback(
    (seconds: number) => {
      if (!player) return;
      endedRef.current = false;
      const duration = player.duration ?? 0;
      const next = duration > 0 ? Math.max(0, Math.min(duration, seconds)) : Math.max(0, seconds);
      try {
        player.currentTime = next;
      } catch {
        // ignore
      }
      syncFromPlayer();
    },
    [player, syncFromPlayer],
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
