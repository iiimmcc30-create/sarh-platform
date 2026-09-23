/**
 * Sarh screen shell — matches ProfileScreenLayout dark-mode look.
 * Use screenRoot for page backgrounds; bgElevated for cards/controls.
 */
import { type ViewStyle } from 'react-native';
import { ds } from '@/constants/designSystem';
import { sarh } from '@/constants/sarhTokens';
import { spacing, type ColorScheme, type ThemeColors } from '@/constants/theme';

/** Page background — always opaque to block React Navigation white scenes. */
export function sarhScreenRoot(scheme: ColorScheme, colors: ThemeColors): string {
  return scheme === 'dark' ? (colors.bgDeep || sarh.color.bg) : colors.bgDeep;
}

export function sarhScreenStyles(colors: ThemeColors, scheme: ColorScheme) {
  return {
    screenRoot: {
      flex: 1,
      backgroundColor: sarhScreenRoot(scheme, colors),
    } satisfies ViewStyle,
    headerBar: {
      backgroundColor: sarhScreenRoot(scheme, colors),
    } satisfies ViewStyle,
    iconBtn: {
      width: ds.iconBtn.md,
      height: ds.iconBtn.md,
      borderRadius: 12,
      backgroundColor: colors.bgElevated,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      borderWidth: 0,
    } satisfies ViewStyle,
    card: {
      backgroundColor: colors.bgElevated,
      borderRadius: 14,
      borderWidth: 0,
      overflow: 'hidden' as const,
    } satisfies ViewStyle,
    sectionCard: {
      marginHorizontal: spacing.lg,
      backgroundColor: colors.bgElevated,
      borderRadius: 14,
      borderWidth: 0,
      overflow: 'hidden' as const,
    } satisfies ViewStyle,
  };
}
