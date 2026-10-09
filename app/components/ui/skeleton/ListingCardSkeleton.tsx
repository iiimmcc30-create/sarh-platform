/**
 * Skeleton of `ListingCard variant="list"` (market / home / profile ads rows).
 * Same card chrome (radius, hairline, margin, shadow) and the full-bleed
 * square image from LISTING_LIST_LAYOUT (fills the 140pt card height, flush
 * with the left edge); the padded text column holds title (2 lines), meta
 * line and seller line.
 * The thumb is the last child of a logical row → inline end (left in Arabic),
 * matching the real card and the reference.
 */
import { StyleSheet, View } from 'react-native';
import { MENU_CARD } from '@/components/feature/SidebarMenu';
import { LISTING_LIST_LAYOUT as L } from '@/components/feature/listingCardLayout';
import { ambientShadow } from '@/constants/designSystem';
import { spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { getRtlRow } from '@/lib/rtl';
import { SkeletonBox, SkeletonCircle, SkeletonImage, SkeletonPulse, SkeletonText } from './SkeletonPrimitives';
import { skeletonTextBarHeight } from './skeletonTokens';

/** Real row height (separator is added by the list). */
export const LISTING_CARD_SKELETON_HEIGHT = L.rowHeight;

export function ListingCardSkeleton() {
  const styles = useThemedStyles(({ colors, scheme }) => createStyles(colors, scheme));
  const caption = skeletonTextBarHeight(typography.caption.fontSize, typography.caption.lineHeight);
  return (
    <View style={[styles.row, getRtlRow()]}>
      <SkeletonPulse style={styles.content}>
        <SkeletonText
          fontSize={typography.cardHeading.fontSize}
          lineHeight={typography.cardHeading.lineHeight}
          lines={L.titleLines}
          widths={['92%', '58%']}
        />
        <View style={[styles.meta, getRtlRow()]}>
          <SkeletonBox width="32%" height={caption} />
          <SkeletonBox width="18%" height={caption} />
          <SkeletonBox width="16%" height={caption} />
        </View>
        <View style={[styles.seller, getRtlRow()]}>
          <SkeletonCircle size={L.avatar} />
          <SkeletonBox width="38%" height={caption} />
        </View>
      </SkeletonPulse>
      <SkeletonPulse>
        <SkeletonImage width={L.image} height={L.rowHeight} radius={0} />
      </SkeletonPulse>
    </View>
  );
}

function createStyles(colors: ThemeColors, scheme: 'light' | 'dark') {
  return StyleSheet.create({
    // = ListingCard listRow + listRowChrome + listClip
    row: {
      alignItems: 'stretch',
      height: L.rowHeight,
      overflow: 'hidden',
      backgroundColor: scheme === 'light' ? '#FFFFFF' : colors.bgSurface,
      borderRadius: MENU_CARD.radius,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderHairline,
      marginHorizontal: spacing.sm,
      ...ambientShadow(scheme, 'soft'),
    },
    content: {
      flex: 1,
      minWidth: 0,
      paddingHorizontal: L.contentPaddingHorizontal,
      paddingVertical: L.rowPaddingVertical,
      justifyContent: 'space-between',
    },
    meta: {
      alignItems: 'center',
      gap: L.metaGap,
      height: typography.caption.lineHeight,
    },
    seller: {
      alignItems: 'center',
      gap: L.sellerGap,
    },
  });
}

export default ListingCardSkeleton;
