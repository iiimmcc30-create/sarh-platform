import { AppIcon } from '@/components/ui/FlaticonIcon';
import { AppText } from '@/components/ui/AppText';
import { Image, uriSource } from '@/components/ui/AppImage';
import { StoryVideoPlayer } from '@/components/feature/StoryVideoPlayer';
import { VerificationBadge } from '@/components/ui/VerificationBadge';
import { pauseAllFeedPlayback } from '@/lib/feedVideoPlayback';
import { containSizeFromRatio, normalizeAspectRatio } from '@/lib/mediaContain';
import { useHeroMediaTransition, type MediaOriginRect } from '@/lib/mediaOrigin';
import {
  clampPan,
  clampViewerScale,
  classifyViewerGesture,
  isZoomed,
  nextOverlayVisible,
  pinchScale,
  resetTransformWhenIdle,
  shouldDismissFromSwipe,
} from '@/lib/mediaViewerGestures';
import { postDetailImageUrl } from '@/lib/listingMedia';
import { getRtlRow } from '@/lib/rtl';
import type { FeedMediaItem } from '@/lib/postMedia';
import { resolveMediaUrl } from '@/services/media';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Modal,
  PanResponder,
  PixelRatio,
  Pressable,
  StatusBar,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ImageViewerModal } from '@/components/ui/ImageViewerModal';

export type MediaViewerOverlay = {
  authorName: string;
  username?: string;
  avatar?: string;
  verified?: boolean;
  text?: string;
  likes?: number;
  comments?: number;
  reposts?: number;
  views?: number;
  liked?: boolean;
  reposted?: boolean;
  bookmarked?: boolean;
  isFollowing?: boolean;
  showFollow?: boolean;
  onLike?: () => void;
  onComment?: () => void;
  onRepost?: () => void;
  onBookmark?: () => void;
  onShare?: () => void;
  onFollow?: () => void;
};

type MediaViewerModalProps = {
  visible: boolean;
  items: FeedMediaItem[];
  initialIndex?: number;
  origin?: MediaOriginRect | null;
  overlay?: MediaViewerOverlay | null;
  onClose: () => void;
};

const LIKE_RED = '#F91880';
const REPOST_GREEN = '#00BA7C';
const BOOKMARK_BLUE = '#1D9BF0';

function deliveryUri(uri: string, screenW: number): string {
  const dpr = typeof PixelRatio.get === 'function' ? PixelRatio.get() : 2;
  return postDetailImageUrl(uri, screenW, dpr) ?? uri;
}

function touchDistance(touches: readonly { pageX: number; pageY: number }[]): number {
  if (touches.length < 2) return 0;
  const [a, b] = touches;
  const dx = a.pageX - b.pageX;
  const dy = a.pageY - b.pageY;
  return Math.sqrt(dx * dx + dy * dy);
}

