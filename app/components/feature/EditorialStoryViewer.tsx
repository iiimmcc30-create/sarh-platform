import { AppIcon } from '@/components/ui/FlaticonIcon';
import { Image, uriSource } from '@/components/ui/AppImage';
import { LinearGradient } from '@/components/ui/AppLinearGradient';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing, typography } from '@/constants/theme';
import { rtlForwardIcon } from '@/lib/rtl';
import type { EditorialStory } from '@/services/editorialStories';
import { AppText } from '@/components/ui/AppText';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const SNIPPET_LEN = 160;
const BRAND_GREEN = '#20B66F';

type Props = {
  stories: EditorialStory[];
  startIndex: number;
  onClose: () => void;
};

export function EditorialStoryViewer({ stories, startIndex, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(startIndex);
  const [expanded, setExpanded] = useState(false);
  const [paused, setPaused] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);
  const indexRef = useRef(index);
  const expandedRef = useRef(expanded);
  const pausedRef = useRef(paused);

  indexRef.current = index;
  expandedRef.current = expanded;
  pausedRef.current = paused;

  const story = stories[index];
  const durationMs = Math.max(5, story?.duration ?? 20) * 1000;

  const goNext = useCallback(() => {
    if (indexRef.current >= stories.length - 1) {
      onClose();
      return;
    }
    setExpanded(false);
    setIndex((i) => i + 1);
  }, [onClose, stories.length]);

  const goPrev = useCallback(() => {
    if (indexRef.current <= 0) {
      progress.setValue(0);
      return;
    }
    setExpanded(false);
    setIndex((i) => i - 1);
  }, [progress]);

  const stopAnim = useCallback(() => {
    animRef.current?.stop();
    animRef.current = null;
  }, []);

  const startAnim = useCallback(
    (from = 0) => {
      stopAnim();
      progress.setValue(from);
      if (expandedRef.current || pausedRef.current) return;
      const remaining = Math.max(0.05, 1 - from) * durationMs;
      animRef.current = Animated.timing(progress, {
        toValue: 1,
        duration: remaining,
        useNativeDriver: false,
      });
      animRef.current.start(({ finished }) => {
        if (finished && !expandedRef.current && !pausedRef.current) {
          goNext();
        }
      });
    },
    [durationMs, goNext, progress, stopAnim],
  );

  useEffect(() => {
    setExpanded(false);
    setPaused(false);
    startAnim(0);
    return () => stopAnim();
  }, [index, startAnim, stopAnim]);

  useEffect(() => {
    if (expanded || paused) {
      progress.stopAnimation((value) => {
        progress.setValue(value);
        stopAnim();
      });
      return;
    }
    progress.stopAnimation((value) => {
      startAnim(typeof value === 'number' ? value : 0);
    });
  }, [expanded, paused, progress, startAnim, stopAnim]);

  const snippet = useMemo(() => {
    if (!story) return '';
    const body = story.bodyAr.trim();
    if (body.length <= SNIPPET_LEN) return body;
    return `${body.slice(0, SNIPPET_LEN).trim()}...`;
  }, [story]);

  const canToggle = (story?.bodyAr.trim().length ?? 0) > SNIPPET_LEN;

  if (!story) return null;

  return (
    <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <Image
          source={uriSource(story.imageUrl)}
          style={StyleSheet.absoluteFillObject}
          contentFit="cover"
        />
        <LinearGradient
          colors={['rgba(0,0,0,0.45)', 'transparent', 'rgba(0,0,0,0.88)']}
          locations={[0, 0.35, 1]}
          style={StyleSheet.absoluteFillObject}
        />

        <View style={[styles.topChrome, { paddingTop: insets.top + 8 }]}>
          <View style={styles.progressRow}>
            {stories.map((s, i) => (
              <View key={s.id} style={styles.progressTrack}>
                <Animated.View
                  style={[
                    styles.progressFill,
                    i < index
                      ? { width: '100%' }
                      : i > index
                        ? { width: 0 }
                        : {
                            width: progress.interpolate({
                              inputRange: [0, 1],
                              outputRange: ['0%', '100%'],
                            }),
                          },
                  ]}
                />
              </View>
            ))}
          </View>
          <View style={styles.topActions}>
            <Pressable onPress={onClose} hitSlop={12} style={styles.iconBtn}>
              <AppIcon name="close" size={22} color="#fff" />
            </Pressable>
            <Pressable
              onPress={goNext}
              hitSlop={12}
              style={styles.iconBtn}
              accessibilityLabel="التالي"
            >
              <AppIcon name={rtlForwardIcon()} size={22} color="#fff" />
            </Pressable>
          </View>
        </View>

        {/* Tap zones for prev / next (paused while holding) */}
        <View style={styles.tapRow} pointerEvents="box-none">
          <Pressable
            style={styles.tapZone}
            onPress={goPrev}
            onLongPress={() => setPaused(true)}
            onPressOut={() => setPaused(false)}
          />
          <Pressable
            style={styles.tapZone}
            onPress={goNext}
            onLongPress={() => setPaused(true)}
            onPressOut={() => setPaused(false)}
          />
        </View>

        <View
          style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}
          pointerEvents="box-none"
        >
          <View style={{ width: '100%' }}>
            <AppText style={styles.title}>{story.titleAr}</AppText>
          </View>
          {expanded ? (
            <ScrollView
              style={styles.bodyScroll}
              contentContainerStyle={styles.bodyScrollContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={{ width: '100%' }}>
                <AppText style={styles.body}>{story.bodyAr}</AppText>
              </View>
            </ScrollView>
          ) : (
            <View style={{ width: '100%' }}>
              <AppText style={styles.body} numberOfLines={4}>
                {snippet}
              </AppText>
            </View>
          )}
          {canToggle || expanded ? (
            <Pressable
              onPress={() => setExpanded((v) => !v)}
              hitSlop={8}
              style={styles.moreBtn}
            >
              <Text style={styles.moreText}>
                {expanded ? 'عرض أقل' : 'عرض المزيد'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
    width: SCREEN_W,
    height: SCREEN_H,
  },
  topChrome: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    paddingHorizontal: spacing.md,
  },
  progressRow: {
    flexDirection: 'row',
    gap: 4,
  },
  progressTrack: {
    flex: 1,
    height: 2.5,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.35)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#fff',
    borderRadius: 2,
  },
  topActions: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tapRow: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    zIndex: 5,
  },
  tapZone: {
    flex: 1,
  },
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 15,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  title: {
    ...typography.h3,
    color: '#fff',
  },
  body: {
    ...typography.body,
    color: 'rgba(255,255,255,0.92)',
    lineHeight: 24,
  },
  bodyScroll: {
    maxHeight: SCREEN_H * 0.42,
  },
  bodyScrollContent: {
    paddingBottom: 4,
  },
  moreBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  moreText: {
    ...typography.bodyStrong,
    color: BRAND_GREEN,
    textDecorationLine: 'underline',
    writingDirection: 'rtl',
      },
});
