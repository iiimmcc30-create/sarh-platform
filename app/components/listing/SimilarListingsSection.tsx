import { useEffect, useMemo, useState } from 'react';
import { InteractionManager, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AppText, SpringPressable } from '@/design-system/components';
import { Image, uriSource } from '@/components/ui/AppImage';
import {
  SkeletonImage,
  SkeletonPulse,
  SkeletonRegion,
  SkeletonText,
} from '@/components/ui/skeleton';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/contexts/AuthContext';
import { getRtlText } from '@/lib/rtl';
import { listingThumbUri } from '@/lib/listingMedia';
import { quickAccessBorderColor } from '@/lib/quickAccessSurface';
import {
  SIMILAR_LISTINGS_COLUMNS,
  chunkIntoRows,
  fetchSimilarListings,
} from '@/lib/similarListings';
import type { Listing } from '@/services/types';

export const SIMILAR_LISTINGS_TITLE = 'إعلانات مشابهة';

const SKELETON_ROWS = 2;

type Props = {
  listing: Listing;
};

/**
 * «إعلانات مشابهة» under a listing: 3 square tiles per row (photo + first line of
 * the title). Loads after the screen settles, shows a skeleton meanwhile and
 * disappears entirely when there is nothing similar (or the request fails).
 * Plain rows (no FlatList) because it lives inside the detail ScrollView.
 */
export function SimilarListingsSection({ listing }: Props) {
  const router = useRouter();
  const { accessToken } = useAuth();
  const { scheme } = useTheme();
  const styles = useThemedStyles(({ colors }) => createStyles(colors));
  const borderColor = quickAccessBorderColor(scheme === 'dark' ? 'dark' : 'light');
  const [items, setItems] = useState<Listing[] | null>(null);

  const { id, category, categoryId, subcategoryId, country, location, arabicLocation } = listing;

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    const task = InteractionManager.runAfterInteractions(() => {
      void fetchSimilarListings(
        { id, category, categoryId, subcategoryId, country, location, arabicLocation },
        accessToken,
      )
        .then((rows) => {
          if (!cancelled) setItems(rows);
        })
        .catch(() => {
          if (!cancelled) setItems([]);
        });
    });
    return () => {
      cancelled = true;
      task.cancel();
    };
  }, [id, category, categoryId, subcategoryId, country, location, arabicLocation, accessToken]);

  const rows = useMemo(
    () => chunkIntoRows(items ?? [], SIMILAR_LISTINGS_COLUMNS),
    [items],
  );

  if (items && items.length === 0) return null;

  return (
    <View style={styles.section} testID="similar-listings">
      <View style={{ width: '100%' }}>
        <AppText style={styles.sectionTitle}>{SIMILAR_LISTINGS_TITLE}</AppText>
      </View>

      {items === null ? (
        <SkeletonRegion style={styles.grid}>
          <SkeletonPulse style={styles.grid}>
            {Array.from({ length: SKELETON_ROWS }, (_, rowIndex) => (
              <View key={rowIndex} style={styles.row}>
                {Array.from({ length: SIMILAR_LISTINGS_COLUMNS }, (_, col) => (
                  <View key={col} style={styles.tile}>
                    <SkeletonImage aspectRatio={1} radius={radius.sm} />
                    <SkeletonText
                      fontSize={typography.caption.fontSize}
                      lineHeight={typography.caption.lineHeight}
                      widths={['80%']}
                      style={styles.titleGap}
                    />
                  </View>
                ))}
              </View>
            ))}
          </SkeletonPulse>
        </SkeletonRegion>
      ) : (
        <View style={styles.grid}>
          {rows.map((row, rowIndex) => (
            <View key={rowIndex} style={styles.row}>
              {row.map((item, col) =>
                item ? (
                  <SpringPressable
                    key={item.id}
                    style={styles.tile}
                    onPress={() => router.push(`/listing/${item.id}` as never)}
                    accessibilityRole="button"
                    accessibilityLabel={item.arabicTitle || item.title}
                  >
                    <View style={[styles.thumb, { borderColor }]}>
                      <Image
                        source={uriSource(listingThumbUri(item))}
                        style={styles.thumbImage}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                        recyclingKey={item.id}
                      />
                    </View>
                    <AppText
                      style={[styles.tileTitle, styles.titleGap]}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {item.arabicTitle || item.title}
                    </AppText>
                  </SpringPressable>
                ) : (
                  <View key={`empty-${col}`} style={styles.tile} />
                ),
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    section: {
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
      paddingBottom: spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.borderHairline,
      backgroundColor: colors.screenRoot,
    },
    sectionTitle: {
      ...typography.feedTitle,
      color: colors.textPrimary,
      ...getRtlText(),
    },
    grid: {
      width: '100%',
      gap: spacing.md,
    },
    row: {
      flexDirection: 'row',
      gap: spacing.sm,
      width: '100%',
    },
    tile: {
      flex: 1,
      minWidth: 0,
    },
    thumb: {
      width: '100%',
      aspectRatio: 1,
      borderRadius: radius.sm,
      borderWidth: StyleSheet.hairlineWidth,
      overflow: 'hidden',
      backgroundColor: colors.bgElevated,
    },
    thumbImage: {
      width: '100%',
      height: '100%',
    },
    titleGap: {
      marginTop: spacing.xs,
    },
    tileTitle: {
      ...typography.caption,
      color: colors.textPrimary,
      ...getRtlText(),
    },
  });
}

export default SimilarListingsSection;
