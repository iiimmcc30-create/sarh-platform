import { useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';

/** CDN-backed HLS playback (delayed ~5-10s). Reports player errors so the viewer state machine can react. */
export function HlsPlayerView({
  url,
  style,
  onError,
}: {
  url: string;
  style?: StyleProp<ViewStyle>;
  onError?: (message: string) => void;
}) {
  const player = useVideoPlayer({ uri: url }, (p) => {
    p.loop = false;
    p.muted = false;
    p.play();
  });

  useEffect(() => {
    const sub = player.addListener('statusChange', ({ status, error }) => {
      if (status === 'error') onError?.(error?.message ?? 'playback_error');
    });
    return () => sub.remove();
  }, [player, onError]);

  return (
    <View style={style}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFillObject}
        contentFit="cover"
        nativeControls={false}
      />
    </View>
  );
}
