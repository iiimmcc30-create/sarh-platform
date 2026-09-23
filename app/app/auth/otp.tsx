// Powered by OnSpace.AI
// SAFAT — OTP Verification Screen (شاشة التحقق من رمز OTP)
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { LinearGradient } from '@/components/ui/AppLinearGradient';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { AppText, SarhButton, resolveAppTextStyle } from '@/design-system/components';
import { Row, Screen, ScreenBody, Stack } from '@/design-system/layout';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/hooks/useTheme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { ltrInputText } from '@/lib/rtl';
import { type ThemeColors } from '@/constants/theme';
import { motion } from '@/design-system';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

function formatDisplayPhone(phone: string): string {
  return phone.replace(/^(\+966)(\d)(\d{3})(\d{3})(\d{3})$/, '+966 $2$3 $4 $5');
}

const OTP_LENGTH = 6;
const AUTH_FORM_WIDTH = { maxWidth: 440, width: '100%', alignSelf: 'center' } as const;

export default function OtpScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(({ colors: c }) => createStyles(c));
  const router = useRouter();
  const params = useLocalSearchParams<{
    phone: string;
    requestId: string;
    expiresIn: string;
    channel: 'sms' | 'whatsapp';
  }>();

  const { verifyOtp, sendOtp } = useAuth();

  const totalSeconds = parseInt(params.expiresIn ?? '120', 10);
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [countdown, setCountdown] = useState(totalSeconds);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);

  const inputs = useRef<(TextInput | null)[]>([]);
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const successScale = useRef(new Animated.Value(0)).current;
  const otpDigitStyle = resolveAppTextStyle({
    variant: 'heading2',
    color: 'textPrimary',
    align: 'center',
  });

  // ── Countdown timer ────────────────────────────────────────────────────────
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [countdown]);

  const minutes = String(Math.floor(countdown / 60)).padStart(2, '0');
  const seconds = String(countdown % 60).padStart(2, '0');

  // ── Auto-submit when all digits filled ────────────────────────────────────
  useEffect(() => {
    const code = otp.join('');
    if (code.length === OTP_LENGTH) handleVerify(code);
  }, [otp]);

  // ── Shake animation ────────────────────────────────────────────────────────
  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 12, duration: motion.duration.shake, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -12, duration: motion.duration.shake, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: motion.duration.shake, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: motion.duration.shake, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: motion.duration.shake, useNativeDriver: true }),
    ]).start();
  };

  // ── Success animation ──────────────────────────────────────────────────────
  const playSuccess = () => {
    setSuccess(true);
    Animated.spring(successScale, {
      toValue: 1,
      useNativeDriver: true,
      ...motion.spring.success,
    }).start();
  };

  // ── Handle digit input ─────────────────────────────────────────────────────
  const handleChange = (text: string, idx: number) => {
    setError('');
    if (text.length > 1) {
      const digits = text.replace(/\D/g, '').slice(0, OTP_LENGTH);
      const arr = [...otp];
      for (let i = 0; i < OTP_LENGTH; i++) arr[i] = digits[i] ?? '';
      setOtp(arr);
      inputs.current[OTP_LENGTH - 1]?.focus();
      return;
    }

    const digit = text.replace(/\D/g, '').slice(-1);
    const arr = [...otp];
    arr[idx] = digit;
    setOtp(arr);

    if (digit && idx < OTP_LENGTH - 1) inputs.current[idx + 1]?.focus();
  };

  const handleKeyPress = (key: string, idx: number) => {
    if (key === 'Backspace' && !otp[idx] && idx > 0) {
      const arr = [...otp];
      arr[idx - 1] = '';
      setOtp(arr);
      inputs.current[idx - 1]?.focus();
    }
  };

  // ── Verify OTP (عبر الباك اند) ────────────────────────────────────────────
  const handleVerify = async (code: string) => {
    if (loading) return;
    setError('');
    setLoading(true);

    const result = await verifyOtp(params.phone, code);

    if (!result.success) {
      setLoading(false);
      setError(result.error ?? 'رمز التحقق غير صحيح');
      shake();
      return;
    }

    playSuccess();

    setTimeout(() => {
      if (result.isNew) {
        router.push({
          pathname: '/auth/register',
          params: { phone: params.phone, token: result.phoneToken },
        });
      } else {
        router.replace('/(tabs)');
      }
    }, 1200);
  };

  // ── Resend Code ────────────────────────────────────────────────────────────
  const handleResend = async () => {
    setError('');
    setResendLoading(true);
    const result = await sendOtp(params.phone, params.channel);
    setResendLoading(false);

    if (!result.success) {
      setError(result.error ?? 'فشل إعادة إرسال الرمز');
      shake();
      return;
    }

    setCountdown(120);
    setOtp(['', '', '', '', '', '']);
    inputs.current[0]?.focus();
  };

  if (success) {
    return (
      <Screen edges={['top', 'bottom']} pattern={false} style={styles.root}>
        <Stack gap="lg" align="center" fill style={styles.successCenter}>
          <Animated.View style={[styles.successRing, { transform: [{ scale: successScale }] }]}>
            <LinearGradient colors={[colors.electric, colors.electricBright]} style={styles.successInner}>
              <AppIcon name="checkmark" size={52} color={colors.textPrimary} />
            </LinearGradient>
          </Animated.View>
          <AppText variant="display" align="center">تم التحقق بنجاح</AppText>
          <AppText variant="bodySmall" color="textMuted">جارٍ الدخول...</AppText>
        </Stack>
      </Screen>
    );
  }

  return (
    <Screen edges={['top', 'bottom']} keyboard pattern={false} style={styles.root}>
      <ScreenHeader variant="screen" title="رمز التحقق" showBack />
      <ScreenBody padTop="lg" padBottom="xxxl" gap="section" contentContainerStyle={AUTH_FORM_WIDTH}>
        <Stack gap="sm" align="center">
          <AppText variant="body" color="textMuted" align="center">
            أرسلنا رمزاً من {OTP_LENGTH} أرقام إلى
          </AppText>
          <AppText variant="label" align="center">
            {formatDisplayPhone(params.phone || '')}
          </AppText>
        </Stack>

        <Stack gap="md">
          <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
            <Row justify="center" gap="sm">
              {otp.map((digit, idx) => (
                <View
                  key={idx}
                  style={[
                    styles.otpBox,
                    digit ? styles.otpBoxFilled : null,
                    error ? styles.otpBoxError : null,
                  ]}
                >
                  <TextInput
                    ref={(r) => { inputs.current[idx] = r; }}
                    style={[styles.otpInput, otpDigitStyle, ltrInputText]}
                    value={digit}
                    onChangeText={(t) => handleChange(t, idx)}
                    onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, idx)}
                    keyboardType="number-pad"
                    maxLength={1}
                    selectTextOnFocus
                    autoFocus={idx === 0}
                    caretHidden
                  />
                </View>
              ))}
            </Row>
          </Animated.View>

          {error ? (
            <Row gap="xs" align="center" style={styles.errorContainer}>
              <AppIcon name="alert-circle-outline" size={15} color={colors.danger} />
              <AppText variant="caption" color="danger" style={styles.errorText}>
                {error}
              </AppText>
            </Row>
          ) : null}

          {loading ? (
            <ActivityIndicator size="small" color={colors.electricBright} />
          ) : null}

          <Row justify="center" gap="sm">
            {countdown > 0 ? (
              <>
                <AppText variant="bodySmall" color="textMuted">ينتهي الرمز خلال</AppText>
                <View style={styles.countdownBadge}>
                  <AppText variant="caption" color="warning">{minutes}:{seconds}</AppText>
                </View>
              </>
            ) : (
              <Pressable onPress={handleResend} disabled={resendLoading}>
                <Row gap="xs" align="center">
                  <AppIcon name="refresh" size={15} color={colors.electricBright} />
                  <AppText variant="label" color="primary">
                    {resendLoading ? 'جارٍ الإرسال...' : 'إعادة إرسال الرمز'}
                  </AppText>
                </Row>
              </Pressable>
            )}
          </Row>

          <SarhButton
            title="تأكيد"
            fullWidth
            loading={loading}
            disabled={otp.join('').length < OTP_LENGTH}
            onPress={() => handleVerify(otp.join(''))}
          />
        </Stack>
      </ScreenBody>
    </Screen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: { backgroundColor: colors.screenRoot },
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
      backgroundColor: `${colors.electric}18`,
    },
    otpBoxError: {
      borderColor: colors.danger,
      backgroundColor: `${colors.danger}1A`,
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
      width: '100%',
    },
    errorText: { flex: 1 },
    countdownBadge: {
      backgroundColor: colors.bgDeep,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: colors.borderHairline,
    },
    successCenter: { justifyContent: 'center' },
    successRing: {
      width: 120,
      height: 120,
      borderRadius: 60,
      shadowColor: colors.electricBright,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.8,
      shadowRadius: 30,
      elevation: 16,
    },
    successInner: {
      width: 120,
      height: 120,
      borderRadius: 60,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
