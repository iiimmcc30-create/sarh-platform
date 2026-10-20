import { createElement } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

/** Native HLS only (Safari). Other browsers fire `error`, which sends the viewer to the retry state. */
export function HlsPlayerView({
  url,
  style,
  onError,
}: {
  url: string;
  style?: StyleProp<ViewStyle>;
  onError?: (message: string) => void;
}) {
  return (
    <View style={style}>
      {createElement('video', {
        src: url,
        autoPlay: true,
        playsInline: true,
        onError: () => onError?.('playback_error'),
        style: { width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 },
      })}
    </View>
  );
}