function ViewerMedia({
  item,
  active,
  screenW,
  screenH,
  onZoomedChange,
  onToggleOverlay,
  onDismiss,
}: {
  item: FeedMediaItem;
  active: boolean;
  screenW: number;
  screenH: number;
  onZoomedChange: (next: boolean) => void;
  onToggleOverlay: () => void;
  onDismiss: () => void;
}) {
  const [ready, setReady] = useState(false);
  const [ratio, setRatio] = useState<number | null>(null);
  const uri = resolveMediaUrl(item.uri) ?? item.uri;
  const poster = item.posterUri ? resolveMediaUrl(item.posterUri) ?? item.posterUri : undefined;
  const imageUri = deliveryUri(uri, screenW);

  const scale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const lastScale = useRef(1);
  const lastTx = useRef(0);
  const lastTy = useRef(0);
  const startDistance = useRef(0);
  const gestureStart = useRef(0);
  const boxRef = useRef({ width: screenW, height: screenH });
  const frameRef = useRef({ width: screenW, height: screenH });
  const onZoomedChangeRef = useRef(onZoomedChange);
  const onToggleOverlayRef = useRef(onToggleOverlay);
  const onDismissRef = useRef(onDismiss);
  onZoomedChangeRef.current = onZoomedChange;
  onToggleOverlayRef.current = onToggleOverlay;
  onDismissRef.current = onDismiss;

  const applySize = useCallback((width: number, height: number) => {
    const next = normalizeAspectRatio(width, height);
    if (next) setRatio(next);
  }, []);

  const box = useMemo(() => {
    const used = ratio && ratio > 0 ? ratio : 16 / 9;
    return containSizeFromRatio(used, screenW, screenH);
  }, [ratio, screenW, screenH]);
  boxRef.current = box;
  frameRef.current = { width: screenW, height: screenH };

  const resetIdle = useCallback(
    (animated: boolean) => {
      lastScale.current = 1;
      lastTx.current = 0;
      lastTy.current = 0;
      onZoomedChangeRef.current(false);
      if (animated) {
        Animated.parallel([
          Animated.spring(scale, { toValue: 1, useNativeDriver: true, bounciness: 0 }),
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true, bounciness: 0 }),
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 0 }),
        ]).start();
        return;
      }
      scale.setValue(1);
      translateX.setValue(0);
      translateY.setValue(0);
    },
    [scale, translateX, translateY],
  );

  useEffect(() => {
    if (!active) resetIdle(false);
  }, [active, resetIdle]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (event, gs) => {
        const touches = event.nativeEvent.touches?.length ?? gs.numberActiveTouches;
        const kind = classifyViewerGesture({
          touches,
          scale: lastScale.current,
          dx: gs.dx,
          dy: gs.dy,
        });
        return kind === 'pinch' || kind === 'pan' || kind === 'swipe-down';
      },
      onMoveShouldSetPanResponderCapture: (event, gs) => {
        const touches = event.nativeEvent.touches?.length ?? gs.numberActiveTouches;
        return (
          touches >= 2 ||
          isZoomed(lastScale.current) ||
          (gs.dy > 8 && gs.dy >= Math.abs(gs.dx) * 1.15)
        );
      },
      onPanResponderGrant: (event) => {
        gestureStart.current = Date.now();
        const touches = event.nativeEvent.touches ?? [];
        if (touches.length >= 2) {
          startDistance.current = touchDistance(touches);
        }
        scale.stopAnimation((v) => {
          lastScale.current = v;
        });
        translateX.stopAnimation((v) => {
          lastTx.current = v;
        });
        translateY.stopAnimation((v) => {
          lastTy.current = v;
        });
      },
      onPanResponderMove: (event, gs) => {
        const touches = event.nativeEvent.touches ?? [];
        if (touches.length >= 2) {
          if (startDistance.current <= 0) {
            startDistance.current = touchDistance(touches);
            return;
          }
          const next = pinchScale(lastScale.current, touchDistance(touches), startDistance.current);
          scale.setValue(next);
          const clamped = clampPan(lastTx.current, lastTy.current, next, boxRef.current, frameRef.current);
          translateX.setValue(clamped.x);
          translateY.setValue(clamped.y);
          onZoomedChangeRef.current(isZoomed(next));
          return;
        }

        if (isZoomed(lastScale.current)) {
          const clamped = clampPan(
            lastTx.current + gs.dx,
            lastTy.current + gs.dy,
            lastScale.current,
            boxRef.current,
            frameRef.current,
          );
          translateX.setValue(clamped.x);
          translateY.setValue(clamped.y);
          return;
        }

        if (gs.dy > 0 && gs.dy >= Math.abs(gs.dx)) {
          translateY.setValue(gs.dy);
        }
      },
      onPanResponderRelease: (_event, gs) => {
        startDistance.current = 0;
        const durationMs = Date.now() - gestureStart.current;
        const kind = classifyViewerGesture({
          touches: 1,
          scale: lastScale.current,
          dx: gs.dx,
          dy: gs.dy,
          durationMs,
        });

        if (kind === 'tap') {
          onToggleOverlayRef.current();
          return;
        }

        scale.stopAnimation((currentScale) => {
          const nextScale = clampViewerScale(currentScale);
          lastScale.current = nextScale;
          scale.setValue(nextScale);
          onZoomedChangeRef.current(isZoomed(nextScale));

          if (!isZoomed(nextScale)) {
            if (shouldDismissFromSwipe(gs.dy, nextScale)) {
              onDismissRef.current();
              return;
            }
            const idle = resetTransformWhenIdle(nextScale);
            lastTx.current = idle.x;
            lastTy.current = idle.y;
            Animated.parallel([
              Animated.spring(scale, { toValue: idle.scale, useNativeDriver: true, bounciness: 0 }),
              Animated.spring(translateX, { toValue: 0, useNativeDriver: true, bounciness: 0 }),
              Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 0 }),
            ]).start();
            return;
          }

          translateX.stopAnimation((tx) => {
            translateY.stopAnimation((ty) => {
              const clamped = clampPan(tx, ty, nextScale, boxRef.current, frameRef.current);
              lastTx.current = clamped.x;
              lastTy.current = clamped.y;
              Animated.parallel([
                Animated.spring(translateX, {
                  toValue: clamped.x,
                  useNativeDriver: true,
                  bounciness: 0,
                }),
                Animated.spring(translateY, {
                  toValue: clamped.y,
                  useNativeDriver: true,
                  bounciness: 0,
                }),
              ]).start();
            });
          });
        });
      },
      onPanResponderTerminate: () => {
        startDistance.current = 0;
      },
    }),
  ).current;

  const mediaStyle = {
    width: box.width,
    height: box.height,
    transform: [{ translateX }, { translateY }, { scale }],
  };

  const body =
    item.kind === 'image' ? (
      <Animated.Image
        source={{ uri: imageUri }}
        style={mediaStyle}
        resizeMode="contain"
        onLoad={(e) => {
          const src = e.nativeEvent?.source;
          if (src?.width && src.height) applySize(src.width, src.height);
        }}
      />
    ) : !active ? (
      poster ? (
        <Animated.Image
          source={{ uri: poster }}
          style={mediaStyle}
          resizeMode="contain"
          onLoad={(e) => {
            const src = e.nativeEvent?.source;
            if (src?.width && src.height) applySize(src.width, src.height);
          }}
        />
      ) : null
    ) : (
      <Animated.View style={mediaStyle}>
        {!ready ? (
          <View style={styles.loading}>
            <ActivityIndicator color="#fff" />
          </View>
        ) : null}
        <StoryVideoPlayer
          uri={uri}
          posterUri={poster}
          autoPlay={active}
          muted={false}
          nativeControls={false}
          contentFit="contain"
          onReady={() => setReady(true)}
          onNaturalSize={applySize}
        />
      </Animated.View>
    );

  return (
    <View
      style={[styles.slide, { width: screenW, height: screenH }]}
      {...panResponder.panHandlers}
    >
      <Pressable style={StyleSheet.absoluteFill} onPress={onToggleOverlay} />
      {body}
    </View>
  );
}

