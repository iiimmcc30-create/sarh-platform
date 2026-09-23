import { LinearGradient } from '@/components/ui/AppLinearGradient';
import { AppLogo } from '@/components/ui/AppLogo';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { useAuth } from '@/contexts/AuthContext';
import { AppText, SarhButton, SarhInput } from '@/design-system/components';
import { Row, Screen, ScreenBody, Stack } from '@/design-system/layout';
import { useAuthCopy } from '@/hooks/useAuthCopy';
import { useTheme } from '@/hooks/useTheme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { interpretOtpVerifyResult } from '@/lib/otpVerifyOutcome';
import { updateAccountSettings } from '@/services/users';
import { BRAND_TERMS_SHORT_AR } from '@/constants/brandCopy';
import { type ThemeColors } from '@/constants/theme';
import { motion } from '@/design-system';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  UIManager,
  View,
} from 'react-native';

const SAUDI_DIAL = '+966';
type Step = 'phone' | 'name' | 'identity' | 'password' | 'otp';

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
const DOB_RE = /^\d{4}-\d{2}-\d{2}$/;
const AUTH_FORM_WIDTH = { maxWidth: 440, width: '100%', alignSelf: 'center' } as const;

if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function animateStepChange() {
  LayoutAnimation.configureNext(
    LayoutAnimation.create(motion.duration.ui, 'easeInEaseOut', 'opacity'),
  );
}

