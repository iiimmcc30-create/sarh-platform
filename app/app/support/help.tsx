import { View, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SupportFlowSheet } from '@/components/support/SupportFlowSheet';

/** «اسأل مساعد سرح» — opened from the help hub. */
export default function CustomerHelpScreen() {
  const router = useRouter();
  const { topic } = useLocalSearchParams<{ topic?: string }>();

  return (
    <View style={styles.root}>
      <SupportFlowSheet
        visible
        initialChoiceId={typeof topic === 'string' ? topic : undefined}
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
