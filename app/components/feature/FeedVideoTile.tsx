import { AppIcon } from '@/components/ui/FlaticonIcon';
import { AppText } from '@/components/ui/AppText';
import { Image, uriSource } from '@/components/ui/AppImage';
import { StoryVideoPlayer } from '@/components/feature/StoryVideoPlayer';
import { claimFeedPlayback, releaseFeedPlayback } from '@/lib/feedVideoPlayback';
import { useFeedVideoGestures } from '@/lib/useFeedVideoGestures';
import { postFeedImageUrl } from '@/lib/listingMedia';
import type { ThemeColors } from '@/constants/theme';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  PixelRatio,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';

type FeedVideoTileProps = {
  uri: string;
  posterUri?: string;
  colors: ThemeColors;
  active?: boolean;
  nativeControls?: boolean;
  contentFit?: 'cover' | 'contain';
  onOpen?: () => void;
  onNaturalSize?: (width: number, height: number) => void;
  /** Feed posts only. Single tap toggles the post chrome. */
  onToggleChrome?: () => void;
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
  onToggleChrome,
}: FeedVideoTileProps) {
  const id = useId();
  const hostRef = useRef<View>(null);
  const [sessionUri, setSessionUri] = useState<string | null>(null);
  const playing = active && sessionUri === uri;
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [focused, setFocused] = useState(true);
  const [zoomed, setZoomed] = useState(false);
  const gesturesOn = typeof onToggleChrome === 'function';
  const pauseRef = useRef(() => setSessionUri(null));
  pauseRef.current = () => setSessionUri(null);

  const { gesture, animatedStyle, onLayout, resetZoom } = useFeedVideoGestures({
    enabled: gesturesOn,
    active: active && focused,
    resetKey: uri,
    onToggleChrome: onToggleChrome ?? noopToggle,
    onZoomedChange: setZoomed,
  });

  const poster = posterDelivery(posterUri);

  useEffect(() => {
    if (!active) {
      setSessionUri(null);
      setReady(false);
    }
  }, [active]);

  useEffect(() => {
    setReady(false);
    setFailed(false);
  }, [uri]);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => {
        setFocused(false);
        setSessionUri(null);
        setReady(false);
      };
    }, []),
  );

  useEffect(() => {
    if (!gesturesOn || !zoomed) return;
    const timer = setInterval(() => {
      hostRef.current?.measureInWindow((_x, y, _w, h) => {
        if (h <= 0) return;
        const windowH = Dimensions.get('window').height;
        const visible = Math.max(0, Math.min(windowH, y + h) - Math.max(0, y));
        if (visible / h < 0.15) resetZoom();
      });
    }, 400);
    return () => clearInterval(timer);
  }, [gesturesOn, resetZoom, zoomed]);

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
    setSessionUri(uri);
  }, [failed, uri]);

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

  const media = (
    <>
      {poster ? (
        <Image source={uriSource(poster)} style={StyleSheet.absoluteFill} contentFit={contentFit} />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }]} />
      )}

      {playing ? (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
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
        </View>
      ) : null}

      {playing && !ready ? (
        <View style={styles.centerOverlay} pointerEvents="none">
          <ActivityIndicator color="#fff" />
        </View>
      ) : null}
    </>
  );

  if (gesturesOn) {
    return (
      <View
        ref={hostRef}
        style={styles.fill}
        onLayout={(e) => onLayout(e.nativeEvent.layout.width, e.nativeEvent.layout.height)}
      >
        <GestureDetector gesture={gesture}>
          <Animated.View style={[StyleSheet.absoluteFill, animatedStyle]} collapsable={false}>
            {media}
          </Animated.View>
        </GestureDetector>
        {!playing ? (
          <Pressable
            style={styles.playFab}
            onPress={startInline}
            accessibilityRole="button"
            accessibilityLabel="تشغيل الفيديو"
          >
            <View style={styles.playBtn}>
              <AppIcon name="play" size={22} color="#fff" variant="sr" />
            </View>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.fill}>
      {media}
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

function noopToggle() {}

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
  playFab: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 52,
    height: 52,
    marginTop: -26,
    marginLeft: -26,
    zIndex: 2,
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
