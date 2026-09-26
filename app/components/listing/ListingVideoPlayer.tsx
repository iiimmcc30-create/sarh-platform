import {
  Component,
  createElement,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from 'react';
import { useFocusEffect } from 'expo-router';
import {
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { Image } from '@/components/ui/AppImage';
import {
  getExpoVideoModule,
  isExpoVideoNativeAvailable,
  isSameVideoPlayerSession,
  removeVideoPlayerSubscription,
  type ExpoVideoPlayer,
} from '@/lib/expoVideo';
import { claimFeedPlayback, releaseFeedPlayback } from '@/lib/feedVideoPlayback';
import { resolveMediaUrl } from '@/services/media';

type Props = {
  uri: string;
  posterUri?: string | null;
  height?: number;
  aspectRatio?: number;
  style?: StyleProp<ViewStyle>;
  /**
   * Filled with a session-guarded pause() while the native preview is mounted, so
   * the screen can stop the preview synchronously before opening the Media Viewer.
   */
  pauseRef?: MutableRefObject<(() => void) | null>;
};

const MEDIA_SURFACE = '#102633';

export function ListingVideoPlayer(props: Props) {
  return (
    <VideoErrorBoundary fallback={<VideoOpenFallback {...props} />}>
      <ListingVideoPlayerInner {...props} />
    </VideoErrorBoundary>
  );
}

function ListingVideoPlayerInner({
  uri,
  posterUri,
  height,
  aspectRatio = 16 / 9,
  style,
  pauseRef,
}: Props) {
  const videoUri = resolveMediaUrl(uri) ?? uri;
  const poster = resolveMediaUrl(posterUri) ?? posterUri ?? undefined;

  const containerStyle = useMemo(
    () => [styles.container, height ? { height, width: '100%' as const } : { aspectRatio }, style],
    [aspectRatio, height, style],
  );

  if (Platform.OS === 'web') {
    return (
      <WebListingVideo uri={videoUri} poster={poster} containerStyle={containerStyle} />
    );
  }

  if (isExpoVideoNativeAvailable()) {
    return (
      <NativeListingVideo
        key={videoUri}
        uri={videoUri}
        posterUri={poster}
        containerStyle={containerStyle}
        pauseRef={pauseRef}
      />
    );
  }

  return <VideoOpenFallback uri={videoUri} posterUri={poster} style={containerStyle} />;
}

function WebListingVideo({
  uri,
  poster,
  containerStyle,
}: {
  uri: string;
  poster?: string;
  containerStyle: StyleProp<ViewStyle>;
}) {
  const [playing, setPlaying] = useState(false);

  return (
    <View style={containerStyle}>
      {createElement('video', {
        src: uri,
        poster,
        controls: false,
        playsInline: true,
        preload: 'metadata',
        autoPlay: false,
        onPlay: () => setPlaying(true),
        onPause: () => setPlaying(false),
        onEnded: () => setPlaying(false),
        style: {
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          backgroundColor: MEDIA_SURFACE,
        },
        onClick: (event: { currentTarget: { paused: boolean; play: () => void; pause: () => void } }) => {
          const node = event.currentTarget;
          if (node.paused) node.play();
          else node.pause();
        },
      })}
      {playing ? null : (
        <View pointerEvents="none" style={styles.playBtn}>
          <View style={styles.playBtnCircle}>
            <AppIcon name="play" size={24} color="#fff" />
          </View>
        </View>
      )}
    </View>
  );
}

function NativeListingVideo({
  uri,
  posterUri,
  containerStyle,
  pauseRef,
}: {
  uri: string;
  posterUri?: string;
  containerStyle: StyleProp<ViewStyle>;
  pauseRef?: MutableRefObject<(() => void) | null>;
}) {
  const { useVideoPlayer, VideoView } = getExpoVideoModule()!;
  const [showPoster, setShowPoster] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const generationRef = useRef(0);
  const playerRef = useRef<ExpoVideoPlayer | null>(null);
  const sourceRef = useRef(uri);
  const playbackId = useId();

  if (sourceRef.current !== uri) {
    sourceRef.current = uri;
    generationRef.current += 1;
    playerRef.current = null;
  }

  // Registered in the shared playback slot while playing, so opening the Media
  // Viewer (pauseAllFeedPlayback) or another preview pauses this one first.
  const pauseForHandoff = useCallback(() => {
    const generation = generationRef.current;
    const current = playerRef.current;
    if (!isSameVideoPlayerSession(current, generation, playerRef, generationRef)) return;
    try {
      current.pause();
    } catch {
      /* released */
    }
    setPlaying(false);
  }, []);

  useEffect(() => {
    if (!pauseRef) return;
    pauseRef.current = pauseForHandoff;
    return () => {
      if (pauseRef.current === pauseForHandoff) pauseRef.current = null;
    };
  }, [pauseForHandoff, pauseRef]);

  useEffect(() => {
    return () => {
      releaseFeedPlayback(playbackId);
      const current = playerRef.current;
      generationRef.current += 1;
      playerRef.current = null;
      if (!current) return;
      try {
        current.pause();
      } catch {
        /* ignore */
      }
    };
  }, [playbackId]);

  const player = useVideoPlayer({ uri }, (p) => {
    p.loop = false;
    p.muted = false;
    p.keepScreenOnWhilePlaying = false;
  });
  playerRef.current = player;

  useFocusEffect(
    useCallback(() => {
      return () => {
        const generation = generationRef.current;
        const current = playerRef.current;
        if (!isSameVideoPlayerSession(current, generation, playerRef, generationRef)) return;
        setPlaying(false);
        try {
          if (!isSameVideoPlayerSession(current, generation, playerRef, generationRef)) return;
          current.pause();
        } catch {
          /* released */
        }
      };
    }, []),
  );

  const hidePoster = useCallback(() => setShowPoster(false), []);

  useEffect(() => {
    const generation = generationRef.current;
    const bound = player;
    const live = () => isSameVideoPlayerSession(bound, generation, playerRef, generationRef);

    setShowPoster(true);
    setLoadFailed(false);
    setPlaying(false);
    if (!live()) return;

    let statusSub: { remove: () => void } | null = null;
    let playingSub: { remove: () => void } | null = null;
    try {
      statusSub = bound.addListener('statusChange', ({ status }) => {
        if (!live()) return;
        if (status === 'readyToPlay') hidePoster();
        if (status === 'error') setLoadFailed(true);
      });
      playingSub = bound.addListener('playingChange', ({ isPlaying }) => {
        if (!live()) return;
        setPlaying(Boolean(isPlaying));
        if (isPlaying) {
          hidePoster();
          claimFeedPlayback(playbackId, pauseForHandoff);
        } else {
          releaseFeedPlayback(playbackId);
        }
      });
    } catch {
      removeVideoPlayerSubscription(statusSub);
      removeVideoPlayerSubscription(playingSub);
      return;
    }

    return () => {
      generationRef.current += 1;
      removeVideoPlayerSubscription(statusSub);
      removeVideoPlayerSubscription(playingSub);
    };
  }, [hidePoster, pauseForHandoff, playbackId, player, uri]);

  const posterVisible = Boolean(posterUri) && (showPoster || loadFailed);

  return (
    <View style={containerStyle}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFillObject}
        contentFit="cover"
        nativeControls={false}
        allowsFullscreen={false}
        allowsPictureInPicture={false}
        useExoShutter={false}
        surfaceType={Platform.OS === 'android' ? 'textureView' : undefined}
        onFirstFrameRender={hidePoster}
      />
      {posterVisible ? (
        <Image source={{ uri: posterUri }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
      ) : null}
      {loadFailed && !posterUri ? (
        <View style={styles.missingMedia}>
          <AppIcon name="videocam-off" size={28} color="rgba(255,255,255,0.55)" />
        </View>
      ) : null}
      {loadFailed ? null : (
        <Pressable
          style={styles.playBtn}
          onPress={() => {
            const generation = generationRef.current;
            const current = playerRef.current;
            if (!isSameVideoPlayerSession(current, generation, playerRef, generationRef)) return;
            try {
              if (!isSameVideoPlayerSession(current, generation, playerRef, generationRef)) return;
              if (playing) current.pause();
              else current.play();
            } catch {
              /* released */
            }
          }}
          accessibilityRole="button"
          accessibilityLabel={playing ? 'إيقاف فيديو الإعلان' : 'تشغيل فيديو الإعلان'}
        >
          {playing ? null : (
            <View style={styles.playBtnCircle}>
              <AppIcon name="play" size={24} color="#fff" />
            </View>
          )}
        </Pressable>
      )}
    </View>
  );
}

function VideoOpenFallback({
  uri,
  posterUri,
  height,
  aspectRatio = 16 / 9,
  style,
}: Props) {
  const videoUri = resolveMediaUrl(uri) ?? uri;
  const poster = resolveMediaUrl(posterUri) ?? posterUri ?? undefined;
  const containerStyle = [
    styles.container,
    height ? { height, width: '100%' as const } : { aspectRatio },
    style,
  ];

  return (
    <View style={containerStyle}>
      {poster ? (
        <Image source={{ uri: poster }} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : (
        <View style={styles.missingMedia}>
          <AppIcon name="videocam-off" size={28} color="rgba(255,255,255,0.55)" />
        </View>
      )}
      <Pressable
        style={styles.playBtn}
        onPress={() => void Linking.openURL(videoUri)}
        accessibilityRole="button"
        accessibilityLabel="تشغيل فيديو الإعلان"
      >
        <View style={styles.playBtnCircle}>
          <AppIcon name="play" size={24} color="#fff" />
        </View>
      </Pressable>
    </View>
  );
}

class VideoErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignSelf: 'stretch',
    backgroundColor: MEDIA_SURFACE,
    overflow: 'hidden',
  },
  missingMedia: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: MEDIA_SURFACE,
  },
  playBtn: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtnCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
