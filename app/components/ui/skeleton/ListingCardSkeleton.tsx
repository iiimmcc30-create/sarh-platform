/**
 * Skeleton of `ListingCard variant="list"` (market / home / profile ads rows).
 * Same card chrome (radius, hairline, margin, shadow) and the full-bleed square
 * image, all from the shared screen-width metrics (listingCardLayout /
 * useListingListMetrics), so the placeholder always has the real row's size.
 * The image is the last child of a logical row → inline end (left in Arabic),
 * matching the real card and the reference.
 */
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { LISTING_LIST_LAYOUT as L, listingListRowPitch } from '@/components/feature/listingCardLayout';
import { useListingListMetrics } from '@/components/feature/useListingListMetrics';
import { ambientShadow } from '@/constants/designSystem';
import { type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { getRtlRow } from '@/lib/rtl';
import { SkeletonBox, SkeletonCircle, SkeletonImage, SkeletonPulse, SkeletonText } from './SkeletonPrimitives';
import { skeletonTextBarHeight } from './skeletonTokens';

/** Real row pitch (card height + list separator) for a given screen width. */
export function listingCardSkeletonPitch(screenWidth: number): number {
  return listingListRowPitch(screenWidth);
}

export function ListingCardSkeleton() {
  const styles = useThemedStyles(({ colors, scheme }) => createStyles(colors, scheme));
  const m = useListingListMetrics();
  const caption = skeletonTextBarHeight(m.metaFontSize, m.metaLineHeight);
  const dyn = useMemo(
    () => ({
      row: { height: m.cardHeight, borderRadius: m.radius, marginHorizontal: m.marginHorizontal },
      content: { paddingHorizontal: m.paddingHorizontal, paddingVertical: m.paddingVertical },
      meta: { gap: m.metaGap, height: Math.max(m.metaIcon, m.metaLineHeight) },
      seller: { gap: m.sellerGap },
    }),
    [m],
  );
  return (
    <View style={[styles.row, dyn.row, getRtlRow()]}>
      <SkeletonPulse style={[styles.content, dyn.content]}>
        <SkeletonText
          fontSize={m.titleFontSize}
          lineHeight={m.titleLineHeight}
          lines={L.titleLines}
          widths={['92%', '58%']}
        />
        <View style={[styles.meta, dyn.meta, getRtlRow()]}>
          <SkeletonBox width="32%" height={caption} />
          <SkeletonBox width="18%" height={caption} />
          <SkeletonBox width="16%" height={caption} />
        </View>
        <View style={[styles.seller, dyn.seller, getRtlRow()]}>
          <SkeletonCircle size={m.avatar} />
          <SkeletonBox width="38%" height={caption} />
        </View>
      </SkeletonPulse>
      <SkeletonPulse>
        <SkeletonImage width={m.image} height={m.cardHeight} radius={0} />
      </SkeletonPulse>
    </View>
  );
}

function createStyles(colors: ThemeColors, scheme: 'light' | 'dark') {
  return StyleSheet.create({
    // = ListingCard listRow + listRowChrome + listClip (sizes from metrics)
    row: {
      alignItems: 'stretch',
      overflow: 'hidden',
      backgroundColor: scheme === 'light' ? '#FFFFFF' : colors.bgSurface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderHairline,
      ...ambientShadow(scheme, 'soft'),
    },
    content: {
      flex: 1,
      minWidth: 0,
      justifyContent: 'space-between',
    },
    meta: {
      alignItems: 'center',
    },
    seller: {
      alignItems: 'center',
    },
  });
}

export default ListingCardSkeleton;
