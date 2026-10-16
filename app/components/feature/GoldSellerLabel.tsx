import { StyleSheet, type StyleProp, type TextStyle } from 'react-native';
import { AppText } from '@/design-system/components';
import { useTheme } from '@/hooks/useTheme';
import { useMyBadgePrefs } from '@/hooks/useMyBadgePrefs';
import { GOLD_SELLER_LABEL, showsGoldSellerLabel } from '@/lib/goldSeller';

type Props = {
  user:
    | { id?: string | null; verified?: boolean | null; verifiedTier?: string | null; hideGoldSellerLabel?: boolean | null }
    | null
    | undefined;
  style?: StyleProp<TextStyle>;
  testID?: string;
};

/** Quiet «بائع ذهبي» (X-style): small gold caption, no chip, renders nothing for others. */
export function GoldSellerLabel({ user, style, testID = 'gold-seller-label' }: Props) {
  const { colors } = useTheme();
  const own = useMyBadgePrefs();
  if (!showsGoldSellerLabel(user, own)) return null;
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
