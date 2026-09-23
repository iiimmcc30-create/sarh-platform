import { ActivityIndicator, View } from 'react-native';
import { useTheme } from '@/hooks/useTheme';

/** Root index waits for boot; AuthGuard is the single navigation decision source. */
export default function Index() {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.screenRoot,
      }}
    >
      <ActivityIndicator size="large" color={colors.electric} />
    </View>
  );
}
