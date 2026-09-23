import { Image, uriSource } from '@/components/ui/AppImage';
import { LinearGradient } from '@/components/ui/AppLinearGradient';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { EditorialStoryViewer } from '@/components/feature/EditorialStoryViewer';
import { AppText } from '@/design-system/components';
import { Screen, ScreenBody } from '@/design-system/layout';
import { functional } from '@/design-system';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { fetchEditorialStories, type EditorialStory } from '@/services/editorialStories';
import { cloudinaryFitUrl } from '@/lib/listingMedia';
import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { type ThemeColors } from '@/constants/theme';

const NEWS_REFRESH_TTL_MS = 60_000;

export default function NewsScreen() {
  const styles = useThemedStyles(({ colors: c }) => createStyles(c));
  const [stories, setStories] = useState<EditorialStory[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const lastAt = useRef(0);
  const hasData = useRef(false);

  const load = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && now - lastAt.current < NEWS_REFRESH_TTL_MS && hasData.current) {
      return;
    }
    if (!hasData.current) setLoading(true);
    try {
      const data = await fetchEditorialStories();
      setStories(data);
      hasData.current = true;
      lastAt.current = Date.now();
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const showInitialSpinner = loading && stories.length === 0 && !hasData.current;

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader variant="screen" title="الأخبار" showBack />
      {showInitialSpinner ? (
        <ScreenBody scroll={false}>
          <ActivityIndicator style={styles.loader} />
        </ScreenBody>
      ) : (
        <ScreenBody padTop="lg" padBottom="xxxl" gap="md">
          {stories.length === 0 ? (
            <AppText variant="bodySmall" color="textMuted" align="center">
              لا توجد أخبار حالياً
            </AppText>
          ) : (
            stories.map((story, index) => (
              <Pressable
                key={story.id}
                style={styles.card}
                onPress={() => setViewerIndex(index)}
              >
                <Image source={uriSource(cloudinaryFitUrl(story.imageUrl, 'wide'))} style={styles.image} contentFit="cover" />
                <LinearGradient
                  colors={['transparent', 'rgba(0,0,0,0.72)']}
                  style={styles.gradient}
                />
                <AppText
                  variant="heading3"
                  numberOfLines={2}
                  style={[styles.title, { color: functional.onPrimary }]}
                >
                  {story.titleAr}
                </AppText>
              </Pressable>
            ))
          )}
        </ScreenBody>
      )}
      {viewerIndex != null ? (
        <EditorialStoryViewer
          stories={stories}
          startIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      ) : null}
    </Screen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    loader: { marginTop: 48 },
    card: {
      height: 168,
      borderRadius: 18,
      overflow: 'hidden',
      backgroundColor: colors.bgElevated,
      justifyContent: 'flex-end',
    },
    image: { ...StyleSheet.absoluteFillObject },
    gradient: { ...StyleSheet.absoluteFillObject },
    title: {
      padding: 12,
      zIndex: 1,
    },
  });
}
