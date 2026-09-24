// SAFAT — Post media gallery: images + videos in one swipeable row.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Image as RNImage,
  PixelRatio,
  Pressable,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { ScrollView } from 'react-native';
import { Image, uriSource } from '@/components/ui/AppImage';
import { FeedVideoTile } from '@/components/feature/FeedVideoTile';
import {
  MediaViewerModal,
  type MediaViewerOverlay,
} from '@/components/ui/MediaViewerModal';
import { radius, typography, type ThemeColors } from '@/constants/theme';
import { detailMediaMaxHeight, resolveMediaLayoutRatio } from '@/lib/mediaAspectRatio';
import { detailMediaHeight, normalizeAspectRatio } from '@/lib/mediaContain';
import { measureMediaOrigin, type MediaOriginRect } from '@/lib/mediaOrigin';
import { collectPostMedia, type FeedMediaItem, type PostMediaRecord } from '@/lib/postMedia';
import { postDetailImageUrl, postFeedImageUrl } from '@/lib/listingMedia';
import { recordPostView } from '@/lib/postEngagement';

const ASPECT_RATIO = 16 / 11;

function postFeedDeliveryUri(uri: string): string {
  const screenW = Dimensions.get('window').width;
  const dpr = typeof PixelRatio.get === 'function' ? PixelRatio.get() : 2;
  return postFeedImageUrl(uri, screenW, dpr) ?? uri;
}

function postDetailDeliveryUri(uri: string): string {
  const screenW = Dimensions.get('window').width;
  const dpr = typeof PixelRatio.get === 'function' ? PixelRatio.get() : 2;
  return postDetailImageUrl(uri, screenW, dpr) ?? uri;
}

interface PostMediaGalleryProps {
  images: string[];
  video?: string | null;
  media?: PostMediaRecord[] | null;
  colors: ThemeColors;
  scheme: 'light' | 'dark';
  postId?: string;
  variant?: 'feed' | 'detail';
  overlay?: MediaViewerOverlay | null;
  onViewRecorded?: (views: number) => void;
}

function MediaSkeleton({ colors }: { colors: ThemeColors }) {
  const pulse = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.7, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.35, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, { backgroundColor: colors.bgElevated, opacity: pulse }]}
    />
  );
}

function GalleryImage({
  uri,
  colors,
  onPress,
  contentFit,
}: {
  uri: string;
  colors: ThemeColors;
  onPress?: () => void;
  contentFit: 'cover' | 'contain';
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;
  const delivery = contentFit === 'contain' ? postDetailDeliveryUri(uri) : postFeedDeliveryUri(uri);

  const handleLoad = useCallback(() => {
    setLoaded(true);
    Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [opacity]);

  return (
    <Pressable style={StyleSheet.absoluteFill} onPress={onPress}>
      {!loaded && !failed ? <MediaSkeleton colors={colors} /> : null}
      {!failed ? (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity }]}>
          <Image
            source={uriSource(delivery)}
            style={StyleSheet.absoluteFill}
            contentFit={contentFit}
            onLoad={handleLoad}
            onError={() => setFailed(true)}
          />
        </Animated.View>
      ) : null}
    </Pressable>
  );
}

function MediaPage({
  item,
  colors,
  active,
  contentFit,
  onOpen,
  onNaturalSize,
}: {
  item: FeedMediaItem;
  colors: ThemeColors;
  active: boolean;
  contentFit: 'cover' | 'contain';
  onOpen: () => void;
  onNaturalSize?: (width: number, height: number) => void;
}) {
  if (item.kind === 'video') {
    return (
      <FeedVideoTile
        uri={item.uri}
        posterUri={item.posterUri}
        colors={colors}
        active={active}
        contentFit={contentFit}
        onOpen={onOpen}
        onNaturalSize={onNaturalSize}
      />
    );
  }
  return <GalleryImage uri={item.uri} colors={colors} onPress={onOpen} contentFit={contentFit} />;
}

function useItemAspect(item: FeedMediaItem | undefined) {
  const [naturalRatio, setNaturalRatio] = useState<number | null>(null);
  const [posterRatio, setPosterRatio] = useState<number | null>(null);

  useEffect(() => {
    setNaturalRatio(null);
    setPosterRatio(null);
    if (!item) return;

    if (item.kind === 'image') {
      RNImage.getSize(
        item.uri,
        (width, height) => {
          const next = normalizeAspectRatio(width, height);
          if (next) setNaturalRatio(next);
        },
        () => undefined,
      );
      return;
    }

    const poster = item.posterUri ?? item.uri;
    if (!poster) return;
    RNImage.getSize(
      poster,
      (width, height) => {
        const next = normalizeAspectRatio(width, height);
        if (next) setPosterRatio(next);
      },
      () => undefined,
    );
  }, [item?.uri, item?.kind, item?.posterUri]);

  const applySize = useCallback((width: number, height: number) => {
    const next = normalizeAspectRatio(width, height);
    if (next) setNaturalRatio(next);
  }, []);

  const resolved = resolveMediaLayoutRatio({
    naturalRatio,
    cachedRatio: null,
    posterRatio: item?.kind === 'video' ? posterRatio : naturalRatio,
  });

  return { ratio: resolved.layoutRatio, applySize };
}