export default function RegisterScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(({ colors: c }) => createStyles(c));
  const router = useRouter();
  const params = useLocalSearchParams<{ phone?: string; token?: string }>();
  const { sendOtp, verifyOtp, register, checkSignup } = useAuth();
  const { copy } = useAuthCopy();

  const initialStep: Step =
    params.phone && params.token ? 'name' : 'phone';

  const [step, setStep] = useState<Step>(initialStep);
  const [phone, setPhone] = useState(
    params.phone?.replace(/^\+\d{3}/, '') || '',
  );
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [usernameError, setUsernameError] = useState('');

  const cleanPhoneDigits = phone
    .trim()
    .replace(/\D/g, '')
    .replace(/^0/, '');
  const fullPhone = `${SAUDI_DIAL}${cleanPhoneDigits}`;
  const isPhoneValid =
    cleanPhoneDigits.length >= 9 && cleanPhoneDigits.startsWith('5');
  const usernameOk = USERNAME_RE.test(username.trim().toLowerCase());
  const dobOk = !birthDate.trim() || DOB_RE.test(birthDate.trim());

  const stepIndex = useMemo(() => {
    const order: Step[] = ['phone', 'name', 'identity', 'password', 'otp'];
    return order.indexOf(step);
  }, [step]);

  const goTo = (next: Step) => {
    animateStepChange();
    setError('');
    setStep(next);
  };

  const goBack = () => {
    if (step === 'otp') {
      goTo('password');
      return;
    }
    if (step === 'password') {
      goTo('identity');
      return;
    }
    if (step === 'identity') {
      goTo('name');
      return;
    }
    if (step === 'name') {
      goTo('phone');
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace('/auth/welcome');
  };

  const advanceFromPhone = async () => {
    setPhoneError('');
    setError('');
    if (!isPhoneValid) {
      setPhoneError(copy.errPhone);
      return;
    }
    setLoading(true);
    const check = await checkSignup({ phone: fullPhone });
    setLoading(false);
    if (!check.success) {
      setPhoneError(
        check.code === 'phone_taken' || check.error?.includes('مسجل')
          ? copy.errPhoneTaken
          : (check.error ?? copy.errGeneric),
      );
      return;
    }
    goTo('name');
  };

  const advanceFromName = () => {
    if (displayName.trim().length < 2) {
      setError(copy.errName);
      return;
    }
    goTo('identity');
  };

  const advanceFromIdentity = async () => {
    setUsernameError('');
    setError('');
    if (!usernameOk) {
      setUsernameError(copy.errUsername);
      return;
    }
    if (!dobOk) {
      setError(copy.errDob);
      return;
    }
    setLoading(true);
    const check = await checkSignup({
      username: username.trim().toLowerCase(),
    });
    setLoading(false);
    if (!check.success) {
      setUsernameError(
        check.code === 'username_taken' || check.error?.includes('مستخدم')
          ? copy.errUsernameTaken
          : (check.error ?? copy.errGeneric),
      );
      return;
    }
    goTo('password');
  };

  const startRegister = async () => {
    setError('');
    if (password.length < 6) {
      setError(copy.errPassword);
      return;
    }
    if (password !== confirmPassword) {
      setError(copy.errPasswordMatch);
      return;
    }
    if (!agreed) {
      setError(copy.errTerms);
      return;
    }

    setLoading(true);
    // Re-check uniqueness before OTP (race + defense in depth).
    const availability = await checkSignup({
      phone: fullPhone,
      username: username.trim().toLowerCase(),
    });
    if (!availability.success) {
      setLoading(false);
      if (availability.code === 'phone_taken') {
        setPhoneError(copy.errPhoneTaken);
        goTo('phone');
        return;
      }
      if (availability.code === 'username_taken') {
        setUsernameError(copy.errUsernameTaken);
        goTo('identity');
        return;
      }
      setError(availability.error ?? copy.errGeneric);
      return;
    }

    const result = await sendOtp(fullPhone, 'sms', 'signup');
    setLoading(false);
    if (!result.success) {
      if (result.code === 'phone_taken') {
        setPhoneError(copy.errPhoneTaken);
        goTo('phone');
        return;
      }
      setError(result.error ?? copy.errGeneric);
      return;
    }
    goTo('otp');
  };

  const verifyAndCreate = async () => {
    setError('');
    if (otpCode.length !== 6) {
      setError(copy.errOtp);
      return;
    }
    setLoading(true);
    const verified = await verifyOtp(fullPhone, otpCode, 'signup');
    const otpFlow = interpretOtpVerifyResult(verified);
    if (otpFlow.kind === 'invalid' || otpFlow.kind === 'missing_phone_token') {
      setLoading(false);
      if (verified.code === 'phone_taken') {
        setPhoneError(copy.errPhoneTaken);
        goTo('phone');
        return;
      }
      setError(otpFlow.error);
      return;
    }
    // Signup must never fall through into an existing-account login.
    if (otpFlow.kind === 'existing_login') {
      setLoading(false);
      setPhoneError(copy.errPhoneTaken);
      goTo('phone');
      return;
    }

    const regResult = await register({
      phone: fullPhone,
      phone_token: otpFlow.phoneToken,
      displayName: displayName.trim(),
      arabicName: displayName.trim(),
      username: username.trim().toLowerCase(),
      country: 'SA',
      password,
    });

    if (!regResult.success) {
      setLoading(false);
      if (regResult.code === 'phone_taken') {
        setPhoneError(copy.errPhoneTaken);
        goTo('phone');
        return;
      }
      if (
        regResult.code === 'username_taken' ||
        regResult.error?.includes('مستخدم') ||
        regResult.error?.includes('username')
      ) {
        setUsernameError(copy.errUsernameTaken);
        goTo('identity');
        return;
      }
      setError(regResult.error ?? copy.errGeneric);
      return;
    }

    const dob = birthDate.trim();
    if (dob && DOB_RE.test(dob)) {
      void updateAccountSettings({ birthDate: dob });
    }

    setLoading(false);
  };

  const titleForStep =
    step === 'phone'
      ? copy.stepPhoneTitle
      : step === 'name'
        ? copy.stepNameTitle
        : step === 'identity'
          ? copy.stepUsernameTitle
          : step === 'password'
            ? copy.stepPasswordTitle
            : copy.otpTitle;

  const usernameHintColor =
    username.length === 0 ? undefined : usernameOk ? 'success' : 'danger';

  return (
    <Screen edges={['top', 'bottom']} keyboard pattern={false} style={styles.root}>
      <LinearGradient
        colors={[colors.bgDeep, colors.bgPrimary, colors.bgDeep]}
        style={StyleSheet.absoluteFill}
      />
      <ScreenHeader variant="screen" title={titleForStep} showBack onBackPress={goBack} />
      <ScreenBody
        padTop="lg"
        padBottom="xxxl"
        gap="section"
        contentContainerStyle={AUTH_FORM_WIDTH}
      >
        <Row justify="center" gap="xs">
          {(['phone', 'name', 'identity', 'password'] as Step[]).map((s, i) => (
            <View
              key={s}
              style={[styles.dot, i <= Math.min(stepIndex, 3) && styles.dotActive]}
            />
          ))}
        </Row>

        <Stack gap="sm" align="center">
          <AppLogo size={56} showRing={false} shape="square" />
        </Stack>

        <Stack gap="lg">
          {step === 'otp' ? (
            <AppText variant="body" color="textMuted">
              {copy.otpSubtitle}
            </AppText>
          ) : null}

          {step === 'phone' ? (
            <Stack gap="lg">
              <SarhInput
                value={phone}
                onChangeText={(t) => {
                  setPhone(t.replace(/[^\d\s]/g, ''));
                  setPhoneError('');
                  setError('');
                }}
                placeholder={copy.phonePlaceholder}
                keyboardType="phone-pad"
                maxLength={10}
                autoFocus
                ltr
                errorText={phoneError || undefined}
              />
              <SarhButton
                title={copy.continueCta}
                fullWidth
                loading={loading}
                disabled={!isPhoneValid || loading}
                onPress={() => void advanceFromPhone()}
              />
            </Stack>
          ) : null}

          {step === 'name' ? (
            <Stack gap="lg">
              <SarhInput
                value={displayName}
                onChangeText={(t) => {
                  setDisplayName(t);
                  setError('');
                }}
                placeholder={copy.namePlaceholder}
                maxLength={45}
                autoFocus
              />
              <SarhButton
                title={copy.continueCta}
                fullWidth
                disabled={displayName.trim().length < 2}
                onPress={advanceFromName}
              />
            </Stack>
          ) : null}

          {step === 'identity' ? (
            <Stack gap="lg">
              <SarhInput
                value={username}
                onChangeText={(t) => {
                  setUsername(t.toLowerCase().replace(/[^a-z0-9_]/g, ''));
                  setUsernameError('');
                  setError('');
                }}
                placeholder={copy.usernamePlaceholder}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={20}
                autoFocus
                ltr
                errorText={usernameError || undefined}
                leadingIcon={
                  <AppText variant="body" color="textMuted">
                    @
                  </AppText>
                }
              />
              {!usernameError ? (
                <AppText variant="caption" color={usernameHintColor ?? 'textMuted'}>
                  {username.length === 0
                    ? copy.usernameHint
                    : usernameOk
                      ? copy.usernameFormatOk
                      : copy.usernameFormatBad}
                </AppText>
              ) : null}

              <SarhInput
                label={copy.stepDobTitle}
                value={birthDate}
                onChangeText={(t) => {
                  setBirthDate(t.replace(/[^\d-]/g, ''));
                  setError('');
                }}
                placeholder={copy.dobPlaceholder}
                keyboardType="numbers-and-punctuation"
                maxLength={10}
                ltr
              />

              <SarhButton
                title={copy.continueCta}
                fullWidth
                loading={loading}
                disabled={!usernameOk || !dobOk || loading}
                onPress={() => void advanceFromIdentity()}
              />
            </Stack>
          ) : null}

          {step === 'password' ? (
            <Stack gap="lg">
              <SarhInput
                value={password}
                onChangeText={(t) => {
                  setPassword(t);
                  setError('');
                }}
                placeholder={copy.passwordPlaceholder}
                secureTextEntry={!showPassword}
                autoFocus
                ltr
                trailingIcon={showPassword ? 'eye-off-outline' : 'eye-outline'}
                onTrailingPress={() => setShowPassword((v) => !v)}
                accessibilityLabel={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
              />

              <SarhInput
                label={copy.stepConfirmPasswordTitle}
                value={confirmPassword}
                onChangeText={(t) => {
                  setConfirmPassword(t);
                  setError('');
                }}
                placeholder={copy.confirmPasswordPlaceholder}
                secureTextEntry={!showConfirm}
                ltr
                trailingIcon={showConfirm ? 'eye-off-outline' : 'eye-outline'}
                onTrailingPress={() => setShowConfirm((v) => !v)}
                accessibilityLabel={showConfirm ? 'إخفاء تأكيد كلمة المرور' : 'إظهار تأكيد كلمة المرور'}
              />

              <Pressable
                onPress={() => setAgreed((v) => !v)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: agreed }}
                accessibilityLabel="الموافقة على الشروط والأحكام وسياسة الخصوصية"
              >
                <Row gap="sm" align="center">
                  <View style={[styles.check, agreed && styles.checkOn]}>
                    {agreed ? (
                      <AppIcon name="checkmark" size={14} color={colors.textPrimary} />
                    ) : null}
                  </View>
                  <AppText variant="caption" color="textSecondary" style={styles.termsText}>
                    {copy.termsAgree}
                    {' · '}
                    {BRAND_TERMS_SHORT_AR}
                  </AppText>
                </Row>
              </Pressable>

              <SarhButton
                title={copy.registerCta}
                fullWidth
                loading={loading}
                disabled={password.length < 6 || password !== confirmPassword || !agreed}
                onPress={startRegister}
              />
            </Stack>
          ) : null}

          {step === 'otp' ? (
            <Stack gap="lg">
              <SarhInput
                value={otpCode}
                onChangeText={(t) => {
                  setOtpCode(t.replace(/\D/g, '').slice(0, 6));
                  setError('');
                }}
                placeholder="••••••"
                keyboardType="number-pad"
                maxLength={6}
                autoFocus
                ltr
              />
              <SarhButton
                title={copy.otpConfirm}
                fullWidth
                loading={loading}
                disabled={otpCode.length !== 6}
                onPress={verifyAndCreate}
              />
              <Pressable onPress={() => goTo('password')} style={styles.editLink}>
                <AppText variant="label" color="textMuted" align="center">
                  {copy.otpEdit}
                </AppText>
              </Pressable>
            </Stack>
          ) : null}

          {error ? (
            <AppText variant="caption" color="danger">
              {error}
            </AppText>
          ) : null}
        </Stack>
      </ScreenBody>
    </Screen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: { backgroundColor: colors.bgDeep },
    dot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: colors.borderMid,
    },
    dotActive: { backgroundColor: colors.electric, width: 18 },
    check: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: colors.borderMid,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkOn: {
      backgroundColor: colors.electric,
      borderColor: colors.electric,
    },
    termsText: { flex: 1 },
    editLink: { alignItems: 'center', padding: 8 },
  });
}
