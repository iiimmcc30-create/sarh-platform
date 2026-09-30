import { StyleSheet, View } from 'react-native';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { resolveVerifiedTier, verifiedBadgeColor } from '@/lib/verifiedBadge';

type VerificationBadgeProps = {
  size?: number;
  /** "gold" renders the merchant badge; anything else keeps the blue badge. */
  tier?: string | null;
};

export function VerificationBadge({ size = 18, tier }: VerificationBadgeProps) {
  const iconSize = Math.round(size * 0.58);
  const resolved = resolveVerifiedTier(tier);
  return (
    <View
      style={[
        styles.badge,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: verifiedBadgeColor(resolved),
        },
      ]}
      accessibilityLabel={resolved === 'gold' ? 'حساب موثق — الشارة الذهبية' : 'حساب موثق'}
    >
      <AppIcon name="checkmark" size={iconSize} color="#FFFFFF" />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
