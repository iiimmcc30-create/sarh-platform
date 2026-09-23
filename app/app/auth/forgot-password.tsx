// SAFAT — Forgot Password via OTP (نسيت كلمة المرور)
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { AppLogo } from '@/components/ui/AppLogo';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { AppText, SarhButton, SarhInput, resolveAppTextStyle } from '@/design-system/components';
import { Row, Screen, ScreenBody, Stack } from '@/design-system/layout';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/hooks/useTheme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { ltrInputText } from '@/lib/rtl';
import { type ThemeColors } from '@/constants/theme';
import { motion } from '@/design-system';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

const COUNTRY_CODES = [
  { flag: '🇸🇦', code: '+966', label: 'السعودية' },
];

type Step = 'phone' | 'otp' | 'password' | 'done';
const AUTH_FORM_WIDTH = { maxWidth: 440, width: '100%', alignSelf: 'center' } as const;

export default function ForgotPasswordScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(({ colors: c }) => createStyles(c));
  const router = useRouter();
  const { sendOtp, verifyOtp, resetPassword } = useAuth();

  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [countryIdx, setCountryIdx] = useState(0);
  const [showPicker, setShowPicker] = useState(false);
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [phoneToken, setPhoneToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [devMode, setDevMode] = useState(false);

  const inputs = useRef<(TextInput | null)[]>([]);
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const otpDigitStyle = resolveAppTextStyle({
    variant: 'heading2',
    color: 'textPrimary',
    align: 'center',
  });

  const currentCountry = COUNTRY_CODES[countryIdx];
  const cleanPhoneDigits = phone.trim()
    .replace(/^\+/, '')
    .replace(new RegExp(`^(?:${currentCountry.code.replace('+', '')}|00${currentCountry.code.replace('+', '')})`), '')
    .replace(/^0/, '');
  const fullPhone = `${currentCountry.code}${cleanPhoneDigits}`;
  const isPhoneValid = cleanPhoneDigits.replace(/\D/g, '').length >= 9;

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: motion.duration.shake, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: motion.duration.shake, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: motion.duration.shake, useNativeDriver: true }),
    ]).start();
  };

  const handleSendOtp = async () => {
    setError('');
    if (!isPhoneValid) {
      setError('أدخل رقم جوال صحيح');
      shake();
      return;
    }

    setLoading(true);
    const result = await sendOtp(fullPhone, 'sms');
    setLoading(false);

    if (!result.success) {
      setError(result.error ?? 'فشل إرسال رمز التحقق');
      shake();
      return;
    }

    setDevMode(result.devMode ?? false);
    setStep('otp');
    setOtp(['', '', '', '', '', '']);
  };

  const handleVerifyOtp = async (code: string) => {
    if (loading) return;
    setError('');
    setLoading(true);

    const result = await verifyOtp(fullPhone, code, 'reset_password');
    setLoading(false);

    if (!result.success || !result.phoneToken) {
      setError(result.error ?? 'رمز التحقق غير صحيح');
      shake();
      return;
    }

    setPhoneToken(result.phoneToken);
    setStep('password');
  };

  const handleOtpChange = (text: string, idx: number) => {
    setError('');
    const digit = text.replace(/\D/g, '').slice(-1);
    const arr = [...otp];
    arr[idx] = digit;
    setOtp(arr);
    if (digit && idx < 5) inputs.current[idx + 1]?.focus();
    if (arr.every((d) => d) && arr.join('').length === 6) {
      handleVerifyOtp(arr.join(''));
    }
  };

  const handleResetPassword = async () => {
    setError('');
    if (newPassword.length < 6) {
      setError('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      shake();
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('كلمة المرور وتأكيدها غير متطابقين');
      shake();
      return;
    }

    setLoading(true);
    const result = await resetPassword(fullPhone, phoneToken, newPassword);
    setLoading(false);

    if (!result.success) {
      setError(result.error ?? 'فشل إعادة تعيين كلمة المرور');
      shake();
      return;
    }

    setStep('done');
  };

  const subtitle =
    step === 'phone'
      ? 'أدخل رقم جوالك المسجّل لإرسال رمز التحقق'
      : step === 'otp'
        ? 'أدخل رمز التحقق المرسل إلى جوالك'
        : step === 'password'
          ? 'اختر كلمة مرور جديدة لحسابك'
          : 'تم تحديث كلمة المرور بنجاح';

  return (
    <Screen edges={['top', 'bottom']} keyboard pattern={false} style={styles.root}>
      <ScreenHeader variant="screen" title="استعادة كلمة المرور" showBack />
      <ScreenBody padTop="lg" padBottom="xxxl" gap="section" contentContainerStyle={AUTH_FORM_WIDTH}>
        <Stack gap="sm" align="center">
          <AppLogo size={90} showRing={false} shape="square" />
          <AppText variant="bodySmall" color="textMuted" align="center">
            {subtitle}
          </AppText>
        </Stack>

        <Stack gap="md" style={styles.card}>
          {step === 'phone' ? (
            <Stack gap="sm">
              <AppText variant="label">رقم الجوال *</AppText>
              <Animated.View style={[styles.inputWrap, { transform: [{ translateX: shakeAnim }] }]}>
                <Row gap="xs" align="center">
                  <Pressable
                    style={styles.countryBtn}
                    onPress={() => setShowPicker((v) => !v)}
                    accessibilityRole="button"
                    accessibilityLabel="اختيار رمز الدولة"
                  >
                    <Row gap="xs" align="center">
                      <AppIcon name={showPicker ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textMuted} />
                      <AppText variant="label">{currentCountry.code}</AppText>
                      <AppText variant="body">{currentCountry.flag}</AppText>
                    </Row>
                  </Pressable>
                  <View style={styles.inputDivider} />
                  <TextInput
                    style={[styles.phoneInput, ltrInputText]}
                    value={phone}
                    onChangeText={(t) => { setPhone(t); setError(''); }}
                    placeholder="05xxxxxxxx"
                    placeholderTextColor={colors.textSubtle}
                    keyboardType="phone-pad"
                  />
                </Row>
              </Animated.View>

              {showPicker ? (
                <View style={styles.pickerDropdown}>
                  {COUNTRY_CODES.map((c, i) => (
                    <Pressable
                      key={c.code}
                      style={[styles.pickerItem, i === countryIdx && styles.pickerItemActive]}
                      onPress={() => { setCountryIdx(i); setShowPicker(false); }}
                    >
                      <Row justify="between" align="center" fill>
                        <AppText variant="body">{c.flag}</AppText>
                        <AppText variant="bodySmall" style={styles.pickerLabel}>{c.label}</AppText>
                        <AppText variant="bodySmall" color="textMuted">{c.code}</AppText>
                      </Row>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </Stack>
          ) : null}

          {step === 'otp' ? (
            <Stack gap="md" align="center">
              <AppText variant="bodySmall" color="textMuted" align="center">
                تم الإرسال إلى {fullPhone}
              </AppText>
              {devMode ? (
                <AppText variant="caption" color="warning" align="center">
                  وضع التطوير: استخدم 123456
                </AppText>
              ) : null}
              <Row justify="center" gap="sm">
                {otp.map((digit, idx) => (
                  <View key={idx} style={[styles.otpBox, digit ? styles.otpBoxFilled : null]}>
                    <TextInput
                      ref={(r) => { inputs.current[idx] = r; }}
                      style={[styles.otpInput, otpDigitStyle, ltrInputText]}
                      value={digit}
                      onChangeText={(t) => handleOtpChange(t, idx)}
                      keyboardType="number-pad"
                      maxLength={1}
                      autoFocus={idx === 0}
                    />
                  </View>
                ))}
              </Row>
              <Pressable onPress={handleSendOtp} disabled={loading}>
                <AppText variant="label" color="primary" align="center">
                  إعادة إرسال الرمز
                </AppText>
              </Pressable>
            </Stack>
          ) : null}

          {step === 'password' ? (
            <Stack gap="lg">
              <SarhInput
                label="كلمة المرور الجديدة *"
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="........"
                secureTextEntry={!showPassword}
                ltr
                trailingIcon={showPassword ? 'eye-off-outline' : 'eye-outline'}
                onTrailingPress={() => setShowPassword(!showPassword)}
                accessibilityLabel={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
              />
              <SarhInput
                label="تأكيد كلمة المرور *"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="........"
                secureTextEntry={!showPassword}
                ltr
              />
            </Stack>
          ) : null}

          {step === 'done' ? (
            <Stack gap="md" align="center" style={styles.doneWrap}>
              <AppIcon name="checkmark-circle" size={64} color={colors.success} />
              <AppText variant="bodySmall" color="textMuted" align="center">
                يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة
              </AppText>
            </Stack>
          ) : null}

          {error ? (
            <Row gap="xs" align="center" style={styles.errorContainer}>
              <AppIcon name="alert-circle-outline" size={15} color={colors.danger} />
              <AppText variant="caption" color="danger" style={styles.errorText}>
                {error}
              </AppText>
            </Row>
          ) : null}

          {step !== 'done' ? (
            <SarhButton
              title={
                step === 'phone'
                  ? 'إرسال رمز التحقق'
                  : step === 'otp'
                    ? 'تحقق من الرمز'
                    : 'حفظ كلمة المرور'
              }
              fullWidth
              loading={loading}
              onPress={
                step === 'phone'
                  ? handleSendOtp
                  : step === 'otp'
                    ? () => handleVerifyOtp(otp.join(''))
                    : handleResetPassword
              }
            />
          ) : (
            <SarhButton
              title="تسجيل الدخول"
              fullWidth
              onPress={() => router.replace('/auth/phone')}
            />
          )}
        </Stack>
      </ScreenBody>
    </Screen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: { backgroundColor: colors.screenRoot },
    card: {
      width: '100%',
      borderRadius: 20,
      padding: 20,
      backgroundColor: colors.bgSurface,
      borderWidth: 1,
      borderColor: colors.borderHairline,
    },
    inputWrap: {
      backgroundColor: colors.bgDeep,
      borderRadius: 12,
      borderWidth: 1.2,
      borderColor: colors.borderHairline,
      paddingHorizontal: 12,
      height: 50,
      justifyContent: 'center',
    },
    countryBtn: {},
    inputDivider: {
      width: 1,
      height: 20,
      backgroundColor: colors.borderHairline,
    },
    phoneInput: {
      flex: 1,
      color: colors.textPrimary,
    },
    pickerDropdown: {
      backgroundColor: colors.bgDeep,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.borderHairline,
      overflow: 'hidden',
    },
    pickerItem: {
      paddingHorizontal: 12,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: `${colors.textPrimary}08`,
    },
    pickerItemActive: { backgroundColor: `${colors.electric}1A` },
    pickerLabel: { flex: 1 },
    otpBox: {
      width: 42,
      height: 50,
      borderRadius: 12,
      backgroundColor: colors.bgDeep,
      borderWidth: 1.5,
      borderColor: colors.borderHairline,
      alignItems: 'center',
      justifyContent: 'center',
    },
    otpBoxFilled: {
      borderColor: colors.electric,
      backgroundColor: `${colors.electric}1A`,
    },
    otpInput: {
      width: '100%',
      height: '100%',
    },
    errorContainer: {
      backgroundColor: `${colors.danger}1A`,
      padding: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: `${colors.danger}33`,
    },
    errorText: { flex: 1 },
    doneWrap: { paddingVertical: 16 },
  });
}
