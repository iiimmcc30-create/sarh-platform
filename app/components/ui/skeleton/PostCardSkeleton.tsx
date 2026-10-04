/**
 * Skeleton of the full-width `PostItem` row (feed / profile variants):
 * 40px avatar at the inline start (right in Arabic), name + handle line,
 * two body lines, optional 16:11 media, and the interaction bar drawn as dots in
 * the same layout as the real bar: equal main slots + a compact bookmark/share group.
 */
import { StyleSheet, View } from 'react-native';
import { POST_ITEM_LAYOUT as P } from '@/components/feature/postItemLayout';
import { spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import {
  INTERACTION_BAR_STYLE,
  INTERACTION_BUTTON_STYLE,
  INTERACTION_COMPACT_BUTTON_STYLE,
  INTERACTION_ICON_SIZE,
  INTERACTION_TRAILING_GROUP_STYLE,
} from '@/lib/interactionActions';
import { getRtlRow } from '@/lib/rtl';
import { SkeletonBox, SkeletonCircle, SkeletonImage, SkeletonPulse, SkeletonText } from './SkeletonPrimitives';
import { skeletonTextBarHeight } from './skeletonTokens';

/** PostMediaGallery feed container ratio / radius. */
const MEDIA_RATIO = 16 / 11;
const MEDIA_RADIUS = 12;
const MEDIA_MAX_HEIGHT = 340;
/** Main slots: comment, repost, like, views (detail hides views). Then bookmark + share. */
const FEED_MAIN_ACTIONS = 4;
const TRAILING_ACTIONS = 2;

function ActionsSkeleton({ main, styles }: { main: number; styles: ReturnType<typeof createStyles> }) {
  return (
    <View style={[styles.actions, getRtlRow()]}>
      {Array.from({ length: main }, (_, i) => (
        <View key={i} style={[styles.actionSlot, getRtlRow()]}>
          <SkeletonCircle size={INTERACTION_ICON_SIZE} />
        </View>
      ))}
      <View style={[styles.trailing, getRtlRow()]}>
        {Array.from({ length: TRAILING_ACTIONS }, (_, i) => (
          <View key={i} style={[styles.compactSlot, getRtlRow()]}>
            <SkeletonCircle size={INTERACTION_ICON_SIZE} />
          </View>
        ))}
      </View>
    </View>
  );
}

type Props = {
  withMedia?: boolean;
  bodyLines?: number;
  /** Profile reply rows have no action bar. */
  showActions?: boolean;
};

/**
 * = PostItem `variant="detail"`: padded header (avatar, name + handle), three
 * body lines (marginTop 12), meta line and the five-slot action bar
 * (detail hides the views action).
 */
export function PostDetailSkeleton() {
  const styles = useThemedStyles(({ colors, scheme }) => createStyles(colors, scheme));
  return (
    <View style={styles.wrap}>
      <SkeletonPulse style={styles.detailPad}>
        <View style={[styles.detailHeader, getRtlRow()]}>
          <SkeletonCircle size={P.avatar} />
          <View style={styles.main}>
            <SkeletonText
              fontSize={typography.cardHeading.fontSize}
              lineHeight={typography.cardHeading.lineHeight}
              widths={['38%']}
            />
            <SkeletonText fontSize={typography.caption.fontSize} lineHeight={typography.caption.lineHeight} widths={['24%']} />
          </View>
        </View>
        <SkeletonText
          fontSize={typography.body.fontSize}
          lineHeight={24}
          lines={3}
          widths={['100%', '94%', '62%']}
          style={styles.detailBody}
        />
        <SkeletonText
          fontSize={typography.caption.fontSize}
          lineHeight={typography.caption.lineHeight}
          widths={['46%']}
          style={styles.detailBody}
        />
        <ActionsSkeleton main={FEED_MAIN_ACTIONS - 1} styles={styles} />
      </SkeletonPulse>
    </View>
  );
}

export function PostCardSkeleton({ withMedia = false, bodyLines = 2, showActions = true }: Props) {
  const styles = useThemedStyles(({ colors, scheme }) => createStyles(colors, scheme));
  const nameBar = skeletonTextBarHeight(typography.cardHeading.fontSize, typography.cardHeading.lineHeight);
  const handleBar = skeletonTextBarHeight(typography.caption.fontSize, typography.caption.lineHeight);
  return (
    <View style={styles.wrap}>
      <SkeletonPulse style={[styles.row, getRtlRow()]}>
        <SkeletonCircle size={P.avatar} />
        <View style={styles.main}>
          <View style={[styles.metaLine, getRtlRow()]}>
            <SkeletonBox width="30%" height={nameBar} />
            <SkeletonBox width="22%" height={handleBar} />
          </View>
          <SkeletonText
            fontSize={typography.body.fontSize}
            lineHeight={typography.body.lineHeight}
            lines={bodyLines}
            widths={bodyLines > 1 ? ['100%', '72%'] : ['80%']}
            style={styles.body}
          />
          {withMedia ? (
            <SkeletonImage aspectRatio={MEDIA_RATIO} radius={MEDIA_RADIUS} style={styles.media} />
          ) : null}
          {showActions ? (
            <ActionsSkeleton main={FEED_MAIN_ACTIONS} styles={styles} />
          ) : null}
        </View>
      </SkeletonPulse>
    </View>
  );
}

function createStyles(colors: ThemeColors, scheme: 'light' | 'dark') {
  return StyleSheet.create({
    // = PostItem rowWrap / row / main
    wrap: {
      backgroundColor: scheme === 'light' ? colors.bgSurface : colors.bgDeep,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderHairline,
    },
    row: {
      alignItems: 'flex-start',
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
      paddingBottom: spacing.sm,
      gap: P.rowGap,
    },
    main: {
      flex: 1,
      minWidth: 0,
    },
    detailPad: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
    },
    detailHeader: {
      alignItems: 'flex-start',
      gap: P.rowGap,
    },
    detailBody: {
      marginTop: 12,
    },
    metaLine: {
      alignItems: 'center',
      gap: 8,
      height: typography.cardHeading.lineHeight,
    },
    body: {
      marginTop: P.bodyMarginTop,
    },
    media: {
      marginTop: P.mediaMarginTop,
      maxHeight: MEDIA_MAX_HEIGHT,
    },
    actions: {
      ...INTERACTION_BAR_STYLE,
    },
    actionSlot: {
      ...INTERACTION_BUTTON_STYLE,
    },
    trailing: {
      ...INTERACTION_TRAILING_GROUP_STYLE,
    },
    compactSlot: {
      ...INTERACTION_COMPACT_BUTTON_STYLE,
    },
  });
}

export default PostCardSkeleton;
