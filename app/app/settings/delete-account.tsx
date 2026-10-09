import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { SarhButton, SarhSettingsRow, SarhSettingsSection } from '@/design-system/components';
import { Screen, ScreenBody } from '@/design-system/layout';
import { useAuth } from '@/contexts/AuthContext';
import { alertMessage } from '@/lib/actionSheet';
import { presentConfirm } from '@/lib/confirmDialog';
import { safePush } from '@/lib/safeNavigate';
import { deleteAccount } from '@/services/users';

const WHAT_HAPPENS = [
  { title: 'إلغاء تفعيل الحساب', subtitle: 'لن يظهر حسابك لأحد ولن تتمكن من الدخول به' },
  { title: 'حذف المحتوى', subtitle: 'تُزال بياناتك وإعلاناتك ومنشوراتك' },
  { title: 'لا يمكن التراجع', subtitle: 'الحذف نهائي ولا يمكن استرجاع الحساب' },
];

/** Inner page for account deletion: what happens, a data copy first, then confirm. */
export default function DeleteAccountScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [deleting, setDeleting] = useState(false);

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
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader variant="screen" title="حذف الحساب" showBack />
      <ScreenBody gutter={false} padBottom="xxxl">
        <SarhSettingsSection grouped title="ماذا يحدث عند الحذف">
          {WHAT_HAPPENS.map((line, i) => (
            <SarhSettingsRow
              key={line.title}
              icon="information-circle-outline"
              title={line.title}
              subtitle={line.subtitle}
              showDivider={i < WHAT_HAPPENS.length - 1}
            />
          ))}
        </SarhSettingsSection>
        <SarhSettingsSection grouped footer="ننصحك بحفظ نسخة من بياناتك قبل الحذف.">
          <SarhSettingsRow
            icon="download-outline"
            title="تحميل بياناتي أولاً"
            showDivider={false}
            onPress={() => safePush('/settings/export', undefined, router)}
          />
        </SarhSettingsSection>
        <View style={styles.actions}>
          <SarhButton
            title="حذف حسابي نهائياً"
            variant="danger"
            onPress={() => void handleDelete()}
            loading={deleting}
            fullWidth
            leftIcon="trash-outline"
            accessibilityLabel="حذف الحساب نهائياً"
          />
        </View>
      </ScreenBody>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { paddingHorizontal: 16, paddingTop: 28, gap: 10 },
});
