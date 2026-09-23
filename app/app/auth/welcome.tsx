import { LinearGradient } from '@/components/ui/AppLinearGradient';
import { SarhLogoMark } from '@/components/ui/SarhLogoMark';
import { AppText, SarhButton } from '@/design-system/components';
import { Screen, ScreenBody, Stack } from '@/design-system/layout';
import { useAuthCopy } from '@/hooks/useAuthCopy';
import { useTheme } from '@/hooks/useTheme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { type ThemeColors } from '@/constants/theme';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

const WELCOME_GREETING = 'أهلاً وسهلاً بك في';
const WELCOME_TAGLINE =
  'المنصة الوطنية الرائدة في خدمات الثروة الحيوانية في المملكة';

export default function AuthWelcomeScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { copy } = useAuthCopy();
  const styles = useThemedStyles(({ colors: c }) => createStyles(c));

  return (
    <Screen edges={['top', 'bottom']} pattern={false} style={styles.root}>
      <LinearGradient
        colors={[colors.bgDeep, colors.bgPrimary, colors.bgDeep]}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={[`${colors.electric}18`, 'transparent']}
        style={styles.glow}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.55 }}
      />
      <ScreenBody scroll={false} padTop="xxl" padBottom="xl" style={styles.body}>
        <Stack gap="md" align="center" style={styles.hero}>
          <SarhLogoMark size={72} color={colors.textPrimary} />
          <AppText variant="display" align="center">
            {WELCOME_GREETING}
          </AppText>
          <AppText variant="body" color="textMuted" align="center" style={styles.tagline}>
            {WELCOME_TAGLINE}
          </AppText>
        </Stack>

        <Stack gap="md">
          <SarhButton title={copy.startCta} fullWidth onPress={() => router.push('/auth/register')} />
          <SarhButton
            title={copy.haveAccount}
            variant="secondary"
            fullWidth
            onPress={() => router.push('/auth/phone')}
          />
        </Stack>
      </ScreenBody>
    </Screen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: { backgroundColor: colors.bgDeep },
    glow: {
      position: 'absolute',
      top: 0,
      start: 0,
      end: 0,
      height: 280,
    },
    body: {
      justifyContent: 'space-between',
    },
    hero: {
      flex: 1,
      justifyContent: 'center',
    },
    tagline: {
      maxWidth: 320,
    },
  });
}
