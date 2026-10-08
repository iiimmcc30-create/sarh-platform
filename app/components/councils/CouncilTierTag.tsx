import { StyleSheet, View } from 'react-native';
import { radius, spacing } from '@/constants/theme';
import { AppText } from '@/design-system/components';
import { useTheme } from '@/hooks/useTheme';
import { councilTierTag, tierColorKeys, type SubscriberTier } from '@/lib/subscriberTier';

type Props = { tier: SubscriberTier | null | undefined; testID?: string };

/** Small solid tag («مجلس ذهبي» / «Blue+»): tier hairline, faint tier tint, tier text. */
export function CouncilTierTag({ tier, testID }: Props) {
  const { colors } = useTheme();
  const label = councilTierTag(tier);
  if (!tier || !label) return null;
  const keys = tierColorKeys(tier);
  return (
    <View
      testID={testID ?? 'council-tier-tag'}
      style={[styles.tag, { borderColor: colors[keys.line], backgroundColor: colors[keys.soft] }]}
    >
      <AppText variant="micro" style={{ color: colors[keys.line] }} numberOfLines={1}>
        {tier === 'gold' ? `✦ ${label}` : label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
