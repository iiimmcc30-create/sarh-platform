import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Image } from '@/components/ui/AppImage';
import {
  getExpoVideoModule,
  isExpoVideoNativeAvailable,
  isSameVideoPlayerSession,
  removeVideoPlayerSubscription,
  type ExpoVideoPlayer,
} from '@/lib/expoVideo';
import { normalizeAspectRatio } from '@/lib/mediaContain';

type StoryVideoFit = 'cover' | 'contain';
type StoryVideoSurfaceType = 'textureView' | 'surfaceView';

type StoryVideoPlayerProps = {
  uri: string;
  posterUri?: string | null;
  style?: StyleProp<ViewStyle>;
  /** Explicit viewer sizing — feed tiles omit these and fill the container. */
  layoutWidth?: number;
  layoutHeight?: number;
  muted?: boolean;
  loop?: boolean;
  autoPlay?: boolean;
  nativeControls?: boolean;
  /** Stories/feed tiles default to cover. Viewers must pass contain. */
  contentFit?: StoryVideoFit;
  /**
   * Android only. Defaults to textureView. Keep textureView inside RN <Modal> (Media
   * Viewer): a SurfaceView sits behind the dialog window, so views drawn above it
   * (poster) hide the frames while audio plays.
   */
  surfaceType?: StoryVideoSurfaceType;
  /** Hide the poster at the first decoded frame (fallback: shortly after playback starts). */
  hidePosterWhenPlaying?: boolean;
  onReady?: () => void;
  onNaturalSize?: (width: number, height: number) => void;
  onPlayer?: (player: unknown) => void;
};

function StoryVideoFallback({
  posterUri,
  uri,
  style,
  layoutWidth,
  layoutHeight,
  contentFit = 'cover',
  onReady,
}: Pick<
  StoryVideoPlayerProps,
  'uri' | 'posterUri' | 'style' | 'layoutWidth' | 'layoutHeight' | 'contentFit' | 'onReady'
>) {
  const previewUri = posterUri || uri;
  const explicit =
    layoutWidth != null && layoutHeight != null && layoutWidth > 0 && layoutHeight > 0;

  useEffect(() => {
    onReady?.();
  }, [onReady]);

  const containerStyle = explicit
    ? { width: layoutWidth, height: layoutHeight, overflow: 'hidden' as const }
    : (style ?? StyleSheet.absoluteFillObject);

  const mediaStyle = explicit
    ? { width: layoutWidth, height: layoutHeight }
    : StyleSheet.absoluteFillObject;

  return (
    <View style={containerStyle}>
      <Image source={{ uri: previewUri }} style={mediaStyle} contentFit={contentFit} />
    </View>
  );
}

