import { View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SupportFlowSheet } from '@/components/support/SupportFlowSheet';

export default function SupportHubScreen() {
  const router = useRouter();
  return (
    <View style={styles.root}>
      <SupportFlowSheet
        visible
        onClose={() => {
          if (router.canGoBack()) router.back();
          else router.replace('/(tabs)' as never);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
});
