// Legacy OAuth callback route — Google sign-in removed; redirect to phone login.
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';

export default function ExpoAuthSessionScreen() {
  const router = useRouter();
  const { colors } = useTheme();

  useEffect(() => {
    router.replace('/auth/phone' as any);
  }, [router]);

  return (
    <View style={[styles.wrap, { backgroundColor: colors.bgDeep }]}>
      <ActivityIndicator color={colors.electric} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
