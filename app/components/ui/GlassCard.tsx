import { ds } from '@/constants/designSystem';
import { type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

interface GlassCardProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  glow?: boolean;
  elevated?: boolean;
  padding?: number;
}

/** Premium flat card surface — Sarh design system */
export function GlassCard({
  children,
  style,
  elevated = false,
  padding = ds.space.md,
}: GlassCardProps) {
  const { styles } = useThemedStyles((theme) => ({
    styles: createStyles(theme.colors),
  }));

  return (
    <View style={[styles.wrap, style]}>
      <View style={[styles.card, elevated && styles.elevated, { padding }]}>{children}</View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      borderRadius: 16,
    },
    card: {
      borderRadius: 16,
      backgroundColor: colors.bgSurface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSoft,
      overflow: 'hidden',
    },
    elevated: {
      backgroundColor: colors.bgElevated,
    },
  });
}

export default GlassCard;
