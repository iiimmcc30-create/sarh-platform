import { AppLogo } from '@/components/ui/AppLogo';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { useAuth } from '@/contexts/AuthContext';
import { AppText, SarhButton, SarhInput } from '@/design-system/components';
import { Row, Screen, ScreenBody, Stack } from '@/design-system/layout';
import { useAuthCopy } from '@/hooks/useAuthCopy';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { type ThemeColors } from '@/constants/theme';
import { motion, radius, space } from '@/design-system';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, View } from 'react-native';

const SAUDI_DIAL = '+966';
const AUTH_FORM_WIDTH = { maxWidth: 440, width: '100%', alignSelf: 'center' } as const;
/** Entrance lift in pt — small enough to read as "settling", not sliding. */
const ENTER_OFFSET = 16;

/**
 * Login (production auth entry, `AUTH_ENTRY_HREF`).
 *
 * Black & white identity: the Sarh mark alone carries the brand — no wordmark
 * text on this screen. Primary CTA is the theme primary pill (black in light,
 * white in dark), secondary is the bordered pill. Presentation only: the auth
 * call, validation and navigation targets are unchanged.
 */
export default function PhoneLoginScreen() {
  const styles = useThemedStyles(({ colors: c }) => createStyles(c));
  const router = useRouter();
  const { signInWithPassword } = useAuth();
  const { copy } = useAuthCopy();
  const canGoBack = router.canGoBack();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const enterAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduce) => {
        if (cancelled) return;
        if (reduce) {
          enterAnim.setValue(1);
          return;
        }
        Animated.timing(enterAnim, {
          toValue: 1,
          duration: motion.duration.slow,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start();
      });
    return () => {
      cancelled = true;
    };
  }, [enterAnim]);

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

  const enterStyle = {
    opacity: enterAnim,
    transform: [
      {
        translateY: enterAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [ENTER_OFFSET, 0],
        }),
      },
    ],
  };

  return (
    <Screen edges={['top', 'bottom']} keyboard pattern={false}>
      {canGoBack ? <ScreenHeader variant="screen" title="" showBack /> : null}
      <ScreenBody
        padTop={canGoBack ? 'lg' : 'xxxl'}
        padBottom="xl"
        contentContainerStyle={[AUTH_FORM_WIDTH, styles.content]}
        testID="login-screen"
      >
        <Animated.View style={[styles.column, enterStyle]}>
          <Stack gap="xxl">
            {/* Hero — the mark only; the brand name is intentionally not written here. */}
            <Stack gap="lg" align="center">
              <AppLogo size={72} showRing={false} shape="square" />
              <Stack gap="xs" align="center">
                <AppText variant="display" align="center" accessibilityRole="header">
                  {copy.loginHeadline}
                </AppText>
                <AppText variant="body" color="textSecondary" align="center">
                  {copy.loginSubtitle}
                </AppText>
              </Stack>
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
                  textContentType="telephoneNumber"
                  leadingIcon="call"
                  ltr
                />

                <Stack gap="sm">
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
                    textContentType="password"
                    leadingIcon="lock-outline"
                    ltr
                    trailingIcon={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    onTrailingPress={() => setShowPassword((v) => !v)}
                    accessibilityLabel={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                  />

                  <Pressable
                    onPress={() => router.push('/auth/forgot-password')}
                    accessibilityRole="link"
                    accessibilityLabel={copy.forgotPassword}
                    hitSlop={space[8]}
                    style={({ pressed }) => [styles.forgot, pressed && styles.pressed]}
                  >
                    <AppText variant="bodySmall" color="textSecondary">
                      {copy.forgotPassword}
                    </AppText>
                  </Pressable>
                </Stack>

                {error ? (
                  <View
                    style={styles.errorBox}
                    accessibilityRole="alert"
                    accessibilityLiveRegion="polite"
                  >
                    <AppText variant="bodySmall" color="danger">
                      {error}
                    </AppText>
                  </View>
                ) : null}
              </Stack>
            </Animated.View>

            <Stack gap="lg">
              <SarhButton
                title={copy.loginCta}
                shape="pill"
                fullWidth
                loading={loading}
                disabled={!isPhoneValid || password.length < 6}
                onPress={handleLogin}
              />

              <Row gap="md">
                <View style={styles.rule} />
                <AppText variant="caption" color="textMuted">
                  {copy.noAccount}
                </AppText>
                <View style={styles.rule} />
              </Row>

              <SarhButton
                title={copy.createAccountLink}
                variant="secondary"
                shape="pill"
                fullWidth
                onPress={() => router.push('/auth/register')}
              />
            </Stack>
          </Stack>

          <AppText variant="caption" color="textMuted" align="center" style={styles.legal}>
            {copy.legalPrefix}
            <AppText
              variant="caption"
              color="textSecondary"
              accessibilityRole="link"
              onPress={() => router.push('/info/terms')}
              style={styles.legalLink}
            >
              {copy.legalTerms}
            </AppText>
            {copy.legalAnd}
            <AppText
              variant="caption"
              color="textSecondary"
              accessibilityRole="link"
              onPress={() => router.push('/info/privacy')}
              style={styles.legalLink}
            >
              {copy.legalPrivacy}
            </AppText>
          </AppText>
        </Animated.View>
      </ScreenBody>
    </Screen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    /** Lets the legal line sit at the bottom on tall screens; scrolls on short ones. */
    content: { flexGrow: 1 },
    column: {
      flexGrow: 1,
      justifyContent: 'space-between',
      gap: space[32],
    },
    forgot: {
      alignSelf: 'flex-end',
      paddingVertical: space[4],
    },
    pressed: { opacity: motion.opacity.pressed },
    errorBox: {
      borderRadius: radius[12],
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.danger,
      paddingHorizontal: space[12],
      paddingVertical: space[8],
    },
    rule: {
      flex: 1,
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.borderSoft,
    },
    legal: { paddingHorizontal: space[8] },
    legalLink: { textDecorationLine: 'underline' },
  });
}
