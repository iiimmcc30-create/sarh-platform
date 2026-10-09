import { Pressable, StyleSheet, View } from 'react-native';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { AppText } from '@/design-system/components';
import { useTheme } from '@/hooks/useTheme';
import { profileRatingInline, profileStarFills } from '@/lib/aboutAccount';
import { getRtlRow } from '@/lib/rtl';

/** Each star ≈ the @handle text height (15pt label); tight 1.5pt spacing so five stars stay compact. */
export const PROFILE_STAR_SIZE = 12;
export const PROFILE_STAR_GAP = 1.5;
/** ~66×12 cluster → ≥ 44pt touch target. */
const STARS_HIT_SLOP = { top: 16, bottom: 16, left: 8, right: 8 } as const;

type Props = {
  rating?: number | null;
  reviewCount?: number | null;
  onPress?: () => void;
};

/**
 * Profile rating on the @handle line: five small vector stars (Lucide `star`),
 * tierGold filled for the average with half-star support, subtle grey for the
 * rest; no reviews = five grey outline stars. A quiet average follows.
 */
export function ProfileRatingStars({ rating, reviewCount, onPress }: Props) {
  const { colors } = useTheme();
  const fills = profileStarFills(rating, reviewCount);
  const summary = profileRatingInline(rating, reviewCount);
  const gold = colors.tierGold;

  return (
    <Pressable
      testID="profile-rating"
      onPress={onPress}
      disabled={!onPress}
      hitSlop={STARS_HIT_SLOP}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={
        summary ? `التقييم ${summary.average} من 5، ${reviewCount ?? 0} تقييم` : 'لا توجد تقييمات بعد'
      }
      style={[getRtlRow(), styles.root]}
    >
      <View style={[getRtlRow(), styles.stars]}>
        {(fills ?? [0, 0, 0, 0, 0]).map((fill, i) => (
          <View key={i} style={styles.star} testID={`profile-star-${fill === 1 ? 'full' : fill === 0.5 ? 'half' : 'empty'}`}>
            {fills ? (
              // Rated: subtle grey filled base, gold on top (clipped to half from the inline start).
              <AppIcon name="star" variant="sr" size={PROFILE_STAR_SIZE} color={colors.borderStrong} />
            ) : (
              <AppIcon name="star" size={PROFILE_STAR_SIZE} color={colors.textMuted} />
            )}
            {fill > 0 ? (
              <View style={[styles.fillClip, { width: fill === 1 ? PROFILE_STAR_SIZE : PROFILE_STAR_SIZE / 2 }]}>
                <AppIcon name="star" variant="sr" size={PROFILE_STAR_SIZE} color={gold} />
              </View>
            ) : null}
          </View>
        ))}
      </View>
      {summary ? (
        <AppText variant="caption" color="textSecondary" style={styles.average} testID="profile-rating-average">
          {summary.average}
        </AppText>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    flexShrink: 0,
    gap: 4,
  },
  stars: {
    alignItems: 'center',
    gap: PROFILE_STAR_GAP,
  },
  star: {
    width: PROFILE_STAR_SIZE,
    height: PROFILE_STAR_SIZE,
  },
  /** Anchored at the inline start (right in RTL), so a half star fills from the reading start. */
  fillClip: {
    position: 'absolute',
    top: 0,
    start: 0,
    height: PROFILE_STAR_SIZE,
    overflow: 'hidden',
  },
  average: {
    writingDirection: 'ltr',
    fontVariant: ['tabular-nums'],
  },
});
