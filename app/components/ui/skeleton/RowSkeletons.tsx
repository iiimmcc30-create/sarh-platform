/**
 * Row/section skeletons for Search / Explore and other API lists. Each one
 * mirrors a real component's metrics (see the source named on each export).
 */
import { StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import { USER_IDENTITY } from '@/components/ui/UserIdentityRow';
import { buttonMetrics, typography as ds } from '@/design-system';
import { radius, spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { getRtlRow } from '@/lib/rtl';
import { TRENDING_ROW } from '@/lib/searchTrending';
import { SkeletonBox, SkeletonImage, SkeletonPulse, SkeletonText } from './SkeletonPrimitives';

/** TrendingTopicRow meta line height (lineHeight: 18). */
const TRENDING_META_LINE = 18;

/**
 * = TrendingTopicRow: meta line, bold title, count line; plain row (no card).
 * Same horizontal / vertical padding and 2px line gap.
 */
export function TrendingTopicRowSkeleton({ titleWidth = '62%' }: { titleWidth?: DimensionValue }) {
  return (
    <SkeletonPulse style={trendingStyles.row}>
      <SkeletonText fontSize={TRENDING_ROW.metaFontSize} lineHeight={TRENDING_META_LINE} widths={['34%']} />
      <SkeletonText fontSize={TRENDING_ROW.titleFontSize} lineHeight={ds.body.lineHeight} widths={[titleWidth]} />
      <SkeletonText fontSize={TRENDING_ROW.metaFontSize} lineHeight={TRENDING_META_LINE} widths={['22%']} />
    </SkeletonPulse>
  );
}

const TRENDING_TITLE_WIDTHS: DimensionValue[] = ['62%', '48%', '70%', '54%', '40%', '66%'];

export function TrendingListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <TrendingTopicRowSkeleton key={i} titleWidth={TRENDING_TITLE_WIDTHS[i % TRENDING_TITLE_WIDTHS.length]} />
      ))}
    </>
  );
}

/** A section heading (AppText heading3 / heading2) at its real line height. */
export function SectionTitleSkeleton({
  variant = 'heading3',
  width = '38%',
  style,
}: {
  variant?: 'heading2' | 'heading3';
  width?: DimensionValue;
  style?: StyleProp<ViewStyle>;
}) {
  const t = ds[variant];
  return (
    <SkeletonPulse style={style}>
      <SkeletonText fontSize={t.fontSize} lineHeight={t.lineHeight} widths={[width]} />
    </SkeletonPulse>
  );
}

/**
 * = UserIdentityRow with the list avatar (44 / radius 16): avatar at the inline
 * start, name (cardHeading) and @handle (caption) with a 3px gap.
 */
export function UserIdentityRowSkeleton({
  avatarSize = USER_IDENTITY.listAvatarSize,
  avatarRadius = USER_IDENTITY.listAvatarRadius,
  trailingPill,
  trailingPillHeight = buttonMetrics.size.sm.minHeight,
  style,
}: {
  avatarSize?: number;
  avatarRadius?: number;
  /** Trailing small pill button (e.g. SarhButton size="sm" follow): width × 32. */
  trailingPill?: number;
  trailingPillHeight?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <SkeletonPulse style={[identityStyles.row, getRtlRow(), style]}>
      <SkeletonImage width={avatarSize} height={avatarSize} radius={avatarRadius} />
      <View style={identityStyles.text}>
        <SkeletonText fontSize={16} lineHeight={24} widths={['46%']} />
        <SkeletonText fontSize={12} lineHeight={18} widths={['28%']} />
      </View>
      {trailingPill ? (
        <SkeletonBox width={trailingPill} height={trailingPillHeight} radius={radius.pill} />
      ) : null}
    </SkeletonPulse>
  );
}

/** Search `resultRow`: 56px rounded thumb + body text, 12px vertical padding. */
export const THUMB_ROW = { thumb: 56, radius: 12, paddingVertical: 12, gap: 12 } as const;

export function ThumbRowSkeleton({
  lines = 2,
  showThumb = true,
}: {
  lines?: number;
  showThumb?: boolean;
}) {
  return (
    <SkeletonPulse style={[identityStyles.thumbRow, getRtlRow()]}>
      {showThumb ? (
        <SkeletonImage width={THUMB_ROW.thumb} height={THUMB_ROW.thumb} radius={THUMB_ROW.radius} />
      ) : null}
      <View style={identityStyles.text}>
        <SkeletonText
          fontSize={ds.body.fontSize}
          lineHeight={ds.body.lineHeight}
          lines={lines}
          widths={lines > 1 ? ['94%', '60%'] : ['70%']}
        />
      </View>
    </SkeletonPulse>
  );
}

/** Editorial news card (Search news results / News screen): 168 high, radius 18. */
export const NEWS_CARD = { height: 168, radius: 18 } as const;

export function NewsCardSkeleton() {
  return (
    <SkeletonPulse>
      <SkeletonImage height={NEWS_CARD.height} radius={NEWS_CARD.radius} />
    </SkeletonPulse>
  );
}

/** = MinistryServiceCard: bordered card, title, 2-line description, category pill. */
export function ServiceCardSkeleton() {
  const styles = useThemedStyles(({ colors }) => createServiceStyles(colors));
  return (
    <View style={styles.card}>
      <SkeletonPulse style={styles.inner}>
        <SkeletonText fontSize={ds.heading3.fontSize} lineHeight={ds.heading3.lineHeight} widths={['55%']} />
        <SkeletonText
          fontSize={ds.bodySmall.fontSize}
          lineHeight={ds.bodySmall.lineHeight}
          lines={2}
          widths={['100%', '68%']}
        />
        <SkeletonBox width={92} height={28} radius={radius.pill} style={styles.badge} />
      </SkeletonPulse>
    </View>
  );
}

const trendingStyles = StyleSheet.create({
  row: {
    paddingHorizontal: TRENDING_ROW.paddingHorizontal,
    paddingVertical: TRENDING_ROW.paddingVertical,
    gap: TRENDING_ROW.lineGap,
  },
});

const identityStyles = StyleSheet.create({
  row: {
    gap: spacing.md,
    alignItems: 'center',
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  thumbRow: {
    paddingVertical: THUMB_ROW.paddingVertical,
    gap: THUMB_ROW.gap,
    alignItems: 'center',
  },
});

function createServiceStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.bgSurface,
      borderRadius: radius.lg,
      padding: spacing.lg,
      borderWidth: 1,
      borderColor: colors.borderHairline,
    },
    inner: {
      gap: spacing.sm,
    },
    badge: {
      marginTop: 4,
    },
  });
}
