import { Component, createElement, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
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
import { getExpoVideoModule, isExpoVideoNativeAvailable } from '@/lib/expoVideo';
import { resolveMediaUrl } from '@/services/media';

type Props = {
  uri: string;
  posterUri?: string | null;
  height?: number;
  aspectRatio?: number;
  style?: StyleProp<ViewStyle>;
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
    return <NativeListingVideo uri={videoUri} posterUri={poster} containerStyle={containerStyle} />;
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
}: {
  uri: string;
  posterUri?: string;
  containerStyle: StyleProp<ViewStyle>;
}) {
  const { useVideoPlayer, VideoView } = getExpoVideoModule()!;
  const [showPoster, setShowPoster] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [playing, setPlaying] = useState(false);

  const player = useVideoPlayer({ uri }, (p) => {
    p.loop = false;
    p.muted = false;
    p.keepScreenOnWhilePlaying = false;
  });

  const hidePoster = useCallback(() => setShowPoster(false), []);

  useEffect(() => {
    setShowPoster(true);
    setLoadFailed(false);
    setPlaying(false);
    const statusSub = player.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay') hidePoster();
      if (status === 'error') setLoadFailed(true);
    });
    const playingSub = player.addListener('playingChange', ({ isPlaying }) => {
      setPlaying(Boolean(isPlaying));
      if (isPlaying) hidePoster();
    });
    return () => {
      statusSub.remove();
      playingSub.remove();
      try {
        player.pause();
      } catch {
        /* ignore */
      }
    };
  }, [hidePoster, player, uri]);

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
            if (playing) player.pause();
            else player.play();
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
