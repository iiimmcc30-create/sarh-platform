import { AppIcon } from '@/components/ui/FlaticonIcon';
import { spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { getRtlRow } from '@/lib/rtl';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

type ListingBoostTitleIconsProps = {
  pinned?: boolean;
  featured?: boolean;
  /** زيادة الظهور — بدون أي أيقونة بجانب العنوان */
  promoted?: boolean;
  size?: 'sm' | 'md';
  style?: StyleProp<ViewStyle>;
};

/**
 * أيقونات الترقية بجانب عنوان الإعلان:
 * - تثبيت → دبوس صغير
 * - تمييز → نجمة ذهبية
 * - ترويج الظهور → لا شيء (الميزة خوارزمية فقط)
 */
export function ListingBoostTitleIcons({
  pinned = false,
  featured = false,
  size = 'sm',
  style,
}: ListingBoostTitleIconsProps) {
  const { styles, colors } = useThemedStyles(({ colors: c }) => ({
    styles: createStyles(c, size),
    colors: c,
  }));

  if (!pinned && !featured) return null;

  return (
    <View style={[styles.wrap, getRtlRow(), style]} accessibilityElementsHidden>
      {featured ? (
        <View style={styles.starWrap}>
          <AppIcon name="star" size={size === 'sm' ? 11 : 13} color="#1A1300" />
        </View>
      ) : null}
      {pinned ? (
        <View style={styles.pinWrap}>
          <AppIcon name="pin" size={size === 'sm' ? 11 : 13} color={colors.electric} />
        </View>
      ) : null}
    </View>
  );
}

function createStyles(colors: ThemeColors, size: 'sm' | 'md') {
  const dim = size === 'sm' ? 18 : 22;
  return StyleSheet.create({
    wrap: {
      alignItems: 'center',
      gap: 4,
      flexShrink: 0,
    },
    starWrap: {
      width: dim,
      height: dim,
      borderRadius: dim / 2,
      backgroundColor: colors.gold,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pinWrap: {
      width: dim,
      height: dim,
      borderRadius: dim / 2,
      backgroundColor: `${colors.electric}18`,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
