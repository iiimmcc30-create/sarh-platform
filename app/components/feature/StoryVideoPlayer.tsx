import { useCallback, useEffect, useRef } from 'react';
import {
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Image } from '@/components/ui/AppImage';
import { getExpoVideoModule, isExpoVideoNativeAvailable } from '@/lib/expoVideo';
import { normalizeAspectRatio } from '@/lib/mediaContain';

type StoryVideoFit = 'cover' | 'contain';

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
  onReady,
  onNaturalSize,
  onPlayer,
}: StoryVideoPlayerProps) {
  const { useVideoPlayer, VideoView } = getExpoVideoModule()!;
  const readyRef = useRef(false);

  const explicit =
    layoutWidth != null && layoutHeight != null && layoutWidth > 0 && layoutHeight > 0;

  const notifyReady = useCallback(() => {
    if (readyRef.current) return;
    readyRef.current = true;
    onReady?.();
  }, [onReady]);

  const emitNatural = useCallback(
    (width: number, height: number) => {
      const ratio = normalizeAspectRatio(width, height);
      if (!ratio) return;
      onNaturalSize?.(width, height);
    },
    [onNaturalSize],
  );

  const player = useVideoPlayer(uri, (p) => {
    p.loop = loop;
    p.muted = muted;
    p.keepScreenOnWhilePlaying = false;
  });

  useEffect(() => {
    onPlayer?.(player);
  }, [onPlayer, player]);

  useEffect(() => {
    readyRef.current = false;
  }, [uri]);

  useEffect(() => {
    player.loop = loop;
    player.muted = muted;
    player.keepScreenOnWhilePlaying = false;
  }, [player, loop, muted]);

  useEffect(() => {
    if (!autoPlay) {
      player.pause();
      return;
    }

    const start = () => {
      try {
        player.play();
      } catch {
        // retry when the player becomes ready
      }
    };

    if (player.status === 'readyToPlay') {
      notifyReady();
      start();
    }

    const statusSub = player.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay') {
        notifyReady();
        if (autoPlay) start();
      }
      if (status === 'error') {
        notifyReady();
      }
    });

    const playingSub = player.addListener('playingChange', ({ isPlaying }) => {
      if (isPlaying) notifyReady();
    });

    const sourceLoadSub = player.addListener('sourceLoad', (payload) => {
      const tracks = (payload as { availableVideoTracks?: { size?: { width?: number; height?: number } }[] })
        .availableVideoTracks;
      const track = tracks?.[0];
      if (track?.size?.width && track.size.height) {
        emitNatural(track.size.width, track.size.height);
      }
    });

    const trackSub = player.addListener('videoTrackChange', (payload) => {
      const videoTrack = (payload as { videoTrack?: { size?: { width?: number; height?: number } } })
        .videoTrack;
      if (videoTrack?.size?.width && videoTrack.size.height) {
        emitNatural(videoTrack.size.width, videoTrack.size.height);
      }
    });

    start();

    try {
      const size = (player as { size?: { width?: number; height?: number } }).size;
      if (size?.width && size.height) emitNatural(size.width, size.height);
    } catch {
      // optional
    }

    return () => {
      statusSub.remove();
      playingSub.remove();
      sourceLoadSub.remove();
      trackSub.remove();
    };
  }, [player, autoPlay, uri, notifyReady, emitNatural]);

  useEffect(() => {
    return () => {
      try {
        player.pause();
      } catch {
        // ignore cleanup errors
      }
    };
  }, [player]);

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

  return (
    <View style={wrapStyle}>
      {posterUri ? (
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
        surfaceType={Platform.OS === 'android' ? 'textureView' : undefined}
        onFirstFrameRender={notifyReady}
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
  return <StoryVideoPlayerNative {...props} posterUri={posterUri} />;
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: '#000',
    overflow: 'hidden',
  },
});
