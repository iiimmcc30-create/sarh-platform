// SAFAT — Common Styles (v2)
import { StyleSheet } from 'react-native';
import { getRtlRow } from '@/lib/rtl';
import { ds } from './designSystem';
import { colors, spacing, shadow, type ThemeColors } from './theme';

/**
 * Shared recipes. Call at render time (typically via `useThemedStyles`) so
 * `applyThemeScheme` is reflected. Do not invoke at module scope.
 */
export function createCommonStyles(
  palette: ThemeColors = colors,
  cardShadow: typeof shadow = shadow,
) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: palette.bgDeep,
    },
    glassPanel: {
      backgroundColor: palette.bgGlass,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: palette.borderSoft,
      borderRadius: ds.radius.lg,
    },
    glassPanelElevated: {
      backgroundColor: palette.bgSurface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: palette.borderSoft,
      borderRadius: ds.radius.xl,
      ...cardShadow.card,
    },
    pill: {
      height: 46,
      paddingHorizontal: 22,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'flex-start',
      flexShrink: 0,
      backgroundColor: palette.bgSurface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: palette.borderSoft,
    },
    pillActive: {
      height: 46,
      paddingHorizontal: 22,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'flex-start',
      flexShrink: 0,
      backgroundColor: palette.electricBright,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: palette.electricBright,
    },
    centerRow: {
      ...getRtlRow(),
      alignItems: 'center',
    },
    spaceBetween: {
      ...getRtlRow(),
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: palette.borderHairline,
      marginVertical: spacing.lg,
    },
    iconBubble: {
      width: ds.iconBtn.md,
      height: ds.iconBtn.md,
      borderRadius: ds.radius.pill,
      backgroundColor: palette.bgSurface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: palette.borderSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}

export default createCommonStyles;
