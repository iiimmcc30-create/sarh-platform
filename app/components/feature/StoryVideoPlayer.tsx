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

type StoryVideoPlayerProps = {
  uri: string;
  posterUri?: string | null;
  style?: StyleProp<ViewStyle>;
  muted?: boolean;
  loop?: boolean;
  autoPlay?: boolean;
  nativeControls?: boolean;
  onReady?: () => void;
};

function StoryVideoFallback({
  posterUri,
  uri,
  style,
  onReady,
}: Pick<StoryVideoPlayerProps, 'uri' | 'posterUri' | 'style' | 'onReady'>) {
  const previewUri = posterUri || uri;

  useEffect(() => {
    onReady?.();
  }, [onReady]);

  return (
    <View style={style ?? StyleSheet.absoluteFillObject}>
      <Image source={{ uri: previewUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
    </View>
  );
}

function StoryVideoPlayerNative({
  uri,
  posterUri,
  style,
  muted = false,
  loop = false,
  autoPlay = true,
  nativeControls = false,
  onReady,
}: StoryVideoPlayerProps) {
  const { useVideoPlayer, VideoView } = getExpoVideoModule()!;
  const readyRef = useRef(false);

  const notifyReady = useCallback(() => {
    if (readyRef.current) return;
    readyRef.current = true;
    onReady?.();
  }, [onReady]);

  const player = useVideoPlayer(uri, (p) => {
    p.loop = loop;
    p.muted = muted;
    p.keepScreenOnWhilePlaying = false;
  });

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

    start();

    return () => {
      statusSub.remove();
      playingSub.remove();
    };
  }, [player, autoPlay, uri, notifyReady]);

  useEffect(() => {
    return () => {
      try {
        player.pause();
      } catch {
        // ignore cleanup errors
      }
    };
  }, [player]);

  return (
    <View style={[style ?? StyleSheet.absoluteFillObject, styles.wrap]}>
      {posterUri ? (
        <Image
          source={{ uri: posterUri }}
          style={StyleSheet.absoluteFillObject}
          contentFit="cover"
        />
      ) : null}
      <VideoView
        player={player}
        style={StyleSheet.absoluteFillObject}
        contentFit="cover"
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
