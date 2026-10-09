import { SettingsScreen, useSettingsSave, useUnsavedChangesGuard } from '@/components/settings/SettingsScreen';
import { SettingsActionRow, SettingsFieldRow, SettingsGroup } from '@/components/settings/SettingsRows';
import { useAuth } from '@/contexts/AuthContext';
import { alertMessage } from '@/lib/actionSheet';
import { showToast } from '@/lib/toast';
import { changeAccountPhone } from '@/services/users';
import { useState } from 'react';
import { SarhSettingsRow } from '@/design-system/components';

const COUNTRY_CODE = '+966';

/**
 * «تغيير رقم الجوال»: two steps behind one top-left action —
 * «إرسال» sends the code to the new number, «تأكيد» verifies it and saves.
 */
export default function ChangePhoneScreen() {
  const { user, sendOtp, verifyOtp, refreshSession } = useAuth();
  const [phoneDigits, setPhoneDigits] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [sending, setSending] = useState(false);

  const fullPhone = `${COUNTRY_CODE}${phoneDigits.replace(/^0/, '').replace(/\D/g, '')}`;
  const isPhoneValid = phoneDigits.replace(/\D/g, '').length >= 9;

  const allowLeave = useUnsavedChangesGuard(phoneDigits.length > 0 || step === 'otp');
  const { saving, save } = useSettingsSave(allowLeave);

  const handleSendOtp = async () => {
    if (!isPhoneValid) {
      await alertMessage('رقم الجوال', 'أدخل رقماً صالحاً (9 أرقام على الأقل)');
      return;
    }
    setSending(true);
    const result = await sendOtp(fullPhone, 'sms');
    setSending(false);
    if (!result.success) {
      await alertMessage('تعذّر الإرسال', result.error ?? 'حاول مجدداً');
      return;
    }
    setStep('otp');
    void showToast(result.devMode ? 'وضع التطوير: أي رمز يعمل' : 'أرسلنا رمز التحقق إلى جوالك', 'success');
  };

  const handleVerifyAndSave = () =>
    void save(
      async () => {
        if (code.trim().length < 4) {
          await alertMessage('رمز التحقق', 'أدخل الرمز المرسل');
          return false;
        }
        const verified = await verifyOtp(fullPhone, code.trim(), 'reset_password');
        if (!verified.success || !verified.phoneToken) {
          await alertMessage('رمز غير صحيح', verified.error ?? 'تحقق من الرمز وحاول مجدداً');
          return false;
        }
        const phoneResult = await changeAccountPhone(fullPhone, verified.phoneToken);
        if (!phoneResult.account) {
          await alertMessage('تعذّر التحديث', phoneResult.message ?? 'قد يكون الرقم مستخدماً في حساب آخر');
          return false;
        }
        void refreshSession();
        return true;
      },
      { successMessage: 'تم تغيير رقم الجوال بنجاح' },
    );

  const action =
    step === 'phone'
      ? { label: 'إرسال', enabled: isPhoneValid, saving: sending, onPress: () => void handleSendOtp() }
      : { label: 'تأكيد', enabled: code.trim().length >= 4, saving, onPress: handleVerifyAndSave };

  return (
    <SettingsScreen title="تغيير رقم الجوال" keyboard width="form" save={action}>
      {user?.phone ? (
        <SettingsGroup title="الرقم الحالي">
          <SarhSettingsRow icon="call-outline" title="رقم الجوال" value={user.phone} valueLtr showDivider={false} />
        </SettingsGroup>
      ) : null}

      {step === 'phone' ? (
        <SettingsGroup title="الرقم الجديد" footer="سنرسل رمز تحقق إلى الرقم الجديد للتأكد أنه لك.">
          <SettingsFieldRow
            testID="phone-new"
            prefix={COUNTRY_CODE}
            value={phoneDigits}
            onChangeText={setPhoneDigits}
            placeholder="5XXXXXXXX"
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            autoFocus
            returnKeyType="done"
            onSubmitEditing={() => (isPhoneValid ? void handleSendOtp() : undefined)}
            ltr
          />
        </SettingsGroup>
      ) : (
        <>
          <SettingsGroup title="رمز التحقق" footer={`أدخل الرمز المرسل إلى ${fullPhone}`}>
            <SettingsFieldRow
              testID="phone-code"
              value={code}
              onChangeText={setCode}
              placeholder="••••••"
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="sms-otp"
              maxLength={6}
              autoFocus
              ltr
            />
          </SettingsGroup>
          <SettingsGroup>
            <SettingsActionRow
              title="إعادة إرسال الرمز"
              loading={sending}
              onPress={() => void handleSendOtp()}
              showDivider
            />
            <SettingsActionRow
              title="تغيير الرقم"
              onPress={() => {
                setStep('phone');
                setCode('');
              }}
            />
          </SettingsGroup>
        </>
      )}
    </SettingsScreen>
  );
}
