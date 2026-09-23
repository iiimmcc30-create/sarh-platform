import { LinearGradient } from '@/components/ui/AppLinearGradient';
import { AppLogo } from '@/components/ui/AppLogo';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { useAuth } from '@/contexts/AuthContext';
import { AppText, SarhButton, SarhInput } from '@/design-system/components';
import { Screen, ScreenBody, Stack } from '@/design-system/layout';
import { useAuthCopy } from '@/hooks/useAuthCopy';
import { useTheme } from '@/hooks/useTheme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { type ThemeColors } from '@/constants/theme';
import { motion } from '@/design-system';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';

const SAUDI_DIAL = '+966';
const AUTH_FORM_WIDTH = { maxWidth: 440, width: '100%', alignSelf: 'center' } as const;

export default function PhoneLoginScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(({ colors: c }) => createStyles(c));
  const router = useRouter();
  const { signInWithPassword } = useAuth();
  const { copy } = useAuthCopy();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const shakeAnim = useRef(new Animated.Value(0)).current;

  const cleanPhoneDigits = phone.trim().replace(/\D/g, '').replace(/^0/, '');
  const fullPhone = `${SAUDI_DIAL}${cleanPhoneDigits}`;
  const isPhoneValid =
    cleanPhoneDigits.length >= 9 && cleanPhoneDigits.startsWith('5');

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 8, duration: motion.duration.shake, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: motion.duration.shake, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 5, duration: motion.duration.shake, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: motion.duration.shake, useNativeDriver: true }),
    ]).start();
  };

  const handleLogin = async () => {
    setError('');
    if (!isPhoneValid) {
      setError(copy.errPhone);
      shake();
      return;
    }
    if (password.length < 6) {
      setError(copy.errPassword);
      shake();
      return;
    }
    setLoading(true);
    const result = await signInWithPassword(fullPhone, password);
    setLoading(false);
    if (!result.success) {
      setError(result.error ?? copy.errGeneric);
      shake();
      return;
    }
    router.replace('/(tabs)');
  };

  return (
    <Screen edges={['top', 'bottom']} keyboard pattern={false} style={styles.root}>
      <LinearGradient
        colors={[colors.bgDeep, colors.bgPrimary, colors.bgDeep]}
        style={StyleSheet.absoluteFill}
      />
      <ScreenHeader variant="screen" title={copy.loginTitle} showBack onBackPress={() => router.replace('/auth/welcome')} />
      <ScreenBody
        padTop="lg"
        padBottom="xxxl"
        gap="section"
        contentContainerStyle={AUTH_FORM_WIDTH}
      >
        <Stack gap="sm" align="center">
          <AppLogo size={72} showRing={false} shape="square" />
          <AppText variant="heading3">{copy.brandName}</AppText>
        </Stack>

        <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
          <Stack gap="lg">
            <SarhInput
              label={copy.phoneLabel}
              value={phone}
              onChangeText={(t) => {
                setPhone(t.replace(/[^\d\s]/g, ''));
                setError('');
              }}
              placeholder={copy.phonePlaceholder}
              keyboardType="phone-pad"
              maxLength={10}
              autoComplete="tel"
              ltr
            />

            <SarhInput
              label={copy.passwordLabel}
              value={password}
              onChangeText={(t) => {
                setPassword(t);
                setError('');
              }}
              placeholder={copy.passwordPlaceholder}
              secureTextEntry={!showPassword}
              autoComplete="password"
              ltr
              trailingIcon={showPassword ? 'eye-off-outline' : 'eye-outline'}
              onTrailingPress={() => setShowPassword((v) => !v)}
              accessibilityLabel={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
            />

            <Pressable
              onPress={() => router.push('/auth/forgot-password')}
              style={styles.forgot}
            >
              <AppText variant="label" color="primary">
                {copy.forgotPassword}
              </AppText>
            </Pressable>

            {error ? (
              <AppText variant="caption" color="danger">
                {error}
              </AppText>
            ) : null}

            <SarhButton
              title={copy.loginCta}
              fullWidth
              loading={loading}
              disabled={!isPhoneValid || password.length < 6}
              onPress={handleLogin}
            />

            <Pressable
              onPress={() => router.push('/auth/register')}
              style={styles.footerLink}
            >
              <AppText variant="label" color="textMuted" align="center">
                {copy.createAccountLink}
              </AppText>
            </Pressable>
          </Stack>
        </Animated.View>
      </ScreenBody>
    </Screen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: { backgroundColor: colors.bgDeep },
    forgot: { alignSelf: 'flex-start' },
    footerLink: {
      alignItems: 'center',
      paddingVertical: 8,
    },
  });
}
