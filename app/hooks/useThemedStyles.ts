import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { sarhScreenStyles } from '@/constants/sarhScreen';
import { useTheme } from '@/hooks/useTheme';

/** Theme + Sarh screen tokens (profile-matched dark mode). */
export type ThemedStylesContext = ReturnType<typeof useTheme> & {
  sarh: ReturnType<typeof sarhScreenStyles>;
};

/**
 * Theme-aware styles — pass the full theme context:
 *
 * ```ts
 * const styles = useThemedStyles(({ colors, scheme, sarh }) =>
 *   StyleSheet.create({
 *     container: sarh.screenRoot,
 *     card: sarh.card,
 *     title: { color: colors.textPrimary },
 *   }),
 * );
 * ```
 */
export function useThemedStyles<T>(factory: (theme: ThemedStylesContext) => T): T {
  const theme = useTheme();
  return useMemo(() => {
    const ctx: ThemedStylesContext = {
      ...theme,
      sarh: sarhScreenStyles(theme.colors, theme.scheme),
    };
    return factory(ctx);
  }, [theme.scheme]);
}

/** Shorthand when you only need StyleSheet.create with theme. */
export function createThemedStyles<T extends StyleSheet.NamedStyles<T>>(
  factory: (theme: ThemedStylesContext) => T,
): (theme: ThemedStylesContext) => T {
  return factory;
}

export default useThemedStyles;
