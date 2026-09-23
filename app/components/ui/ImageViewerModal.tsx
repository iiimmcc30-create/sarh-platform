/**
 * ImageViewerModal — Full-screen zoomable image viewer
 * Supports pinch-to-zoom, double-tap to zoom, pan, and swipe gallery.
 * Uses only React Native core APIs (no extra packages required).
 */
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { AppText } from '@/design-system/components';
import { useHeroMediaTransition, type MediaOriginRect } from '@/lib/mediaOrigin';
import { resolveMediaUrl } from '@/services/media';
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  Dimensions,
  Modal,
  PanResponder,
  Pressable,
  StatusBar,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const MIN_SCALE = 1;
const MAX_SCALE = 5;

// ─── Single zoomable image ──────────────────────────────────────────────────

function ZoomableImage({ uri }: { uri: string }) {
  const scale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  const lastScale = useRef(1);
  const lastTranslateX = useRef(0);
  const lastTranslateY = useRef(0);
  const initialDistance = useRef(0);
  const initialMidpoint = useRef({ x: 0, y: 0 });
  const lastTap = useRef(0);

  const resetZoom = useCallback((animated = true) => {
    const cfg = { useNativeDriver: true };
    if (animated) {
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, ...cfg }),
        Animated.spring(translateX, { toValue: 0, ...cfg }),
        Animated.spring(translateY, { toValue: 0, ...cfg }),
      ]).start();
    } else {
      scale.setValue(1);
      translateX.setValue(0);
      translateY.setValue(0);
    }
    lastScale.current = 1;
    lastTranslateX.current = 0;
    lastTranslateY.current = 0;
  }, [scale, translateX, translateY]);

  const getDistance = (touches: any[]) => {
    const [a, b] = touches;
    const dx = a.pageX - b.pageX;
    const dy = a.pageY - b.pageY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const getMidpoint = (touches: any[]) => {
    const [a, b] = touches;
    return {
      x: (a.pageX + b.pageX) / 2,
      y: (a.pageY + b.pageY) / 2,
    };
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dx) > 2 || Math.abs(gs.dy) > 2 || gs.numberActiveTouches === 2,

      onPanResponderGrant: (event) => {
        const touches = event.nativeEvent.touches;
        if (touches.length === 2) {
          initialDistance.current = getDistance(touches);
          initialMidpoint.current = getMidpoint(touches);
        }
        scale.stopAnimation((v) => { lastScale.current = v; });
        translateX.stopAnimation((v) => { lastTranslateX.current = v; });
        translateY.stopAnimation((v) => { lastTranslateY.current = v; });
      },

      onPanResponderMove: (event, gestureState) => {
        const touches = event.nativeEvent.touches;

        if (touches.length === 2) {
          // Pinch
          const dist = getDistance(touches);
          if (initialDistance.current === 0) {
            initialDistance.current = dist;
            return;
          }
          const ratio = dist / initialDistance.current;
          const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, lastScale.current * ratio));
          scale.setValue(newScale);

          // Pan relative to pinch midpoint
          const mid = getMidpoint(touches);
          const dx = mid.x - initialMidpoint.current.x;
          const dy = mid.y - initialMidpoint.current.y;
          translateX.setValue(lastTranslateX.current + dx);
          translateY.setValue(lastTranslateY.current + dy);
        } else if (touches.length === 1 && lastScale.current > 1) {
          // Pan when zoomed
          translateX.setValue(lastTranslateX.current + gestureState.dx);
          translateY.setValue(lastTranslateY.current + gestureState.dy);
        }
      },

      onPanResponderRelease: (event, gestureState) => {
        const touches = event.nativeEvent.touches;
        initialDistance.current = 0;

        scale.stopAnimation((currentScale) => {
          lastScale.current = currentScale;

          if (currentScale < 1.05) {
            resetZoom();
            return;
          }

          // Clamp pan within bounds
          translateX.stopAnimation((tx) => {
            translateY.stopAnimation((ty) => {
              const maxPanX = ((currentScale - 1) * SCREEN_W) / 2;
              const maxPanY = ((currentScale - 1) * SCREEN_H) / 2;
              const clampedX = Math.max(-maxPanX, Math.min(maxPanX, tx));
              const clampedY = Math.max(-maxPanY, Math.min(maxPanY, ty));

              lastTranslateX.current = clampedX;
              lastTranslateY.current = clampedY;

              Animated.parallel([
                Animated.spring(translateX, { toValue: clampedX, useNativeDriver: true }),
                Animated.spring(translateY, { toValue: clampedY, useNativeDriver: true }),
              ]).start();
            });
          });
        });

        // Double-tap detection (single-finger only)
        if (gestureState.numberActiveTouches === 0 && Math.abs(gestureState.dx) < 5 && Math.abs(gestureState.dy) < 5) {
          const now = Date.now();
          if (now - lastTap.current < 280) {
            // Double tap
            lastTap.current = 0;
            if (lastScale.current > 1.5) {
              resetZoom();
            } else {
              const targetScale = 2.5;
              Animated.parallel([
                Animated.spring(scale, { toValue: targetScale, useNativeDriver: true }),
                Animated.spring(translateX, { toValue: 0, useNativeDriver: true }),
                Animated.spring(translateY, { toValue: 0, useNativeDriver: true }),
              ]).start();
              lastScale.current = targetScale;
              lastTranslateX.current = 0;
              lastTranslateY.current = 0;
            }
          } else {
            lastTap.current = now;
          }
        }
      },
    }),
  ).current;

  return (
    <View style={styles.imageSlide} {...panResponder.panHandlers}>
      <Animated.Image
        source={{ uri: resolveMediaUrl(uri) ?? uri }}
        style={[
          styles.fullImage,
          {
            transform: [
              { scale },
              { translateX },
              { translateY },
            ],
          },
        ]}
        resizeMode="contain"
      />
    </View>
  );
}

