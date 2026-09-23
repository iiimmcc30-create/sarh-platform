import { View, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SupportFlowSheet } from '@/components/support/SupportFlowSheet';

export default function CustomerHelpScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ orderId?: string }>();
  const presetOrderId = typeof params.orderId === 'string' ? params.orderId : undefined;

  return (
    <View style={styles.root}>
      <SupportFlowSheet
        visible
        initialChoiceId="ORDER_HELP"
        presetOrderId={presetOrderId}
        onClose={() => {
          if (router.canGoBack()) router.back();
          else router.replace('/support' as never);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
});
