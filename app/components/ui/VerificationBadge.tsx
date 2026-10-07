import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import {
  VERIFIED_CHECK_COLOR,
  VERIFIED_CHECK_PATH,
  VERIFIED_CHECK_STROKE,
  VERIFIED_SEAL_PATH,
  VERIFIED_SEAL_VIEWBOX,
  resolveVerifiedTier,
  verifiedBadgeColor,
} from '@/lib/verifiedBadge';

type VerificationBadgeProps = {
  size?: number;
  /** "gold" renders the merchant badge; anything else keeps the blue badge. */
  tier?: string | null;
};

/**
 * X-style verified seal (scalloped rosette + white check), react-native-svg only.
 * Blue #1D9BF0 by default, gold for the merchant tier. Shared by every name row.
 */
export function VerificationBadge({ size = 18, tier }: VerificationBadgeProps) {
  const resolved = resolveVerifiedTier(tier);
  return (
    <View
      style={{ width: size, height: size }}
      accessible
      accessibilityRole="image"
      accessibilityLabel={resolved === 'gold' ? 'حساب موثق — الشارة الذهبية' : 'حساب موثق'}
    >
      <Svg width={size} height={size} viewBox={`0 0 ${VERIFIED_SEAL_VIEWBOX} ${VERIFIED_SEAL_VIEWBOX}`}>
        <Path d={VERIFIED_SEAL_PATH} fill={verifiedBadgeColor(resolved)} />
        <Path
          d={VERIFIED_CHECK_PATH}
          fill="none"
          stroke={VERIFIED_CHECK_COLOR}
          strokeWidth={VERIFIED_CHECK_STROKE}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}
