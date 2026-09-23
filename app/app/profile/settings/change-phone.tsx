import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/hooks/useTheme';
import { alertMessage } from '@/lib/actionSheet';
import { changeAccountPhone } from '@/services/users';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { AppText, SarhButton, SarhInput } from '@/design-system/components';
import { Screen, ScreenBody, Stack } from '@/design-system/layout';

const COUNTRY_CODE = '+966';

export default function ChangePhoneScreen() {
  const router = useRouter();
  const { sendOtp, verifyOtp, refreshSession } = useAuth();
  // Subscribe so the hint text re-resolves its color after a scheme switch.
  useTheme();
  const [phoneDigits, setPhoneDigits] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [loading, setLoading] = useState(false);

  const fullPhone = `${COUNTRY_CODE}${phoneDigits.replace(/^0/, '').replace(/\D/g, '')}`;
  const isPhoneValid = phoneDigits.replace(/\D/g, '').length >= 9;

  const handleSendOtp = async () => {
    if (!isPhoneValid) {
      await alertMessage('رقم الجوال', 'أدخل رقماً صالحاً (9 أرقام على الأقل)');
      return;
    }
    setLoading(true);
    const result = await sendOtp(fullPhone, 'sms');
    setLoading(false);
    if (!result.success) {
      await alertMessage('تعذّر الإرسال', result.error ?? 'حاول مجدداً');
      return;
    }
    setStep('otp');
    await alertMessage(
      'تم الإرسال',
      result.devMode ? 'وضع التطوير: أي رمز يعمل' : 'أدخل الرمز المرسل إلى جوالك',
    );
  };

  const handleVerifyAndSave = async () => {
    if (code.trim().length < 4) {
      await alertMessage('رمز التحقق', 'أدخل الرمز المرسل');
      return;
    }
    setLoading(true);
    const verified = await verifyOtp(fullPhone, code.trim(), 'reset_password');
    if (!verified.success || !verified.phoneToken) {
      setLoading(false);
      await alertMessage('رمز غير صحيح', verified.error ?? 'تحقق من الرمز وحاول مجدداً');
      return;
    }
    const phoneResult = await changeAccountPhone(fullPhone, verified.phoneToken);
    setLoading(false);
    if (!phoneResult.account) {
      await alertMessage('تعذّر التحديث', phoneResult.message ?? 'قد يكون الرقم مستخدماً في حساب آخر');
      return;
    }
    await alertMessage('تم التحديث', 'تم تغيير رقم الجوال بنجاح');
    void refreshSession();
    router.back();
  };

  return (
    <Screen edges={['top', 'bottom']} keyboard>
      <ScreenHeader variant="screen" title="تغيير رقم الجوال" showBack />
      <ScreenBody padTop="lg" gap="section" width="form" padBottom="xxxl">
        <AppText variant="bodySmall" color="textSecondary">
          {step === 'phone'
            ? 'أدخل رقم الجوال الجديد. سنرسل إليه رمز تحقق.'
            : `أدخل الرمز المرسل إلى ${fullPhone}`}
        </AppText>

        {step === 'phone' ? (
          <Stack gap="lg">
            <SarhInput
              appearance="theme"
              label={`رقم الجوال (${COUNTRY_CODE})`}
              value={phoneDigits}
              onChangeText={setPhoneDigits}
              placeholder="5XXXXXXXX"
              keyboardType="phone-pad"
              ltr
            />
            <SarhButton
              title="إرسال رمز التحقق"
              onPress={() => void handleSendOtp()}
              loading={loading}
              fullWidth
              leftIcon="phone-portrait-outline"
            />
          </Stack>
        ) : (
          <Stack gap="lg">
            <SarhInput
              appearance="theme"
              label="رمز التحقق"
              value={code}
              onChangeText={setCode}
              placeholder="••••••"
              keyboardType="number-pad"
              maxLength={6}
              ltr
            />
            <SarhButton
              title="تأكيد وتغيير الرقم"
              onPress={() => void handleVerifyAndSave()}
              loading={loading}
              fullWidth
              leftIcon="checkmark-done-outline"
            />
            <SarhButton
              title="تغيير الرقم"
              onPress={() => {
                setStep('phone');
                setCode('');
              }}
              variant="secondary"
              fullWidth
            />
          </Stack>
        )}
      </ScreenBody>
    </Screen>
  );
}
