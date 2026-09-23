import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText } from '@/design-system/components';
import { space } from '@/design-system/tokens';
import { useTheme } from '@/hooks/useTheme';
import { useLayout, type ContentWidth } from '@/hooks/useLayout';
import { BOTTOM_ACTION_MIN_HEIGHT } from './metrics';
import { Row } from './Row';
import { Stack } from './Stack';

export type BottomActionSummary = {
  label: string;
  value: string;
};

export type BottomActionProps = {
  /** The primary control. Exactly one per screen. */
  children: ReactNode;
  /** Optional leading readout, e.g. an order total. */
  summary?: BottomActionSummary;
  divider?: boolean;
  background?: 'page' | 'surface';
  width?: ContentWidth;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Sticky bottom bar for the screen's primary action.
 *
 * Pair it with `<ScreenBody bottomInset="action">` so the scrolled content is
 * never covered. Layout and chrome only — it does not know what the action does.
 *
 * Module-scope styles hold layout only; theme colors are read at render time.
 */
const styles = StyleSheet.create({
  root: { width: '100%' },
  inner: {
    minHeight: BOTTOM_ACTION_MIN_HEIGHT,
    paddingVertical: space[16],
  },
  summary: { flex: 1, minWidth: 0 },
  action: { flex: 1, minWidth: 0 },
  actionWide: { flex: 1.2, minWidth: 0 },
});

export function BottomAction({
  children,
  summary,
  divider = true,
  background = 'page',
  width = 'content',
  style,
  testID,
}: BottomActionProps) {
  const { colors } = useTheme();
  const layout = useLayout();
  const maxWidth = layout.maxWidthFor(width);

  return (
    <SafeAreaView
      testID={testID}
      edges={['bottom']}
      style={[
        styles.root,
        {
          backgroundColor: background === 'surface' ? colors.bgSurface : colors.screenRoot,
          borderTopWidth: divider ? StyleSheet.hairlineWidth : 0,
          borderTopColor: colors.borderSoft,
        },
        style,
      ]}
    >
      <Row
        gap="md"
        align="center"
        style={[
          styles.inner,
          { paddingHorizontal: layout.gutter },
          maxWidth != null ? { maxWidth, width: '100%', alignSelf: 'center' } : null,
        ]}
      >
        {summary ? (
          <Stack gap="none" style={styles.summary}>
            <AppText variant="caption" color="textMuted" numberOfLines={1}>
              {summary.label}
            </AppText>
            <AppText variant="price" color="textPrimary" numberOfLines={1}>
              {summary.value}
            </AppText>
          </Stack>
        ) : null}
        <View style={summary ? styles.actionWide : styles.action}>{children}</View>
      </Row>
    </SafeAreaView>
  );
}

export default BottomAction;