// ─── Public component ────────────────────────────────────────────────────────

interface ImageViewerModalProps {
  visible: boolean;
  images: string[];
  initialIndex?: number;
  origin?: MediaOriginRect | null;
  onClose: () => void;
}

export function ImageViewerModal({
  visible,
  images,
  initialIndex = 0,
  origin,
  onClose,
}: ImageViewerModalProps) {
  const insets = useSafeAreaInsets();
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const scrollX = useRef(new Animated.Value(initialIndex * SCREEN_W)).current;
  const { mounted, progress, heroStyle, requestClose } = useHeroMediaTransition(
    visible,
    origin,
    onClose,
  );

  useEffect(() => {
    if (visible) {
      setCurrentIndex(initialIndex);
      scrollX.setValue(initialIndex * SCREEN_W);
    }
  }, [visible, initialIndex]);

  const onScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { x: scrollX } } }],
    {
      useNativeDriver: false,
      listener: (event: any) => {
        const idx = Math.round(event.nativeEvent.contentOffset.x / SCREEN_W);
        if (idx !== currentIndex && idx >= 0 && idx < images.length) {
          setCurrentIndex(idx);
        }
      },
    },
  );

  if (!images.length || !mounted) return null;

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
            scrollEnabled={images.length > 1}
            onScroll={onScroll}
            scrollEventThrottle={16}
            contentOffset={{ x: initialIndex * SCREEN_W, y: 0 }}
            style={styles.scrollView}
          >
            {images.map((uri, idx) => (
              <ZoomableImage key={`${uri}-${idx}`} uri={uri} />
            ))}
          </Animated.ScrollView>
        </Animated.View>

        <Animated.View style={[styles.chrome, { opacity: progress }]} pointerEvents="box-none">
          <Pressable
            onPress={requestClose}
            style={[styles.closeBtn, { top: insets.top + 12 }]}
            hitSlop={12}
          >
            <AppIcon name="close" size={22} color="#fff" />
          </Pressable>

          {images.length > 1 && (
            <View style={[styles.counter, { top: insets.top + 16 }]}>
              <AppText variant="micro" style={styles.counterText}>
                {currentIndex + 1} / {images.length}
              </AppText>
            </View>
          )}

          {images.length > 1 && (
            <View style={[styles.dotsRow, { bottom: insets.bottom + 16 }]}>
              {images.map((_, idx) => (
                <View
                  key={idx}
                  style={[styles.dot, idx === currentIndex && styles.dotActive]}
                />
              ))}
            </View>
          )}

          <AppText
            variant="caption"
            align="center"
            style={[styles.hint, { bottom: insets.bottom + (images.length > 1 ? 40 : 16) }]}
          >
            اضغط مرتين للتكبير · اسحب للإغلاق
          </AppText>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── Helper hook ─────────────────────────────────────────────────────────────

export function useImageViewer() {
  const [state, setState] = useState<{ images: string[]; index: number } | null>(null);

  const open = useCallback((images: string[], index = 0) => {
    setState({ images, index });
  }, []);

  const close = useCallback(() => setState(null), []);

  return { open, close, state };
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
  imageSlide: {
    width: SCREEN_W,
    height: SCREEN_H,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  fullImage: {
    width: SCREEN_W,
    height: SCREEN_H,
  },
  closeBtn: {
    position: 'absolute',
    end: 16,
    zIndex: 100,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
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
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  dotsRow: {
    position: 'absolute',
    start: 0,
    end: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    zIndex: 100,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  dotActive: {
    backgroundColor: '#fff',
    width: 18,
    borderRadius: 3,
  },
  hint: {
    position: 'absolute',
    start: 0,
    end: 0,
    color: 'rgba(255,255,255,0.4)',
    zIndex: 100,
  },
});
