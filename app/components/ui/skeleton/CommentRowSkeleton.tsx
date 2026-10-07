/**
 * Skeleton of one PostCommentsSection reply row (feed-row metrics): 40px avatar at
 * the inline start, name/handle/time line (16/24), one or two body lines (16/24),
 * same paddings, gap, surface and bottom hairline.
 */
import { StyleSheet, View } from 'react-native';
import { spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { getRtlRow } from '@/lib/rtl';
import { POST_ITEM_LAYOUT } from '@/components/feature/postItemLayout';
import { SkeletonBox, SkeletonCircle, SkeletonPulse, SkeletonText } from './SkeletonPrimitives';
import { skeletonTextBarHeight } from './skeletonTokens';

export const COMMENT_AVATAR = POST_ITEM_LAYOUT.avatar;

export function CommentRowSkeleton({ lines = 1 }: { lines?: number }) {
  const styles = useThemedStyles(({ colors, scheme }) => createStyles(colors, scheme));
  const nameBar = skeletonTextBarHeight(typography.feedTitle.fontSize, typography.feedTitle.lineHeight);
  const metaBar = skeletonTextBarHeight(typography.caption.fontSize, typography.caption.lineHeight);
  return (
    <View style={styles.wrap}>
      <SkeletonPulse style={[styles.row, getRtlRow()]}>
        <SkeletonCircle size={COMMENT_AVATAR} />
        <View style={styles.main}>
          <View style={[styles.header, getRtlRow()]}>
            <SkeletonBox width="28%" height={nameBar} />
            <SkeletonBox width="18%" height={metaBar} />
          </View>
          <SkeletonText
            fontSize={typography.body.fontSize}
            lineHeight={typography.body.lineHeight}
            lines={lines}
            widths={lines > 1 ? ['96%', '54%'] : ['72%']}
          />
        </View>
      </SkeletonPulse>
    </View>
  );
}

function createStyles(colors: ThemeColors, scheme: 'light' | 'dark') {
  return StyleSheet.create({
    wrap: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderStrong,
      backgroundColor: scheme === 'light' ? colors.bgSurface : colors.bgDeep,
    },
    row: {
      alignItems: 'flex-start',
      gap: POST_ITEM_LAYOUT.rowGap,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
    },
    main: {
      flex: 1,
      minWidth: 0,
      gap: 4,
    },
    header: {
      alignItems: 'center',
      gap: 4,
      height: typography.feedTitle.lineHeight,
    },
  });
}

export default CommentRowSkeleton;
