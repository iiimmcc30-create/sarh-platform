import { RefreshControl, type RefreshControlProps } from 'react-native';
import { useTheme } from '@/hooks/useTheme';

/**
 * Pull-to-refresh with one calm, neutral spinner everywhere (iOS system grey look;
 * Android spinner on the elevated surface). Callers pass `refreshing` / `onRefresh`.
 */
export function AppRefreshControl(props: RefreshControlProps) {
  const { colors } = useTheme();
  return (
    <RefreshControl
      tintColor={colors.textMuted}
      colors={[colors.textPrimary]}
      progressBackgroundColor={colors.bgElevated}
      {...props}
    />
  );
}

export default AppRefreshControl;
