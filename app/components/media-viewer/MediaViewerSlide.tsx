import { StoryVideoPlayer } from '@/components/feature/StoryVideoPlayer';
import { MediaViewerControls } from '@/components/media-viewer/MediaViewerControls';
import { Image, uriSource } from '@/components/ui/AppImage';
import { resolveMediaLayoutRatio } from '@/lib/mediaAspectRatio';
import { containSizeFromRatio, normalizeAspectRatio } from '@/lib/mediaContain';
import type { FeedMediaItem } from '@/lib/postMedia';
import { postDetailImageUrl } from '@/lib/listingMedia';
import { useMediaViewerPlaybackOptional } from '@/lib/useMediaViewerPlayback';
import { useMediaViewerTransform } from '@/lib/useMediaViewerTransform';
import { resolveMediaUrl } from '@/services/media';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image as RNImage,
  PixelRatio,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function deliveryUri(uri: string, screenW: number): string {
  const dpr = typeof PixelRatio.get === 'function' ? PixelRatio.get() : 2;
  return postDetailImageUrl(uri, screenW, dpr) ?? uri;
}

export function MediaViewerSlide({
  item,
  active,
  screenW,
  screenH,
  cachedRatio,
  overlayVisible,
  controlsBottomInset = 0,
  onZoomedChange,
  onToggleOverlay,
  onDismiss,
}: {
  item: FeedMediaItem;
  active: boolean;
  screenW: number;
  screenH: number;
  cachedRatio?: number | null;
  overlayVisible: boolean;
  controlsBottomInset?: number;
  onZoomedChange: (next: boolean) => void;
  onToggleOverlay: () => void;
  onDismiss: () => void;
}) {
  const insets = useSafeAreaInsets();
  const uri = resolveMediaUrl(item.uri) ?? item.uri;
  const poster = item.posterUri ? resolveMediaUrl(item.posterUri) ?? item.posterUri : undefined;
  const imageUri = deliveryUri(uri, screenW);

  const [naturalRatio, setNaturalRatio] = useState<number | null>(null);
  const [posterRatio, setPosterRatio] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const [player, setPlayer] = useState<unknown>(null);

  useEffect(() => {
    setNaturalRatio(null);
    setPosterRatio(null);
    setReady(false);
    setPlayer(null);
  }, [item.uri, item.kind]);

  useEffect(() => {
    if (item.kind !== 'video' || !poster) return;
    RNImage.getSize(
      poster,
      (width, height) => {
        const next = normalizeAspectRatio(width, height);
        if (next) setPosterRatio(next);
      },
      () => undefined,
    );
  }, [item.kind, poster]);

  const applyNaturalSize = useCallback((width: number, height: number) => {
    const next = normalizeAspectRatio(width, height);
    if (next) setNaturalRatio(next);
  }, []);

  const resolved = resolveMediaLayoutRatio({
    naturalRatio,
    cachedRatio: cachedRatio ?? null,
    posterRatio,
  });

  const frame = useMemo(() => ({ width: screenW, height: screenH }), [screenW, screenH]);

  const box = useMemo(() => {
    if (!resolved.layoutRatio) {
      return { width: 0, height: 0 };
    }
    return containSizeFromRatio(resolved.layoutRatio, screenW, screenH);
  }, [resolved.layoutRatio, screenW, screenH]);

  const { gesture, animatedStyle, resetTransform } = useMediaViewerTransform({
    box: box.width > 0 ? box : { width: screenW, height: screenH * 0.3 },
    frame,
    onZoomedChange,
    onToggleOverlay,
    onDismiss,
    enabled: active,
  });

  useEffect(() => {
    if (!active) resetTransform(false);
  }, [active, resetTransform]);

  const { playback, togglePlay, replay, seekTo } = useMediaViewerPlaybackOptional(
    player,
    active && item.kind === 'video',
  );

  const showLoading = item.kind === 'video' && active && resolved.awaitingMetadata && !ready;

  const mediaBody =
    item.kind === 'image' ? (
      <Animated.Image
        source={{ uri: imageUri }}
        style={[styles.mediaSurface, { width: box.width, height: box.height }]}
        resizeMode="contain"
        onLoad={(e) => {
          const src = e.nativeEvent?.source;
          if (src?.width && src.height) applyNaturalSize(src.width, src.height);
        }}
      />
    ) : !active ? (
      poster && resolved.layoutRatio ? (
        <Image
          source={uriSource(poster)}
          style={{ width: box.width, height: box.height }}
          contentFit="contain"
        />
      ) : null
    ) : resolved.layoutRatio ? (
      <View style={{ width: box.width, height: box.height }}>
        {!ready ? (
          <View style={styles.loading}>
            <ActivityIndicator color="#fff" />
          </View>
        ) : null}
        <StoryVideoPlayer
          uri={uri}
          posterUri={poster}
          layoutWidth={box.width}
          layoutHeight={box.height}
          autoPlay={active}
          muted={false}
          nativeControls={false}
          contentFit="contain"
          onReady={() => setReady(true)}
          onNaturalSize={applyNaturalSize}
          onPlayer={setPlayer}
        />
      </View>
    ) : showLoading ? (
      <View style={styles.loading}>
        <ActivityIndicator color="#fff" size="large" />
      </View>
    ) : null;

  return (
    <View style={[styles.slide, { width: screenW, height: screenH }]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onToggleOverlay} />
      <GestureDetector gesture={gesture}>
        <Animated.View style={[styles.mediaCenter, animatedStyle]}>
          {mediaBody}
        </Animated.View>
      </GestureDetector>
      {item.kind === 'video' && active ? (
        <View
          style={{
            position: 'absolute',
            start: 0,
            end: 0,
            bottom: insets.bottom + controlsBottomInset,
          }}
          pointerEvents="box-none"
        >
          <MediaViewerControls
            playback={playback}
            onTogglePlay={togglePlay}
            onReplay={replay}
            onSeek={seekTo}
            visible={overlayVisible}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  slide: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  mediaCenter: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaSurface: {
    backgroundColor: '#000',
  },
  loading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
