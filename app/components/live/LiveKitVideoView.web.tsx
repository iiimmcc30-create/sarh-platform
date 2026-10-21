import { createElement, useEffect, useRef } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import type { VideoTrack } from 'livekit-client';

/** Browser playback via livekit-client's attach(). Local preview stays muted. */
export function LiveKitVideoView({
  track,
  style,
  mirror,
  muted = false,
}: {
  track: VideoTrack;
  style?: StyleProp<ViewStyle>;
  mirror?: boolean;
  muted?: boolean;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [track]);

  return (
    <View style={style}>
      {createElement('video', {
        ref,
        autoPlay: true,
        playsInline: true,
        muted,
        style: {
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          backgroundColor: '#000',
          transform: mirror ? 'scaleX(-1)' : undefined,
        },
      })}
    </View>
  );
}
