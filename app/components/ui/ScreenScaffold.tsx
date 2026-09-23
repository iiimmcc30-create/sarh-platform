import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { SarhPatternBackground } from '@/components/ui/SarhPatternBackground';
import { useThemedStyles } from '@/hooks/useThemedStyles';

type ScreenScaffoldProps = {
  children: ReactNode;
  edges?: Edge[];
  style?: ViewStyle;
  contentStyle?: ViewStyle;
  /** Show subtle Sarh pattern (dark mode). Default true. */
  pattern?: boolean;
};

/** Unified screen shell — page background + safe area. UI only. */
export function ScreenScaffold({
  children,
  edges = ['top'],
  style,
  contentStyle,
  pattern = true,
}: ScreenScaffoldProps) {
  const styles = useThemedStyles(({ colors }) =>
    StyleSheet.create({
      root: { flex: 1, backgroundColor: colors.screenRoot },
      rootTransparent: { flex: 1, backgroundColor: 'transparent' },
      inner: { flex: 1 },
    }),
  );

  const body = (
    <SafeAreaView
      style={[pattern ? styles.rootTransparent : styles.root, style]}
      edges={edges}
    >
      <View style={[styles.inner, contentStyle]}>{children}</View>
    </SafeAreaView>
  );

  if (!pattern) return body;

  return <SarhPatternBackground>{body}</SarhPatternBackground>;
}

export default ScreenScaffold;
