import { AppIcon } from '@/components/ui/FlaticonIcon';
import { LinearGradient } from '@/components/ui/AppLinearGradient';
import { AppText, SarhButton } from '@/design-system/components';
import { Screen, ScreenBody, Stack } from '@/design-system/layout';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { type ThemeColors } from '@/constants/theme';

/** Cancel URL from Network International when the shopper abandons checkout. */
export default function PaymentCancelScreen() {
  const { colors, gradients } = useTheme();
  const styles = useThemedStyles(({ colors: c }) => createStyles(c));
  const router = useRouter();

  return (
    <Screen edges={['top', 'bottom']} pattern={false} style={styles.screen}>
      <LinearGradient colors={gradients.hero} style={StyleSheet.absoluteFill} />
      <ScreenBody scroll={false} padTop="xl" padBottom="xl">
        <Stack gap="md" align="center" fill style={styles.wrap}>
          <View style={styles.iconWrap}>
            <AppIcon name="close-circle" size={48} color={colors.rose} />
          </View>
          <AppText variant="heading2" align="center">لم يكتمل الدفع</AppText>
          <AppText variant="body" color="textSecondary" align="center">
            لم تُخصم أي مبالغ. يمكنك المحاولة مرة أخرى متى شئت.
          </AppText>
          <SarhButton
            title="إعادة المحاولة"
            fullWidth
            onPress={() => {
              router.replace('/subscription' as never);
            }}
          />
          <SarhButton
            title="العودة للملف"
            variant="ghost"
            fullWidth
            onPress={() => {
              router.replace('/(tabs)/profile' as never);
            }}
          />
        </Stack>
      </ScreenBody>
    </Screen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1 },
    wrap: { justifyContent: 'center' },
    iconWrap: {
      width: 88,
      height: 88,
      borderRadius: 44,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: `${colors.rose}22`,
    },
  });
}
