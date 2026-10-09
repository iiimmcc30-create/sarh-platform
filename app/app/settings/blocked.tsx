import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { SettingsPeopleList } from '@/components/settings/SettingsPeopleList';
import { SettingsScreen } from '@/components/settings/SettingsScreen';
import { confirmDestructive, alertMessage } from '@/lib/actionSheet';
import { showToast } from '@/lib/toast';
import { fetchBlockedUsers, setBlockUser, type BlockedUser } from '@/services/users';

/** «الحسابات المحظورة»: grouped list, «إلغاء الحظر» asks first (instant, no «حفظ»). */
export default function BlockedUsersScreen() {
  const [users, setUsers] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const data = await fetchBlockedUsers();
    setUsers(data);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const handleUnblock = async (id: string) => {
    const user = users.find((u) => u.id === id);
    if (!user) return;
    const confirmed = await confirmDestructive(
      'إلغاء الحظر',
      `هل تريد إلغاء حظر ${user.arabicName || user.displayName}؟`,
      'إلغاء الحظر',
    );
    if (!confirmed) return;

    setActionId(user.id);
    const result = await setBlockUser(user.id, false);
    setActionId(null);
    if (!result.ok) {
      await alertMessage('تعذّر إلغاء الحظر', result.message, 'close-circle-outline');
      return;
    }
    setUsers((prev) => prev.filter((u) => u.id !== user.id));
    void showToast('تم إلغاء الحظر', 'success');
  };

  return (
    <SettingsScreen title="الحسابات المحظورة" largeTitle>
      <SettingsPeopleList
        users={users}
        loading={loading}
        actionId={actionId}
        actionLabel="إلغاء الحظر"
        onAction={(id) => void handleUnblock(id)}
        title={users.length ? `${users.length} حساب` : undefined}
        footer="الحسابات المحظورة لن تظهر منشوراتها وإعلاناتها في خلاصتك، ولا يمكنها التواصل معك."
        emptyIcon="block"
        emptyText="لا يوجد حسابات محظورة"
      />
    </SettingsScreen>
  );
}
