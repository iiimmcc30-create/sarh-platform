import { AppIcon } from '@/components/ui/FlaticonIcon';
import { AppText } from '@/components/ui/AppText';
import { Image, uriSource } from '@/components/ui/AppImage';
import { StoryVideoPlayer } from '@/components/feature/StoryVideoPlayer';
import { claimFeedPlayback, releaseFeedPlayback } from '@/lib/feedVideoPlayback';
import { postFeedImageUrl } from '@/lib/listingMedia';
import type { ThemeColors } from '@/constants/theme';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  ActivityIndicator,
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

export function FeedVideoTile({
  uri,
  posterUri,
  colors,
  active = true,
  nativeControls = false,
  contentFit = 'cover',
  onOpen,
  onNaturalSize,
}: FeedVideoTileProps) {
  const id = useId();
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const pauseRef = useRef(() => setPlaying(false));
  pauseRef.current = () => setPlaying(false);

  const poster = posterDelivery(posterUri);

  useEffect(() => {
    if (!active) {
      setPlaying(false);
      setReady(false);
    }
  }, [active]);

  useEffect(() => {
    if (!playing) {
      releaseFeedPlayback(id);
      return;
    }
    claimFeedPlayback(id, () => pauseRef.current());
    return () => releaseFeedPlayback(id);
  }, [id, playing]);

  const startInline = useCallback(() => {
    if (failed) return;
    setFailed(false);
    setReady(false);
    setPlaying(true);
  }, [failed]);

  if (failed) {
    return (
      <Pressable
        style={[styles.fill, { backgroundColor: colors.bgElevated }]}
        onPress={onOpen}
      >
        {poster ? (
          <Image source={uriSource(poster)} style={StyleSheet.absoluteFill} contentFit={contentFit} />
        ) : null}
        <View style={styles.centerOverlay} pointerEvents="none">
          <AppText style={styles.errorText}>تعذّر تشغيل الفيديو</AppText>
        </View>
      </Pressable>
    );
  }

  return (
    <View style={styles.fill}>
      {poster ? (
        <Image source={uriSource(poster)} style={StyleSheet.absoluteFill} contentFit={contentFit} />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }]} />
      )}

      {playing ? (
        <StoryVideoPlayer
          uri={uri}
          posterUri={poster}
          autoPlay
          muted={false}
          nativeControls={nativeControls}
          contentFit={contentFit}
          onReady={() => setReady(true)}
          onNaturalSize={onNaturalSize}
        />
      ) : null}

      {playing && !ready ? (
        <View style={styles.centerOverlay} pointerEvents="none">
          <ActivityIndicator color="#fff" />
        </View>
      ) : null}

      {!playing ? (
        <>
          <Pressable style={StyleSheet.absoluteFill} onPress={onOpen} />
          <Pressable
            style={styles.playHit}
            onPress={startInline}
            accessibilityRole="button"
            accessibilityLabel="تشغيل الفيديو"
          >
            <View style={styles.playBtn}>
              <AppIcon name="play" size={22} color="#fff" variant="sr" />
            </View>
          </Pressable>
        </>
      ) : (
        <Pressable style={StyleSheet.absoluteFill} onPress={onOpen} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  centerOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
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
  errorText: {
    color: '#fff',
    fontSize: 13,
  },
});
