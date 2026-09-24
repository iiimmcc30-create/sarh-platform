import { AppIcon } from '@/components/ui/FlaticonIcon';
import { AppText } from '@/components/ui/AppText';
import { Image, uriSource } from '@/components/ui/AppImage';
import { MediaViewerSlide } from '@/components/media-viewer/MediaViewerSlide';
import { VerificationBadge } from '@/components/ui/VerificationBadge';
import { pauseAllFeedPlayback } from '@/lib/feedVideoPlayback';
export { containSizeFromRatio } from '@/lib/mediaContain';
import { useHeroMediaTransition, type MediaOriginRect } from '@/lib/mediaOrigin';
import { nextOverlayVisible } from '@/lib/mediaViewerGestures';
import { getRtlRow } from '@/lib/rtl';
import type { FeedMediaItem } from '@/lib/postMedia';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Modal,
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
  /** Session-cached aspect ratios keyed by media uri. */
  cachedRatios?: Record<string, number>;
  onClose: () => void;
};

const LIKE_RED = '#F91880';
const REPOST_GREEN = '#00BA7C';
const BOOKMARK_BLUE = '#1D9BF0';

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
  cachedRatios,
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
              <MediaViewerSlide
                key={`${item.kind}-${item.uri}-${idx}`}
                item={item}
                active={visible && idx === currentIndex}
                screenW={screenW}
                screenH={screenH}
                cachedRatio={cachedRatios?.[item.uri] ?? null}
                overlayVisible={overlayVisible}
                controlsBottomInset={overlay ? 168 : 0}
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