function StoryVideoPlayerNative({
  uri,
  posterUri,
  style,
  layoutWidth,
  layoutHeight,
  muted = false,
  loop = false,
  autoPlay = true,
  nativeControls = false,
  contentFit = 'cover',
  surfaceType,
  hidePosterWhenPlaying = false,
  onReady,
  onNaturalSize,
  onPlayer,
}: StoryVideoPlayerProps) {
  const { useVideoPlayer, VideoView } = getExpoVideoModule()!;
  const readyRef = useRef(false);
  const initialPlayDoneRef = useRef(false);
  const [posterVisible, setPosterVisible] = useState(Boolean(posterUri));
  const onPlayerRef = useRef(onPlayer);
  // Callback props live in refs so parent re-renders (e.g. the viewer's 250ms
  // timeUpdate state, or a rotation relayout) never re-run the player effect,
  // bump the generation or detach/re-attach native listeners.
  const onReadyRef = useRef(onReady);
  const onNaturalSizeRef = useRef(onNaturalSize);
  const hidePosterRef = useRef(hidePosterWhenPlaying);
  const posterFallbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generationRef = useRef(0);
  const playerRef = useRef<ExpoVideoPlayer | null>(null);
  const sourceRef = useRef(uri);
  onPlayerRef.current = onPlayer;
  onReadyRef.current = onReady;
  onNaturalSizeRef.current = onNaturalSize;
  hidePosterRef.current = hidePosterWhenPlaying;

  if (sourceRef.current !== uri) {
    sourceRef.current = uri;
    generationRef.current += 1;
    playerRef.current = null;
  }

  // Registered before useVideoPlayer so unmount cleanup runs before its release().
  useEffect(() => {
    return () => {
      const current = playerRef.current;
      generationRef.current += 1;
      playerRef.current = null;
      onPlayerRef.current?.(null);
      if (posterFallbackTimer.current) clearTimeout(posterFallbackTimer.current);
      posterFallbackTimer.current = null;
      if (!current) return;
      try {
        current.pause();
      } catch {
        // already released
      }
    };
  }, []);

  const explicit =
    layoutWidth != null && layoutHeight != null && layoutWidth > 0 && layoutHeight > 0;

  const notifyReady = useCallback(() => {
    if (readyRef.current) return;
    readyRef.current = true;
    onReadyRef.current?.();
  }, []);

  // The poster stays under the VideoView until the first decoded frame.
  const hidePoster = useCallback(() => {
    if (posterFallbackTimer.current) clearTimeout(posterFallbackTimer.current);
    posterFallbackTimer.current = null;
    if (hidePosterRef.current) setPosterVisible(false);
  }, []);

  const handleFirstFrame = useCallback(() => {
    hidePoster();
    notifyReady();
  }, [hidePoster, notifyReady]);

  const emitNatural = useCallback((width: number, height: number) => {
    const ratio = normalizeAspectRatio(width, height);
    if (!ratio) return;
    onNaturalSizeRef.current?.(width, height);
  }, []);

  const player = useVideoPlayer(uri, (p) => {
    p.loop = loop;
    p.muted = muted;
    p.keepScreenOnWhilePlaying = false;
  });
  playerRef.current = player;

  useFocusEffect(
    useCallback(() => {
      const generation = generationRef.current;
      const current = playerRef.current;
      if (autoPlay && isSameVideoPlayerSession(current, generation, playerRef, generationRef)) {
        try {
          if (isSameVideoPlayerSession(current, generation, playerRef, generationRef)) current.play();
        } catch {
          // released
        }
      }
      return () => {
        const blurGeneration = generationRef.current;
        const bound = playerRef.current;
        if (!isSameVideoPlayerSession(bound, blurGeneration, playerRef, generationRef)) return;
        try {
          if (!isSameVideoPlayerSession(bound, blurGeneration, playerRef, generationRef)) return;
          bound.pause();
        } catch {
          // released
        }
      };
    }, [autoPlay]),
  );

  useEffect(() => {
    const generation = generationRef.current;
    const bound = player;
    if (!isSameVideoPlayerSession(bound, generation, playerRef, generationRef)) return;
    onPlayerRef.current?.(bound);
    return () => {
      generationRef.current += 1;
      if (playerRef.current === bound) playerRef.current = null;
      onPlayerRef.current?.(null);
    };
  }, [player]);

  useEffect(() => {
    readyRef.current = false;
    initialPlayDoneRef.current = false;
    setPosterVisible(Boolean(posterUri));
  }, [posterUri, uri]);

  useEffect(() => {
    const generation = generationRef.current;
    const bound = player;
    const live = () => isSameVideoPlayerSession(bound, generation, playerRef, generationRef);
    if (!live()) return;
    try {
      if (!live()) return;
      bound.loop = loop;
      bound.muted = muted;
      bound.keepScreenOnWhilePlaying = false;
    } catch {
      // released
    }
  }, [player, loop, muted]);

  useEffect(() => {
    const generation = generationRef.current;
    const bound = player;
    const live = () => isSameVideoPlayerSession(bound, generation, playerRef, generationRef);
    if (!live()) return;

    const start = () => {
      if (!live()) return;
      try {
        if (!live()) return;
        bound.play();
      } catch {
        // retry when the player becomes ready
      }
    };

    let statusSub: { remove: () => void } | null = null;
    let playingSub: { remove: () => void } | null = null;
    let sourceLoadSub: { remove: () => void } | null = null;
    let trackSub: { remove: () => void } | null = null;

    try {
      if (!live()) return;
      if (!autoPlay) {
        bound.pause();
        return () => {
          generationRef.current += 1;
        };
      }

      if (bound.status === 'readyToPlay') {
        notifyReady();
        if (!initialPlayDoneRef.current) {
          initialPlayDoneRef.current = true;
          start();
        }
      }

      statusSub = bound.addListener('statusChange', ({ status }) => {
        if (!live()) return;
        if (status === 'readyToPlay') {
          notifyReady();
          if (autoPlay && !initialPlayDoneRef.current) {
            initialPlayDoneRef.current = true;
            start();
          }
        }
        if (status === 'error') notifyReady();
      });

      playingSub = bound.addListener('playingChange', ({ isPlaying }) => {
        if (!live()) return;
        if (!isPlaying) return;
        notifyReady();
        // Fallback if onFirstFrameRender is not delivered: never keep the poster up.
        if (hidePosterRef.current && !posterFallbackTimer.current) {
          posterFallbackTimer.current = setTimeout(() => {
            posterFallbackTimer.current = null;
            if (live()) setPosterVisible(false);
          }, 600);
        }
      });

      sourceLoadSub = bound.addListener('sourceLoad', (payload) => {
        if (!live()) return;
        const tracks = (payload as { availableVideoTracks?: { size?: { width?: number; height?: number } }[] })
          .availableVideoTracks;
        const track = tracks?.[0];
        if (track?.size?.width && track.size.height) {
          emitNatural(track.size.width, track.size.height);
        }
      });

      trackSub = bound.addListener('videoTrackChange', (payload) => {
        if (!live()) return;
        const videoTrack = (payload as { videoTrack?: { size?: { width?: number; height?: number } } })
          .videoTrack;
        if (videoTrack?.size?.width && videoTrack.size.height) {
          emitNatural(videoTrack.size.width, videoTrack.size.height);
        }
      });

      const size = (bound as { size?: { width?: number; height?: number } }).size;
      if (size?.width && size.height) emitNatural(size.width, size.height);
    } catch {
      // released while attaching
    }

    return () => {
      generationRef.current += 1;
      if (posterFallbackTimer.current) clearTimeout(posterFallbackTimer.current);
      posterFallbackTimer.current = null;
      removeVideoPlayerSubscription(statusSub);
      removeVideoPlayerSubscription(playingSub);
      removeVideoPlayerSubscription(sourceLoadSub);
      removeVideoPlayerSubscription(trackSub);
    };
  }, [player, autoPlay, uri, notifyReady, emitNatural]);

  const wrapStyle = explicit
    ? [
        {
          width: layoutWidth,
          height: layoutHeight,
          overflow: 'hidden' as const,
          backgroundColor: '#000',
        },
        style,
      ]
    : [style ?? StyleSheet.absoluteFillObject, styles.wrap];

  const surfaceStyle = explicit
    ? { width: layoutWidth, height: layoutHeight }
    : StyleSheet.absoluteFillObject;

  const resolvedSurfaceType =
    surfaceType ?? (Platform.OS === 'android' ? 'textureView' : undefined);

  return (
    <View style={wrapStyle}>
      {posterUri && posterVisible ? (
        <Image
          source={{ uri: posterUri }}
          style={surfaceStyle}
          contentFit={contentFit}
        />
      ) : null}
      <VideoView
        player={player}
        style={surfaceStyle}
        contentFit={contentFit}
        nativeControls={nativeControls}
        fullscreenOptions={{ enable: false }}
        useExoShutter={false}
        surfaceType={resolvedSurfaceType}
        onFirstFrameRender={handleFirstFrame}
      />
    </View>
  );
}

export function isStoryVideoNativeAvailable(): boolean {
  return isExpoVideoNativeAvailable();
}

export function StoryVideoPlayer({ posterUri, ...props }: StoryVideoPlayerProps) {
  if (!isExpoVideoNativeAvailable()) {
    return <StoryVideoFallback {...props} posterUri={posterUri} />;
  }
  // Remount on a new source so VideoView is gone before the previous player is released.
  return <StoryVideoPlayerNative key={props.uri} {...props} posterUri={posterUri} />;
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: '#000',
    overflow: 'hidden',
  },
});
