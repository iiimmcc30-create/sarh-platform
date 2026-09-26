import { AppIcon } from '@/components/ui/FlaticonIcon';
import { Image, uriSource } from '@/components/ui/AppImage';
import { postFeedImageUrl } from '@/lib/listingMedia';
import type { ThemeColors } from '@/constants/theme';
import {
  Dimensions,
  PixelRatio,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

type FeedVideoTileProps = {
  uri: string;
  posterUri?: string;
  colors: ThemeColors;
  active?: boolean;
  nativeControls?: boolean;
  contentFit?: 'cover' | 'contain';
  onOpen?: () => void;
  onNaturalSize?: (width: number, height: number) => void;
};

function posterDelivery(uri?: string): string | undefined {
  if (!uri) return undefined;
  const screenW = Dimensions.get('window').width;
  const dpr = typeof PixelRatio.get === 'function' ? PixelRatio.get() : 2;
  return postFeedImageUrl(uri, screenW, dpr) ?? uri;
}

/** Feed video is preview-only; tap opens Media Viewer for playback. */
export function FeedVideoTile({
  posterUri,
  contentFit = 'cover',
  onOpen,
}: FeedVideoTileProps) {
  const poster = posterDelivery(posterUri);

  return (
    <View style={styles.fill}>
      {poster ? (
        <Image source={uriSource(poster)} style={StyleSheet.absoluteFill} contentFit={contentFit} />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }]} />
      )}

      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel="فتح الفيديو"
      >
        <View style={styles.playHit} pointerEvents="none">
          <View style={styles.playBtn}>
            <AppIcon name="play" size={22} color="#fff" variant="sr" />
          </View>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  playHit: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingStart: 3,
  },
});