function OverlayAction({
  icon,
  color,
  count,
  filled,
  onPress,
  label,
}: {
  icon: string;
  color: string;
  count?: number;
  filled?: boolean;
  onPress?: () => void;
  label: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={styles.overlayAction}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <AppIcon name={icon} size={20} color={color} variant={filled ? 'sr' : 'rr'} />
      {typeof count === 'number' && count > 0 ? (
        <AppText style={styles.overlayCount}>{count}</AppText>
      ) : null}
    </Pressable>
  );
}

function ViewerOverlay({
  overlay,
  insetsBottom,
}: {
  overlay: MediaViewerOverlay;
  insetsBottom: number;
}) {
  const handle = overlay.username
    ? overlay.username.startsWith('@')
      ? overlay.username
      : `@${overlay.username}`
    : '';

  return (
    <View style={[styles.overlayWrap, { paddingBottom: Math.max(insetsBottom, 12) }]} pointerEvents="box-none">
      <View style={styles.overlayFade} pointerEvents="none" />
      <View style={styles.overlayInner}>
        <View style={[styles.overlayHeader, getRtlRow()]}>
          <Image source={uriSource(overlay.avatar)} style={styles.overlayAvatar} contentFit="cover" />
          <View style={styles.overlayIdentity}>
            <View style={[styles.overlayNameRow, getRtlRow()]}>
              <AppText style={styles.overlayName} numberOfLines={1}>
                {overlay.authorName}
              </AppText>
              {overlay.verified ? <VerificationBadge size={13} /> : null}
            </View>
            {handle ? (
              <AppText style={styles.overlayHandle} numberOfLines={1}>
                {handle}
              </AppText>
            ) : null}
          </View>
          {overlay.showFollow ? (
            <Pressable
              onPress={overlay.onFollow}
              style={styles.overlayFollow}
              accessibilityRole="button"
              accessibilityLabel={overlay.isFollowing ? 'متابَع' : 'متابعة'}
            >
              <AppText style={styles.overlayFollowText}>
                {overlay.isFollowing ? 'متابَع' : 'متابعة'}
              </AppText>
            </Pressable>
          ) : null}
        </View>
        {overlay.text ? (
          <AppText style={styles.overlayText} numberOfLines={4}>
            {overlay.text}
          </AppText>
        ) : null}
        <View style={[styles.overlayActions, getRtlRow()]}>
          <OverlayAction
            icon="chatbubble-ellipses-outline"
            color="#fff"
            count={overlay.comments}
            onPress={overlay.onComment}
            label="تعليق"
          />
          <OverlayAction
            icon="repeat-2"
            color={overlay.reposted ? REPOST_GREEN : '#fff'}
            count={overlay.reposts}
            onPress={overlay.onRepost}
            label="إعادة نشر"
          />
          <OverlayAction
            icon={overlay.liked ? 'heart' : 'heart-outline'}
            color={overlay.liked ? LIKE_RED : '#fff'}
            count={overlay.likes}
            filled={!!overlay.liked}
            onPress={overlay.onLike}
            label="إعجاب"
          />
          <OverlayAction
            icon="bar-chart-2"
            color="#fff"
            count={overlay.views}
            label="مشاهدات"
          />
          <OverlayAction
            icon={overlay.bookmarked ? 'bookmark' : 'bookmark-outline'}
            color={overlay.bookmarked ? BOOKMARK_BLUE : '#fff'}
            filled={!!overlay.bookmarked}
            onPress={overlay.onBookmark}
            label="حفظ"
          />
          <OverlayAction
            icon="share-up"
            color="#fff"
            onPress={overlay.onShare}
            label="مشاركة"
          />
        </View>
      </View>
    </View>
  );
}

