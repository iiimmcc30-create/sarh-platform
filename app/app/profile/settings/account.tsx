import { SettingsScreen, useSettingsSave, useUnsavedChangesGuard } from '@/components/settings/SettingsScreen';
import { SettingsFieldRow, SettingsGroup, SettingsStatus } from '@/components/settings/SettingsRows';
import { useAuth } from '@/contexts/AuthContext';
import { alertMessage } from '@/lib/actionSheet';
import { safePush } from '@/lib/safeNavigate';
import {
  fetchAccountSettings,
  updateAccountSettings,
  type AccountSettings,
} from '@/services/users';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { SarhSettingsRow } from '@/design-system/components';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BIRTH_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Digits typed as 19950423 → 1995-04-23 (dashes added as you type). */
function formatBirthInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

/**
 * «معلومات الحساب»: phone (opens the OTP flow), email and birth date.
 * One «حفظ» at the top-left saves whatever changed.
 */
export default function AccountInfoScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [account, setAccount] = useState<AccountSettings | null>(null);
  const [email, setEmail] = useState('');
  const [birthDate, setBirthDate] = useState('');

  const load = useCallback(async () => {
    const data =
      (await fetchAccountSettings()) ?? {
        phone: user?.phone ?? null,
        email: user?.email ?? null,
        birthDate: null,
      };
    setAccount(data);
    setEmail(data.email ?? '');
    setBirthDate(data.birthDate ?? '');
    setLoading(false);
  }, [user?.email, user?.phone]);

  useEffect(() => {
    void load();
  }, [load]);

  const emailChanged = !!account && email.trim() !== (account.email ?? '');
  const birthChanged = !!account && birthDate.trim() !== (account.birthDate ?? '');
  const dirty = emailChanged || birthChanged;

  const allowLeave = useUnsavedChangesGuard(dirty);
  const { saving, save } = useSettingsSave(allowLeave);

  const onSave = () =>
    void save(async () => {
      const nextEmail = email.trim();
      const nextBirth = birthDate.trim();
      if (emailChanged && nextEmail && !EMAIL_RE.test(nextEmail)) {
        await alertMessage('البريد الإلكتروني', 'أدخل بريداً إلكترونياً صالحاً');
        return false;
      }
      if (birthChanged && nextBirth && !BIRTH_RE.test(nextBirth)) {
        await alertMessage('تاريخ الميلاد', 'استخدم الصيغة YYYY-MM-DD');
        return false;
      }
      const patch: Parameters<typeof updateAccountSettings>[0] = {};
      if (emailChanged) patch.email = nextEmail || null;
      if (birthChanged) patch.birthDate = nextBirth || null;
      const result = await updateAccountSettings(patch, user?.id);
      if (!result.account) {
        await alertMessage('تعذّر الحفظ', result.message ?? 'تحقق من الاتصال وحاول مجدداً');
        return false;
      }
      setAccount(result.account);
      setEmail(result.account.email ?? '');
      setBirthDate(result.account.birthDate ?? '');
      return true;
    });

  return (
    <SettingsScreen
      title="معلومات الحساب"
      keyboard
      width="form"
      save={{ enabled: dirty, saving, onPress: onSave }}
    >
      {loading && !account ? (
        <SettingsStatus state="loading" />
      ) : (
        <>
          <SettingsGroup
            title="رقم الجوال"
            footer="لتغيير رقم الجوال ستحتاج إلى التحقق برمز OTP المرسل إلى الرقم الجديد."
          >
            <SarhSettingsRow
              icon="call-outline"
              title="رقم الجوال"
              value={account?.phone ?? 'غير مضاف'}
              valueLtr={!!account?.phone}
              showDivider={false}
              onPress={() => safePush('/profile/settings/change-phone', undefined, router)}
            />
          </SettingsGroup>

          <SettingsGroup title="البريد الإلكتروني" footer="اترك الحقل فارغاً لإزالة البريد من حسابك.">
            <SettingsFieldRow
              testID="account-email"
              value={email}
              onChangeText={setEmail}
              placeholder="example@email.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="done"
              ltr
            />
          </SettingsGroup>

          <SettingsGroup title="تاريخ الميلاد" footer="سنة-شهر-يوم، مثل 1995-04-23.">
            <SettingsFieldRow
              testID="account-birthdate"
              value={birthDate}
              onChangeText={(text) => setBirthDate(formatBirthInput(text))}
              placeholder="YYYY-MM-DD"
              keyboardType="number-pad"
              maxLength={10}
              returnKeyType="done"
              ltr
            />
          </SettingsGroup>
        </>
      )}
    </SettingsScreen>
  );
}
