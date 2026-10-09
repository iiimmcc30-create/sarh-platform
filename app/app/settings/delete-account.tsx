import { useState } from 'react';
import { useRouter } from 'expo-router';
import { SettingsScreen } from '@/components/settings/SettingsScreen';
import { SettingsActionRow, SettingsGroup } from '@/components/settings/SettingsRows';
import { SarhSettingsRow } from '@/design-system/components';
import { useAuth } from '@/contexts/AuthContext';
import { alertMessage } from '@/lib/actionSheet';
import { presentConfirm } from '@/lib/confirmDialog';
import { safePush } from '@/lib/safeNavigate';
import { deleteAccount } from '@/services/users';

const WHAT_HAPPENS = [
  { icon: 'eye-off-outline', title: 'إلغاء تفعيل الحساب', subtitle: 'لن يظهر حسابك لأحد ولن تتمكن من الدخول به' },
  { icon: 'trash-outline', title: 'حذف المحتوى', subtitle: 'تُزال بياناتك وإعلاناتك ومنشوراتك' },
  { icon: 'information-circle-outline', title: 'لا يمكن التراجع', subtitle: 'الحذف نهائي ولا يمكن استرجاع الحساب' },
];

/**
 * Inner page for account deletion: what happens, a data copy first, an
 * explicit «أفهم» checkmark, then the destructive confirm.
 */
export default function DeleteAccountScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [deleting, setDeleting] = useState(false);
  const [understood, setUnderstood] = useState(false);

  const handleDelete = async () => {
    const ok = await presentConfirm({
      title: 'حذف الحساب نهائياً؟',
      message: 'لا يمكن التراجع عن هذا الإجراء.',
      confirmLabel: 'حذف حسابي',
      destructive: true,
    });
    if (!ok) return;
    setDeleting(true);
    const result = await deleteAccount(user?.id ?? '');
    if (!result.ok) {
      setDeleting(false);
      await alertMessage('تعذّر حذف الحساب', result.message ?? 'حاول مجدداً لاحقاً');
      return;
    }
    await signOut();
    router.replace('/auth/phone' as never);
  };

  return (
    <SettingsScreen title="حذف الحساب">
      <SettingsGroup title="ماذا يحدث عند الحذف">
        {WHAT_HAPPENS.map((line, i) => (
          <SarhSettingsRow
            key={line.title}
            icon={line.icon}
            title={line.title}
            subtitle={line.subtitle}
            showDivider={i < WHAT_HAPPENS.length - 1}
          />
        ))}
      </SettingsGroup>
      <SettingsGroup footer="ننصحك بحفظ نسخة من بياناتك قبل الحذف.">
        <SarhSettingsRow
          icon="download-outline"
          title="تحميل بياناتي أولاً"
          showDivider={false}
          onPress={() => safePush('/settings/export', undefined, router)}
        />
      </SettingsGroup>
      <SettingsGroup footer="سيُطلب منك التأكيد مرة أخرى قبل الحذف.">
        <SarhSettingsRow
          testID="delete-understood"
          title="أفهم أن الحذف نهائي"
          subtitle="ولا يمكن استرجاع الحساب أو محتواه بعده"
          checked={understood}
          onPress={() => setUnderstood((v) => !v)}
        />
        <SettingsActionRow
          testID="delete-account-confirm"
          title="حذف حسابي نهائياً"
          tone="danger"
          disabled={!understood}
          loading={deleting}
          onPress={() => void handleDelete()}
        />
      </SettingsGroup>
    </SettingsScreen>
  );
}