export function MediaViewerModal({
  visible,
  items,
  initialIndex = 0,
  origin,
  overlay,
  onClose,
}: MediaViewerModalProps) {
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [overlayVisible, setOverlayVisible] = useState(true);
  const [zoomed, setZoomed] = useState(false);
  const scrollX = useRef(new Animated.Value(initialIndex * screenW)).current;

  const finishClose = useCallback(() => {
    pauseAllFeedPlayback();
    onClose();
  }, [onClose]);

  const { mounted, progress, requestClose } = useHeroMediaTransition(
    visible,
    origin,
    finishClose,
  );

  useEffect(() => {
    if (!visible) return;
    pauseAllFeedPlayback();
    setCurrentIndex(initialIndex);
    setOverlayVisible(true);
    setZoomed(false);
    scrollX.setValue(initialIndex * screenW);
  }, [visible, initialIndex, scrollX, screenW]);

  const toggleOverlay = useCallback(() => {
    setOverlayVisible((prev) => nextOverlayVisible(prev));
  }, []);

  const onScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { x: scrollX } } }],
    {
      useNativeDriver: false,
      listener: (event: { nativeEvent: { contentOffset: { x: number } } }) => {
        const idx = Math.round(event.nativeEvent.contentOffset.x / screenW);
        if (idx !== currentIndex && idx >= 0 && idx < items.length) {
          setCurrentIndex(idx);
          setZoomed(false);
        }
      },
    },
  );

  if (!items.length) return null;

  const imagesOnly = items.every((item) => item.kind === 'image');
  if (imagesOnly && !overlay) {
    return (
      <ImageViewerModal
        visible={visible}
        images={items.map((item) => item.uri)}
        initialIndex={initialIndex}
        origin={origin}
        onClose={finishClose}
      />
    );
  }

  if (!mounted) return null;

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={requestClose}
    >
      <StatusBar hidden />
      <View style={styles.shell}>
        <Animated.View style={[styles.backdropFill, { opacity: progress }]} />
        <View style={styles.heroLayer} pointerEvents="box-none">
          <Animated.ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            scrollEnabled={items.length > 1 && !zoomed}
            onScroll={onScroll}
            scrollEventThrottle={16}
            contentOffset={{ x: initialIndex * screenW, y: 0 }}
            style={{ width: screenW, height: screenH }}
          >
            {items.map((item, idx) => (
              <ViewerMedia
                key={`${item.kind}-${item.uri}-${idx}`}
                item={item}
                active={visible && idx === currentIndex}
                screenW={screenW}
                screenH={screenH}
                onZoomedChange={setZoomed}
                onToggleOverlay={toggleOverlay}
                onDismiss={requestClose}
              />
            ))}
          </Animated.ScrollView>
        </View>

        <Animated.View style={[styles.chrome, { opacity: progress }]} pointerEvents="box-none">
          {overlayVisible ? (
            <Pressable
              onPress={requestClose}
              style={[styles.closeBtn, { top: insets.top + 10 }]}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="إغلاق"
            >
              <AppIcon name="close" size={20} color="#fff" />
            </Pressable>
          ) : null}

          {overlayVisible && items.length > 1 ? (
            <View style={[styles.counter, { top: insets.top + 16 }]} pointerEvents="none">
              <AppText style={styles.counterText}>
                {currentIndex + 1} / {items.length}
              </AppText>
            </View>
          ) : null}

          {overlay && overlayVisible ? (
            <ViewerOverlay overlay={overlay} insetsBottom={insets.bottom} />
          ) : null}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: '#000',
  },
  backdropFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },
  heroLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  chrome: {
    ...StyleSheet.absoluteFillObject,
  },
  slide: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  loading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtn: {
    position: 'absolute',
    right: 16,
    zIndex: 100,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  counter: {
    position: 'absolute',
    start: 0,
    end: 0,
    zIndex: 100,
    alignItems: 'center',
  },
  counterText: {
    color: '#fff',
    fontSize: 13,
  },
  overlayWrap: {
    position: 'absolute',
    start: 0,
    end: 0,
    bottom: 0,
    zIndex: 90,
  },
  overlayFade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
  overlayInner: {
    paddingHorizontal: 16,
    paddingTop: 48,
    backgroundColor: 'rgba(0,0,0,0.42)',
    gap: 8,
  },
  overlayHeader: {
    alignItems: 'center',
    gap: 10,
  },
  overlayAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    flexShrink: 0,
  },
  overlayIdentity: {
    flex: 1,
    minWidth: 0,
  },
  overlayNameRow: {
    alignItems: 'center',
    gap: 4,
  },
  overlayName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    flexShrink: 1,
  },
  overlayHandle: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 13,
    marginTop: 1,
  },
  overlayFollow: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.85)',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 5,
    flexShrink: 0,
  },
  overlayFollowText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  overlayText: {
    color: '#fff',
    fontSize: 15,
    lineHeight: 22,
  },
  overlayActions: {
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingTop: 4,
  },
  overlayAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 36,
    minWidth: 36,
  },
  overlayCount: {
    color: '#fff',
    fontSize: 12,
  },
});
