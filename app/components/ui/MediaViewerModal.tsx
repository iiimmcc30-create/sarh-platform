import { AppIcon } from '@/components/ui/FlaticonIcon';
import { AppText } from '@/components/ui/AppText';
import { StoryVideoPlayer } from '@/components/feature/StoryVideoPlayer';
import { pauseAllFeedPlayback } from '@/lib/feedVideoPlayback';
import { useHeroMediaTransition, type MediaOriginRect } from '@/lib/mediaOrigin';
import type { FeedMediaItem } from '@/lib/postMedia';
import { resolveMediaUrl } from '@/services/media';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Modal,
  Pressable,
  StatusBar,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ImageViewerModal } from '@/components/ui/ImageViewerModal';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

type MediaViewerModalProps = {
  visible: boolean;
  items: FeedMediaItem[];
  initialIndex?: number;
  origin?: MediaOriginRect | null;
  onClose: () => void;
};

function ViewerVideo({
  item,
  active,
}: {
  item: FeedMediaItem;
  active: boolean;
}) {
  const [ready, setReady] = useState(false);
  const uri = resolveMediaUrl(item.uri) ?? item.uri;
  const poster = item.posterUri ? resolveMediaUrl(item.posterUri) ?? item.posterUri : undefined;

  if (!active) {
    return (
      <View style={styles.slide}>
        {poster ? (
          <Animated.Image source={{ uri: poster }} style={styles.media} resizeMode="contain" />
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.slide}>
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
        nativeControls
        onReady={() => setReady(true)}
      />
    </View>
  );
}

export function MediaViewerModal({
  visible,
  items,
  initialIndex = 0,
  origin,
  onClose,
}: MediaViewerModalProps) {
  const insets = useSafeAreaInsets();
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const scrollX = useRef(new Animated.Value(initialIndex * SCREEN_W)).current;

  const finishClose = useCallback(() => {
    pauseAllFeedPlayback();
    onClose();
  }, [onClose]);

  const { mounted, progress, heroStyle, requestClose } = useHeroMediaTransition(
    visible,
    origin,
    finishClose,
  );

  useEffect(() => {
    if (!visible) return;
    pauseAllFeedPlayback();
    setCurrentIndex(initialIndex);
    scrollX.setValue(initialIndex * SCREEN_W);
  }, [visible, initialIndex, scrollX]);

  const onScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { x: scrollX } } }],
    {
      useNativeDriver: false,
      listener: (event: { nativeEvent: { contentOffset: { x: number } } }) => {
        const idx = Math.round(event.nativeEvent.contentOffset.x / SCREEN_W);
        if (idx !== currentIndex && idx >= 0 && idx < items.length) {
          setCurrentIndex(idx);
        }
      },
    },
  );

  if (!items.length) return null;

  const imagesOnly = items.every((item) => item.kind === 'image');
  if (imagesOnly) {
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
        <Animated.View style={[styles.heroLayer, heroStyle]}>
          <Animated.ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            scrollEnabled={items.length > 1}
            onScroll={onScroll}
            scrollEventThrottle={16}
            contentOffset={{ x: initialIndex * SCREEN_W, y: 0 }}
            style={styles.scrollView}
          >
            {items.map((item, idx) =>
              item.kind === 'video' ? (
                <ViewerVideo key={`${item.uri}-${idx}`} item={item} active={visible && idx === currentIndex} />
              ) : (
                <View key={`${item.uri}-${idx}`} style={styles.slide}>
                  <Animated.Image
                    source={{ uri: resolveMediaUrl(item.uri) ?? item.uri }}
                    style={styles.media}
                    resizeMode="contain"
                  />
                </View>
              ),
            )}
          </Animated.ScrollView>
        </Animated.View>

        <Animated.View style={[styles.chrome, { opacity: progress }]} pointerEvents="box-none">
          <Pressable
            onPress={requestClose}
            style={[styles.closeBtn, { top: insets.top + 10 }]}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="إغلاق"
          >
            <AppIcon name="close" size={20} color="#fff" />
          </Pressable>

          {items.length > 1 ? (
            <View style={[styles.counter, { top: insets.top + 16 }]} pointerEvents="none">
              <AppText style={styles.counterText}>
                {currentIndex + 1} / {items.length}
              </AppText>
            </View>
          ) : null}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
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
  scrollView: {
    width: SCREEN_W,
    height: SCREEN_H,
  },
  slide: {
    width: SCREEN_W,
    height: SCREEN_H,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  media: {
    width: SCREEN_W,
    height: SCREEN_H,
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
});
