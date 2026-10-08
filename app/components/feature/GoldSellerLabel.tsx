import { StyleSheet, type StyleProp, type TextStyle } from 'react-native';
import { AppText } from '@/design-system/components';
import { useTheme } from '@/hooks/useTheme';
import { GOLD_SELLER_LABEL, isGoldSeller } from '@/lib/goldSeller';

type Props = {
  user: { verified?: boolean | null; verifiedTier?: string | null } | null | undefined;
  style?: StyleProp<TextStyle>;
  testID?: string;
};

/** Quiet «بائع ذهبي» (X-style): small gold caption, no chip, renders nothing for others. */
export function GoldSellerLabel({ user, style, testID = 'gold-seller-label' }: Props) {
  const { colors } = useTheme();
  if (!isGoldSeller(user)) return null;
  return (
    <AppText
      variant="caption"
      numberOfLines={1}
      style={[styles.label, { color: colors.tierGold }, style]}
      testID={testID}
    >
      {GOLD_SELLER_LABEL}
    </AppText>
  );
}

const styles = StyleSheet.create({
  label: { fontWeight: '600' },
});
