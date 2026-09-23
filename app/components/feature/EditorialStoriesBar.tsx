import { useCallback, useRef, useState } from 'react';
import {
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Image, uriSource } from '@/components/ui/AppImage';
import { LinearGradient } from '@/components/ui/AppLinearGradient';
import { EditorialStoryViewer } from '@/components/feature/EditorialStoryViewer';
import { cloudinaryFitUrl } from '@/lib/listingMedia';
import { colors, functional, motion, radius, space } from '@/design-system';
import { AppText, SarhCard } from '@/design-system/components';
import { Row } from '@/design-system/layout';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import type { EditorialStory } from '@/services/editorialStories';

const SCREEN_W = Dimensions.get('window').width;
const CARD_GAP = space[12];
const SIDE_PAD = space[16];
const VISIBLE_CARDS = 2.35;
const CARD_W = Math.round((SCREEN_W - SIDE_PAD - CARD_GAP * 2) / VISIBLE_CARDS);
const CARD_H = Math.round(CARD_W * 0.72);

type Props = {
  stories: EditorialStory[];
  loading?: boolean;
};

export function EditorialStoriesBar({ stories, loading }: Props) {
  const styles = useThemedStyles(() => createStyles());
  const [activeDot, setActiveDot] = useState(0);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      const step = CARD_W + CARD_GAP;
      const idx = Math.round(x / step);
      setActiveDot(Math.max(0, Math.min(stories.length - 1, idx)));
    },
    [stories.length],
  );

  if (!loading && stories.length === 0) {
    return null;
  }

  return (
    <>
      <View style={styles.wrap}>
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.scroller}
          contentContainerStyle={styles.row}
          onScroll={onScroll}
          scrollEventThrottle={16}
          decelerationRate="fast"
          snapToInterval={CARD_W + CARD_GAP}
          snapToAlignment="start"
        >
          {loading && stories.length === 0
            ? [0, 1, 2].map((i) => (
                <SarhCard
                  key={`sk-${i}`}
                  variant="plain"
                  padding="none"
                  style={[styles.card, styles.skeleton]}
                />
              ))
            : stories.map((story, index) => (
                <Pressable
                  key={story.id}
                  onPress={() => setViewerIndex(index)}
                  accessibilityRole="button"
                  accessibilityLabel={story.titleAr}
                  style={({ pressed }) => [pressed && styles.pressed]}
                >
                  <SarhCard variant="plain" padding="none" style={styles.card}>
                    <Image
                      source={uriSource(cloudinaryFitUrl(story.imageUrl, 'card'))}
                      style={StyleSheet.absoluteFillObject}
                      contentFit="cover"
                    />
                    <LinearGradient
                      colors={['transparent', functional.overlay]}
                      locations={[0.4, 1]}
                      style={styles.gradient}
                    />
                    <View style={styles.cardTitleShell}>
                      <AppText
                        variant="caption"
                        numberOfLines={2}
                        ellipsizeMode="tail"
                        style={styles.cardTitle}
                      >
                        {story.titleAr}
                      </AppText>
                    </View>
                  </SarhCard>
                </Pressable>
              ))}
        </ScrollView>

        {stories.length > 1 ? (
          <Row justify="center" align="center" gap="xs" style={styles.dots}>
            {stories.map((story, i) => (
              <View key={story.id} style={[styles.dot, i === activeDot && styles.dotActive]} />
            ))}
          </Row>
        ) : null}
      </View>

      {viewerIndex != null ? (
        <EditorialStoryViewer
          stories={stories}
          startIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      ) : null}
    </>
  );
}

function createStyles() {
  return StyleSheet.create({
  wrap: {
    paddingTop: space[8],
    paddingBottom: space[8],
  },
  scroller: {
    flexGrow: 0,
  },
  row: {
    paddingHorizontal: SIDE_PAD,
    gap: CARD_GAP,
    paddingBottom: space[8],
  },
  card: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: radius[16],
    overflow: 'hidden',
    backgroundColor: colors.surfaceElevated,
    justifyContent: 'flex-end',
  },
  skeleton: {
    backgroundColor: colors.surfaceAlt,
    opacity: motion.opacity.disabled,
  },
  gradient: {
    ...StyleSheet.absoluteFillObject,
  },
  cardTitleShell: {
    width: '100%',
    paddingHorizontal: space[12],
    paddingBottom: space[12],
    zIndex: 1,
  },
  cardTitle: {
    color: functional.onPrimary,
    width: '100%',
  },
  dots: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: space[4],
    marginTop: space[8],
  },
  dot: {
    width: space[4],
    height: space[4],
    borderRadius: radius[999],
    backgroundColor: colors.borderStrong,
  },
  dotActive: {
    width: space[16],
    height: space[4],
    borderRadius: radius[999],
    backgroundColor: colors.primary,
  },
  pressed: {
    opacity: motion.opacity.pressed,
  },
});
}
