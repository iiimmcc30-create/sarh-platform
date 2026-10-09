import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { SettingsPeopleList } from '@/components/settings/SettingsPeopleList';
import { SettingsScreen } from '@/components/settings/SettingsScreen';
import { alertMessage } from '@/lib/actionSheet';
import { showToast } from '@/lib/toast';
import { fetchMutedUsers, setMuteUser, type MutedUser } from '@/services/userSettings';

/** «الحسابات المكتومة»: grouped list, «إلغاء الكتم» applies instantly (no «حفظ»). */
export default function MutedUsersScreen() {
  const [users, setUsers] = useState<MutedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const data = await fetchMutedUsers();
    setUsers(data ?? []);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const handleUnmute = async (id: string) => {
    setActionId(id);
    const result = await setMuteUser(id, false);
    setActionId(null);
    if (!result.ok) {
      await alertMessage('تعذّر إلغاء الكتم', result.message ?? 'حاول مجدداً');
      return;
    }
    setUsers((prev) => prev.filter((u) => u.id !== id));
    void showToast('تم إلغاء الكتم', 'success');
  };

  return (
    <SettingsScreen title="الحسابات المكتومة">
      <SettingsPeopleList
        users={users}
        loading={loading}
        actionId={actionId}
        actionLabel="إلغاء الكتم"
        onAction={(id) => void handleUnmute(id)}
        title={users.length ? `${users.length} حساب` : undefined}
        footer="لن تظهر منشورات وقصص الحسابات المكتومة في خلاصتك. الكتم صامت: لا يعرف الحساب أنك كتمته، ويبقى بإمكانه مراسلتك."
        emptyIcon="volume-mute-outline"
        emptyText="لا توجد حسابات مكتومة"
      />
    </SettingsScreen>
  );
}