export function PostMediaGallery({
  images,
  video,
  media,
  colors,
  scheme,
  postId,
  variant = 'feed',
  overlay,
  onViewRecorded,
}: PostMediaGalleryProps) {
  const items = useMemo(() => collectPostMedia(images, video, media), [images, video, media]);
  const [width, setWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [viewerOrigin, setViewerOrigin] = useState<MediaOriginRect | null>(null);
  const frameRef = useRef<View>(null);
  const isDetail = variant === 'detail';
  const activeItem = items[activeIndex] ?? items[0];
  const { ratio, applySize } = useItemAspect(isDetail ? activeItem : undefined);

  const markViewed = useCallback(() => {
    if (!postId) return;
    void recordPostView(postId).then((count) => {
      if (typeof count === 'number') onViewRecorded?.(count);
    });
  }, [postId, onViewRecorded]);

  const openViewer = useCallback(
    (idx: number) => {
      void measureMediaOrigin(frameRef.current).then((origin) => {
        setViewerOrigin(origin);
        setViewerIndex(idx);
        setViewerVisible(true);
        markViewed();
      });
    },
    [markViewed],
  );

  const onLayout = useCallback(
    (e: { nativeEvent: { layout: { width: number } } }) => setWidth(e.nativeEvent.layout.width),
    [],
  );

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!width) return;
      const idx = Math.round(e.nativeEvent.contentOffset.x / width);
      setActiveIndex(idx);
    },
    [width],
  );

  if (items.length === 0) return null;

  const pageWidth = width || Dimensions.get('window').width;
  const windowH = Dimensions.get('window').height;
  const detailHeight = isDetail
    ? detailMediaHeight(ratio, pageWidth, detailMediaMaxHeight(windowH, pageWidth))
    : undefined;

  const cachedRatios = useMemo(() => {
    if (!isDetail || !ratio || !activeItem) return undefined;
    return { [activeItem.uri]: ratio };
  }, [activeItem, isDetail, ratio]);

  const containerStyle = isDetail
    ? [styles.detailContainer, { height: detailHeight }]
    : [
        styles.container,
        {
          borderColor: scheme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
        },
      ];

  const contentFit = isDetail ? 'contain' : 'cover';

  return (
    <>
      <View ref={frameRef} collapsable={false} style={containerStyle} onLayout={onLayout}>
        {items.length === 1 ? (
          <MediaPage
            item={items[0]}
            colors={colors}
            active
            contentFit={contentFit}
            onOpen={() => openViewer(0)}
            onNaturalSize={isDetail ? applySize : undefined}
          />
        ) : (
          <>
            <ScrollView
              style={StyleSheet.absoluteFill}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onScroll={onScroll}
              scrollEventThrottle={16}
              decelerationRate="fast"
            >
              {items.map((item, idx) => (
                <View key={`${item.kind}-${item.uri}-${idx}`} style={{ width: pageWidth, height: '100%' }}>
                  <MediaPage
                    item={item}
                    colors={colors}
                    active={idx === activeIndex}
                    contentFit={contentFit}
                    onOpen={() => openViewer(idx)}
                    onNaturalSize={isDetail && idx === activeIndex ? applySize : undefined}
                  />
                </View>
              ))}
            </ScrollView>
            <View style={styles.countBadge} pointerEvents="none">
              <Text style={styles.countText}>
                {activeIndex + 1}/{items.length}
              </Text>
            </View>
            <View style={styles.dotsRow} pointerEvents="none">
              {items.map((_, idx) => (
                <View
                  key={idx}
                  style={[
                    styles.dot,
                    idx === activeIndex && {
                      backgroundColor: '#fff',
                      width: 7,
                    },
                  ]}
                />
              ))}
            </View>
          </>
        )}
      </View>
      <MediaViewerModal
        visible={viewerVisible}
        items={items}
        initialIndex={viewerIndex}
        origin={viewerOrigin}
        overlay={overlay}
        cachedRatios={cachedRatios}
        onClose={() => setViewerVisible(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    aspectRatio: ASPECT_RATIO,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    maxHeight: 340,
  },
  detailContainer: {
    width: '100%',
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  countBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  countText: {
    ...typography.badge,
    color: '#fff',
  },
  dotsRow: {
    position: 'absolute',
    bottom: 10,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 5,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
});

export default PostMediaGallery;
