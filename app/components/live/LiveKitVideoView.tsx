import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { VideoView } from '@livekit/react-native';
import type { VideoTrack } from 'livekit-client';

export function LiveKitVideoView({
  track,
  style,
  mirror,
}: {
  track: VideoTrack;
  style?: StyleProp<ViewStyle>;
  mirror?: boolean;
}) {
  return (
    <View style={style}>
      <VideoView
        videoTrack={track}
        style={StyleSheet.absoluteFillObject}
        objectFit="cover"
        mirror={mirror}
      />
    </View>
  );
}
