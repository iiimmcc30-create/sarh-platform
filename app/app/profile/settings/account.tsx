import { AppIcon } from '@/components/ui/FlaticonIcon';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/hooks/useTheme';
import { alertMessage, confirmDestructive } from '@/lib/actionSheet';
import {
  deleteAccount,
  fetchAccountSettings,
  updateAccountSettings,
  type AccountSettings,
} from '@/services/users';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { AppText, SarhButton, SarhDivider, SarhInput } from '@/design-system/components';
import { Row, Screen, ScreenBody, Section, Stack } from '@/design-system/layout';

/** Layout and writing direction only — theme colors are read at render. */
const styles = StyleSheet.create({
  centered: { alignItems: 'center', justifyContent: 'center' },
  fill: { flex: 1, minWidth: 0 },
  latin: { writingDirection: 'ltr' },
});

function formatPhone(phone: string | null | undefined) {
  if (!phone) return 'غير مضاف';
  return phone;
}

function formatBirthDate(value: string | null | undefined) {
  if (!value) return 'غير محدد';
  const [y, m, d] = value.split('-');
  if (!y || !m || !d) return value;
  return `${d}/${m}/${y}`;
}

export default function AccountInfoScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { colors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
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

  const saveEmail = async () => {
    const trimmed = email.trim();
    if (trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      await alertMessage('البريد الإلكتروني', 'أدخل بريداً إلكترونياً صالحاً');
      return;
    }
    setSaving(true);
    const result = await updateAccountSettings({
      email: trimmed || null,
    }, user?.id);
    setSaving(false);
    if (!result.account) {
      await alertMessage('تعذّر الحفظ', result.message ?? 'تحقق من الاتصال وحاول مجدداً');
      return;
    }
    setAccount(result.account);
    setEmail(result.account.email ?? '');
    await alertMessage('تم الحفظ', 'تم تحديث البريد الإلكتروني');
  };

  const saveBirthDate = async () => {
    const trimmed = birthDate.trim();
    if (trimmed && !/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      await alertMessage('تاريخ الميلاد', 'استخدم الصيغة YYYY-MM-DD');
      return;
    }
    setSaving(true);
    const result = await updateAccountSettings({
      birthDate: trimmed || null,
    }, user?.id);
    setSaving(false);
    if (!result.account) {
      await alertMessage('تعذّر الحفظ', result.message ?? 'تحقق من الاتصال وحاول مجدداً');
      return;
    }
    setAccount(result.account);
    setBirthDate(result.account.birthDate ?? '');
    await alertMessage('تم الحفظ', 'تم تحديث تاريخ الميلاد');
  };

  const handleDeleteAccount = async () => {
    const confirmed = await confirmDestructive(
      'حذف الحساب نهائياً',
      'سيتم حذف حسابك وبياناتك وإعلاناتك ومنشوراتك نهائياً. لا يمكن التراجع عن هذا الإجراء.',
      'حذف حسابي',
    );
    if (!confirmed) return;

    setDeleting(true);
    const result = await deleteAccount(user?.id ?? '');
    if (!result.ok) {
      setDeleting(false);
      await alertMessage('تعذّر حذف الحساب', result.message ?? 'حاول مجدداً لاحقاً');
      return;
    }

    await signOut();
    router.replace('/auth/phone' as any);
  };

  if (loading && !account) {
    return (
      <Screen edges={['top', 'bottom']}>
        <ScreenHeader variant="screen" title="معلومات الحساب" showBack />
        <ScreenBody scroll={false} style={styles.centered}>
          <ActivityIndicator size="large" />
        </ScreenBody>
      </Screen>
    );
  }

  return (
    <Screen edges={['top', 'bottom']} keyboard>
      <ScreenHeader variant="screen" title="معلومات الحساب" showBack />
      <ScreenBody padTop="lg" gap="section" width="form" padBottom="xxxl">
        <Section title="رقم الهاتف">
          <Row gap="sm" align="center" justify="between">
            <AppText variant="body" color="textSecondary" style={[styles.fill, styles.latin]}>
              {formatPhone(account?.phone)}
            </AppText>
            <SarhButton
              title="تغيير"
              variant="secondary"
              size="sm"
              onPress={() => router.push('/profile/settings/change-phone' as any)}
            />
          </Row>
        </Section>

        <SarhDivider />

        <Section title="البريد الإلكتروني" gap="md">
          <SarhInput
            appearance="theme"
            value={email}
            onChangeText={setEmail}
            placeholder="example@email.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            ltr
          />
          <SarhButton
            title="حفظ البريد"
            onPress={() => void saveEmail()}
            loading={saving}
            fullWidth
            leftIcon="mail-outline"
          />
        </Section>

        <SarhDivider />

        <Section title="تاريخ الميلاد" gap="md">
          <SarhInput
            appearance="theme"
            value={birthDate}
            onChangeText={setBirthDate}
            placeholder="YYYY-MM-DD"
            keyboardType="numbers-and-punctuation"
            ltr
          />
          {account?.birthDate ? (
            <AppText variant="caption" color="textMuted">
              المحفوظ: {formatBirthDate(account.birthDate)}
            </AppText>
          ) : null}
          <SarhButton
            title="حفظ تاريخ الميلاد"
            onPress={() => void saveBirthDate()}
            loading={saving}
            fullWidth
            leftIcon="calendar-outline"
          />
        </Section>

        <Row gap="sm" align="start">
          <AppIcon name="information-circle-outline" size={20} color={colors.textBrandStrong} />
          <AppText variant="caption" color="textMuted" style={styles.fill}>
            لتغيير رقم الجوال ستحتاج إلى التحقق برمز OTP المرسل إلى الرقم الجديد.
          </AppText>
        </Row>

        <SarhDivider />

        <Section title="حذف الحساب">
          <Stack gap="md">
            <AppText variant="bodySmall" color="textSecondary">
              عند حذف حسابك سيتم إلغاء تفعيله وإزالة بياناتك وإعلاناتك ومنشوراتك بشكل نهائي. لا
              يمكن التراجع عن هذا الإجراء.
            </AppText>
            <SarhButton
              title="حذف حسابي نهائياً"
              variant="danger"
              onPress={() => void handleDeleteAccount()}
              loading={deleting}
              fullWidth
              leftIcon="trash-outline"
              accessibilityLabel="حذف الحساب نهائياً"
            />
          </Stack>
        </Section>
      </ScreenBody>
    </Screen>
  );
}
