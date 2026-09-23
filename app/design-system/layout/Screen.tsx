import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { SarhPatternBackground } from '@/components/ui/SarhPatternBackground';
import { useTheme } from '@/hooks/useTheme';
import { getRtlDirection } from '@/lib/rtl';

export type ScreenBackground = 'page' | 'surface';

export type ScreenProps = {
  children: ReactNode;
  edges?: Edge[];
  /** Sarh curves behind the page. Dark scheme only; ignored in light. */
  pattern?: boolean;
  /** Wrap content in KeyboardAvoidingView. Use on form screens. */
  keyboard?: boolean;
  background?: ScreenBackground;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * The screen shell: safe area, page background, root RTL direction, and
 * optional keyboard avoidance. One per route.
 *
 * A screen must not declare its own `SafeAreaView`, page background, or
 * layout direction — and must not own spacing or typography.
 *
 * Module-scope styles hold layout only. `colors` is mutated by
 * `applyThemeScheme`, so every color is read at render time.
 */
const styles = StyleSheet.create({
  root: { flex: 1 },
  fill: { flex: 1 },
});

export function Screen({
  children,
  edges = ['top'],
  pattern = true,
  keyboard = false,
  background = 'page',
  style,
  testID,
}: ScreenProps) {
  const { colors, isDark } = useTheme();
  const showPattern = pattern && isDark;
  const pageColor = background === 'surface' ? colors.bgSurface : colors.screenRoot;

  const content = keyboard ? (
    <KeyboardAvoidingView
      style={styles.fill}
      // Edge-to-edge Android no longer resizes the window (`edgeToEdgeEnabled`).
      behavior="padding"
    >
      {children}
    </KeyboardAvoidingView>
  ) : (
    children
  );

  const body = (
    <SafeAreaView
      testID={testID}
      edges={edges}
      style={[
        styles.root,
        { backgroundColor: showPattern ? 'transparent' : pageColor },
        getRtlDirection(),
        style,
      ]}
    >
      {content}
    </SafeAreaView>
  );

  if (!showPattern) return body;

  return <SarhPatternBackground>{body}</SarhPatternBackground>;
}

export default Screen;
