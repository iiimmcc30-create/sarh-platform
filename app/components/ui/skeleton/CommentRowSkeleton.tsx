/**
 * Skeleton of one PostCommentsSection comment row: 36px avatar at the inline
 * start, name/handle/time line (feedTitle 16/24), one or two comment lines
 * (feedBody 14 / 22), same paddings, gap and bottom hairline.
 */
import { StyleSheet, View } from 'react-native';
import { spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { getRtlRow } from '@/lib/rtl';
import { SkeletonBox, SkeletonCircle, SkeletonPulse, SkeletonText } from './SkeletonPrimitives';
import { skeletonTextBarHeight } from './skeletonTokens';

export const COMMENT_AVATAR = 36;

export function CommentRowSkeleton({ lines = 1 }: { lines?: number }) {
  const styles = useThemedStyles(({ colors }) => createStyles(colors));
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
            fontSize={typography.feedBody.fontSize}
            lineHeight={22}
            lines={lines}
            widths={lines > 1 ? ['96%', '54%'] : ['72%']}
          />
        </View>
      </SkeletonPulse>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderHairline,
      backgroundColor: colors.bgDeep,
    },
    row: {
      alignItems: 'flex-start',
      gap: 12,
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
