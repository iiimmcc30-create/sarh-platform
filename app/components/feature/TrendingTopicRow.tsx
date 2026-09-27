import { fontFamily, fontWeight, motion, typography } from '@/design-system';
import { AppText } from '@/design-system/components';
import { TRENDING_ROW, type TrendingRow } from '@/lib/searchTrending';
import { Pressable, StyleSheet } from 'react-native';

type Props = {
  row: TrendingRow;
  /** Receives the trend query; Search passes its existing applyQuery. */
  onPress: (query: string) => void;
};

/**
 * One X-style trending row: grey meta line ("1 • وسم • متداول"), bold title,
 * optional post count. Plain list row - no card, border, divider or background.
 * No overflow (three-dot) menu: trends have no existing overflow action.
 */
export function TrendingTopicRow({ row, onPress }: Props) {
  return (
    <Pressable
      onPress={() => onPress(row.query)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${row.title}، ${row.meta}`}
    >
      <AppText variant="caption" color="textSecondary" numberOfLines={1} style={styles.meta}>
        {row.meta}
      </AppText>
      <AppText variant="body" color="textPrimary" numberOfLines={2} style={styles.title}>
        {row.title}
      </AppText>
      {row.countLabel ? (
        <AppText variant="caption" color="textSecondary" numberOfLines={1} style={styles.meta}>
          {row.countLabel}
        </AppText>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: TRENDING_ROW.paddingHorizontal,
    paddingVertical: TRENDING_ROW.paddingVertical,
    gap: TRENDING_ROW.lineGap,
  },
  pressed: { opacity: motion.opacity.pressed },
  meta: {
    fontSize: TRENDING_ROW.metaFontSize,
    lineHeight: 18,
  },
  title: {
    fontSize: TRENDING_ROW.titleFontSize,
    lineHeight: typography.body.lineHeight,
    fontWeight: fontWeight.bold,
    fontFamily: fontFamily.bold,
  },
});

export default TrendingTopicRow;