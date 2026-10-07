/**
 * X-style profile stats: «677 المتابعون» — bold number first (right in RTL),
 * regular secondary label to its left. Compact: caption size (12/18) for both,
 * 4pt between number and label, 12pt between items, no dividers.
 */
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { AppText } from '@/design-system/components';
import { Row } from '@/design-system/layout';
import { fontFamily } from '@/design-system/tokens/typography';

export type ProfileStatItem = {
  key: string;
  value: string;
  label: string;
  onPress?: () => void;
};

/** Gap between stat items (GAP.md = 12). */
export const PROFILE_STATS_ITEM_GAP = 'md' as const;
/** Gap between a number and its label (GAP.xs = 4). */
export const PROFILE_STATS_INNER_GAP = 'xs' as const;
/** One step under the 14pt bodySmall used before. */
export const PROFILE_STATS_VARIANT = 'caption' as const;

export function ProfileStatsRow({
  stats,
  style,
}: {
  stats: ProfileStatItem[];
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Row gap={PROFILE_STATS_ITEM_GAP} align="center" justify="start" wrap style={style} testID="profile-stats-row">
      {stats.map((stat) => {
        const body = (
          <Row gap={PROFILE_STATS_INNER_GAP} align="center" testID={`profile-stat-${stat.key}`}>
            <AppText variant={PROFILE_STATS_VARIANT} color="textPrimary" numberOfLines={1} style={styles.value}>
              {stat.value}
            </AppText>
            <AppText variant={PROFILE_STATS_VARIANT} color="textSecondary" numberOfLines={1}>
              {stat.label}
            </AppText>
          </Row>
        );

        return stat.onPress ? (
          <Pressable
            key={stat.key}
            style={({ pressed }) => (pressed ? styles.pressed : null)}
            onPress={stat.onPress}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`${stat.value} ${stat.label}`}
          >
            {body}
          </Pressable>
        ) : (
          <View key={stat.key}>{body}</View>
        );
      })}
    </Row>
  );
}

const styles = StyleSheet.create({
  value: {
    fontFamily: fontFamily.bold,
  },
  pressed: {
    opacity: 0.7,
  },
});

export default ProfileStatsRow;
