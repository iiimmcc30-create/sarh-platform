import Svg, { Path } from 'react-native-svg';
import { verifiedBadgeColor } from '@/lib/verifiedBadge';

/** Scalloped verification seal (lucide BadgeCheck geometry), filled by tier. */
const SEAL_PATH =
  'M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z';
const CHECK_PATH = 'm9 12 2 2 4-4';

type TierBadgeMarkProps = {
  tier: 'blue' | 'gold';
  size?: number;
  /** Outline only (e.g. an unselected tier). */
  outline?: boolean;
  outlineColor?: string;
};

export function TierBadgeMark({ tier, size = 48, outline = false, outlineColor }: TierBadgeMarkProps) {
  const color = verifiedBadgeColor(tier);
  const stroke = outline ? (outlineColor ?? color) : color;
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      accessibilityRole="image"
      accessibilityLabel={tier === 'gold' ? 'الشارة الذهبية' : 'الشارة الزرقاء'}
    >
      <Path
        d={SEAL_PATH}
        fill={outline ? 'none' : color}
        stroke={stroke}
        strokeWidth={outline ? 1.5 : 1}
        strokeLinejoin="round"
      />
      <Path
        d={CHECK_PATH}
        fill="none"
        stroke={outline ? stroke : '#FFFFFF'}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export default TierBadgeMark;
