import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/design-system/components';
import { useTheme } from '@/hooks/useTheme';
import { getRtlDirection } from '@/lib/rtl';
import { SHEET_GRABBER, SHEET_RADIUS, sheetBottomPadding } from './sheetLayout';

export type SheetSurfaceProps = {
  title?: string;
  message?: string;
  /** Small pill at the top (drag affordance). */
  grabber?: boolean;
  /** Pad the bottom for the home indicator / nav bar (inside the surface). */
  safeBottom?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  children?: ReactNode;
};

/**
 * The one bottom-sheet surface: theme surface flush to the bottom edge, 22pt top
 * corners, hairline top edge, grabber, optional centered title/message. The
 * surface's own background covers the safe-area padding, so there is never a
 * see-through gap under a sheet. Put it inside `SheetModal`.
 */
export function SheetSurface({
  title,
  message,
  grabber = true,
  safeBottom = true,
  style,
  testID,
  children,
}: SheetSurfaceProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      testID={testID}
      style={[
        styles.surface,
        getRtlDirection(),
        {
          backgroundColor: colors.bgSurface,
          borderColor: colors.borderSoft,
          paddingBottom: safeBottom ? sheetBottomPadding(insets.bottom) : 0,
        },
        style,
      ]}
    >
      {grabber ? (
        <View
          style={[styles.grabber, { backgroundColor: colors.textMuted }]}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      ) : null}
      {title || message ? (
        <View style={styles.header}>
          {title ? (
            <AppText variant="label" color="textPrimary" align="center" accessibilityRole="header">
              {title}
            </AppText>
          ) : null}
          {message ? (
            <AppText variant="caption" color="textMuted" align="center">
              {message}
            </AppText>
          ) : null}
        </View>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  surface: {
    borderTopLeftRadius: SHEET_RADIUS,
    borderTopRightRadius: SHEET_RADIUS,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    paddingTop: 8,
  },
  grabber: {
    alignSelf: 'center',
    width: SHEET_GRABBER.width,
    height: SHEET_GRABBER.height,
    borderRadius: SHEET_GRABBER.height,
    opacity: 0.45,
    marginBottom: 8,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 4,
    paddingBottom: 12,
    gap: 4,
  },
});

export default SheetSurface;
