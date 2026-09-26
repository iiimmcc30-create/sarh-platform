import { AppIcon } from '@/components/ui/FlaticonIcon';
import { Image, uriSource } from '@/components/ui/AppImage';
import { useFeedVideoGestures } from '@/lib/useFeedVideoGestures';
import { postFeedImageUrl } from '@/lib/listingMedia';
import type { ThemeColors } from '@/constants/theme';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
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
  /** Feed posts only. Single tap toggles the post chrome. */
  onToggleChrome?: () => void;
};

function posterDelivery(uri?: string): string | undefined {
  if (!uri) return undefined;
  const screenW = Dimensions.get('window').width;
  const dpr = typeof PixelRatio.get === 'function' ? PixelRatio.get() : 2;
  return postFeedImageUrl(uri, screenW, dpr) ?? uri;
}

/**
 * Feed video is preview-only; tap opens Media Viewer for playback.
 * With `onToggleChrome` (feed posts), the preview also gets single-tap chrome
 * toggle and pinch / double-tap zoom; the play button still opens the viewer.
 */
export function FeedVideoTile({
  uri,
  posterUri,
  active = true,
  contentFit = 'cover',
  onOpen,
  onToggleChrome,
}: FeedVideoTileProps) {
  const hostRef = useRef<View>(null);
  const [focused, setFocused] = useState(true);
  const [zoomed, setZoomed] = useState(false);
  const gesturesOn = typeof onToggleChrome === 'function';

  // Zoom resets when the page is inactive, the screen blurs, or the source changes.
  const { panHandlers, touchHandlers, animatedStyle, onLayout, resetZoom } = useFeedVideoGestures({
    enabled: gesturesOn,
    active: active && focused,
    resetKey: uri,
    onToggleChrome: onToggleChrome ?? noopToggle,
    onZoomedChange: setZoomed,
  });

  const poster = posterDelivery(posterUri);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => {
        setFocused(false);
      };
    }, []),
  );

  // Reset zoom once the tile is scrolled (almost) out of view.
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

  const media = poster ? (
    <Image source={uriSource(poster)} style={StyleSheet.absoluteFill} contentFit={contentFit} />
  ) : (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }]} />
  );

  if (gesturesOn) {
    return (
      <View
        ref={hostRef}
        style={styles.fill}
        collapsable={false}
        onLayout={(e) => onLayout(e.nativeEvent.layout.width, e.nativeEvent.layout.height)}
      >
        {/*
          Gesture surface: this View hosts the rendered media, so it is the touch
          target. Pinch / zoomed pan claim the responder here (capture phase, native
          list blocked); taps are read from raw touch events. The media itself is
          pointerEvents="none" so locationX/Y are in unscaled surface coordinates.
        */}
        <View
          style={StyleSheet.absoluteFill}
          collapsable={false}
          testID="feed-video-gesture-surface"
          {...panHandlers}
          {...touchHandlers}
        >
          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, animatedStyle]}
            collapsable={false}
          >
            {media}
          </Animated.View>
        </View>
        {/* Sibling, not a child: its taps never reach the surface handlers. */}
        <Pressable
          style={styles.playFab}
          onPress={onOpen}
          accessibilityRole="button"
          accessibilityLabel="فتح الفيديو"
        >
          <View style={styles.playBtn}>
            <AppIcon name="play" size={22} color="#fff" variant="sr" />
          </View>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.fill}>
      {media}

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

function noopToggle() {}

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
});
