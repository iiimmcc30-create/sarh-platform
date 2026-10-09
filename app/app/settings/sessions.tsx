import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { SettingsScreen } from '@/components/settings/SettingsScreen';
import { SettingsGroup, SettingsStatus } from '@/components/settings/SettingsRows';
import { SarhSettingsRow } from '@/design-system/components';
import { safePush } from '@/lib/safeNavigate';
import { fetchSessions, type ConnectedSession } from '@/services/userSettings';
import { formatArabicDate } from '@/services/verification';

const PLATFORM_ICON: Record<ConnectedSession['platform'], string> = {
  ios: 'phone-portrait-outline',
  android: 'phone-portrait-outline',
  web: 'globe-outline',
  unknown: 'phone-portrait-outline',
};

/** «الأجهزة المتصلة»: where the account is signed in (read-only). */
export default function SessionsScreen() {
  const router = useRouter();
  const [sessions, setSessions] = useState<ConnectedSession[] | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setSessions(await fetchSessions());
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <SettingsScreen title="الأجهزة المتصلة" largeTitle>
      {loading && !sessions ? (
        <SettingsStatus state="loading" />
      ) : !sessions ? (
        <SettingsStatus
          state="error"
          icon="phone-portrait-outline"
          message="تعذّر تحميل الأجهزة"
          onRetry={() => void load()}
        />
      ) : (
        <>
          <SettingsGroup
            title={sessions.length ? `أماكن تسجيل الدخول · ${sessions.length}` : 'أماكن تسجيل الدخول'}
            footer="إذا رأيت جهازاً لا تعرفه، غيّر كلمة المرور فوراً. تغييرها يُخرج حسابك من كل الأجهزة، ثم تدخل من جديد بكلمة المرور الجديدة."
          >
            {sessions.length === 0 ? (
              <SarhSettingsRow title="لا توجد أجهزة نشطة" showDivider={false} />
            ) : (
              sessions.map((s, i) => (
                <SarhSettingsRow
                  key={s.id}
                  icon={PLATFORM_ICON[s.platform]}
                  title={s.label}
                  subtitle={[`منذ ${formatArabicDate(s.signedInAt)}`, s.ip].filter(Boolean).join(' · ')}
                  showDivider={i < sessions.length - 1}
                />
              ))
            )}
          </SettingsGroup>
          <SettingsGroup>
            <SarhSettingsRow
              icon="lock-outline"
              title="تغيير كلمة المرور"
              showDivider={false}
              onPress={() => safePush('/profile/settings/password', undefined, router)}
            />
          </SettingsGroup>
        </>
      )}
    </SettingsScreen>
  );
}
