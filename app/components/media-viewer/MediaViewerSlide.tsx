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
  /** Fullscreen media must letterbox — never cover/crop. */
  contentFit = 'contain',
  resizeMode = 'contain',
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
  contentFit?: 'contain' | 'cover';
  resizeMode?: 'contain' | 'cover';
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
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    setNaturalRatio(null);
    setPosterRatio(null);
    setReady(false);
    setPlayer(null);
    setMuted(false);
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

  const isVideo = item.kind === 'video';

  const { gesture, animatedStyle, videoLayout, resetTransform } = useMediaViewerTransform({
    box: box.width > 0 ? box : { width: screenW, height: screenH * 0.3 },
    frame,
    onZoomedChange,
    onToggleOverlay,
    onDismiss,
    enabled: active,
    zoomStyle: isVideo ? 'nativeLayout' : 'transform',
  });

  useEffect(() => {
    if (!active) resetTransform(false);
  }, [active, resetTransform]);

  const { playback, togglePlay, replay, seekTo } = useMediaViewerPlaybackOptional(
    player,
    active && item.kind === 'video',
  );

  const showLoading = item.kind === 'video' && active && resolved.awaitingMetadata && !ready;

  void contentFit;
  void resizeMode;
  void seekTo;

  const toggleMute = useCallback(() => {
    setMuted((m) => !m);
  }, []);

  const videoSurface =
    !active ? (
      poster && resolved.layoutRatio && videoLayout ? (
        <Image
          source={uriSource(poster)}
          style={{
            width: videoLayout.width,
            height: videoLayout.height,
          }}
          contentFit="contain"
        />
      ) : null
    ) : resolved.layoutRatio && videoLayout ? (
      <View
        style={{
          width: videoLayout.width,
          height: videoLayout.height,
          overflow: 'hidden',
          backgroundColor: '#000',
        }}
      >
        {!ready ? (
          <View style={styles.loading}>
            <ActivityIndicator color="#fff" />
          </View>
        ) : null}
        <StoryVideoPlayer
          uri={uri}
          posterUri={poster}
          layoutWidth={videoLayout.width}
          layoutHeight={videoLayout.height}
          autoPlay={active}
          muted={muted}
          nativeControls={false}
          contentFit="contain"
          hidePosterWhenPlaying
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

  const imageBody =
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
    ) : null;

  const controlsBottom = insets.bottom + controlsBottomInset;

  return (
    <View style={[styles.slide, { width: screenW, height: screenH }]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onToggleOverlay} />

      <GestureDetector gesture={gesture}>
        <View style={[styles.gestureStage, { width: screenW, height: screenH }]}>
          {isVideo && box.width > 0 && videoLayout ? (
            <View
              style={[
                styles.videoHost,
                {
                  left: videoLayout.left,
                  top: videoLayout.top,
                  width: videoLayout.width,
                  height: videoLayout.height,
                },
              ]}
              collapsable={false}
            >
              {videoSurface}
            </View>
          ) : (
            <Animated.View
              style={[
                styles.mediaCenter,
                { width: screenW, height: screenH },
                animatedStyle,
              ]}
            >
              {imageBody}
            </Animated.View>
          )}
        </View>
      </GestureDetector>

      {item.kind === 'video' && active ? (
        <View
          style={{
            position: 'absolute',
            start: 0,
            end: 0,
            bottom: controlsBottom,
          }}
          pointerEvents="box-none"
        >
          <MediaViewerControls
            playback={playback}
            onTogglePlay={togglePlay}
            onReplay={replay}
            onSeek={seekTo}
            visible={overlayVisible}
            muted={muted}
            onToggleMute={toggleMute}
            onToggleChrome={onToggleOverlay}
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
  gestureStage: {
    position: 'relative',
  },
  videoHost: {
    position: 'absolute',
    backgroundColor: '#000',
  },
  mediaCenter: {
    flex: 1,
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
