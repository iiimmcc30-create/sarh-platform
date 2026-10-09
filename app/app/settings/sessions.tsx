import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { SessionDeviceCard } from '@/components/settings/SessionDeviceCard';
import { SettingsScreen } from '@/components/settings/SettingsScreen';
import { SettingsActionRow, SettingsGroup, SettingsHero, SettingsStatus } from '@/components/settings/SettingsRows';
import { useAuth } from '@/contexts/AuthContext';
import { SarhSettingsRow } from '@/design-system/components';
import { alertMessage, confirmDestructive } from '@/lib/actionSheet';
import { safePush } from '@/lib/safeNavigate';
import {
  fetchSessionsDetailed,
  revokeOtherSessions,
  revokeSession,
  type ConnectedSession,
} from '@/services/userSettings';

/**
 * «الأجهزة المتصلة»: one card per signed-in device (this device first), with
 * last activity and a per-device sign-out, plus «تسجيل الخروج من جميع الأجهزة الأخرى».
 */
export default function SessionsScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const [sessions, setSessions] = useState<ConnectedSession[] | null>(null);
  const [canRevoke, setCanRevoke] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await fetchSessionsDetailed();
    setSessions(result ? sortSessions(result.sessions) : null);
    setCanRevoke(!!result?.canRevoke);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const signOutHere = async () => {
    const ok = await confirmDestructive(
      'تسجيل الخروج',
      'سيتم تسجيل خروجك من هذا الجهاز.',
      'تسجيل الخروج',
    );
    if (!ok) return;
    await signOut();
    router.replace('/auth/phone' as never);
  };

  const signOutDevice = async (session: ConnectedSession) => {
    const ok = await confirmDestructive(
      'تسجيل خروج الجهاز',
      `سيُطلب من «${session.label}» تسجيل الدخول من جديد.`,
      'تسجيل الخروج',
    );
    if (!ok) return;
    setBusyId(session.id);
    const result = await revokeSession(session.id);
    setBusyId(null);
    if (!result.ok) {
      await alertMessage('تعذّر تسجيل الخروج', result.message ?? 'حاول مجدداً');
      return;
    }
    setSessions((prev) => prev?.filter((s) => s.id !== session.id) ?? prev);
  };

  const signOutOthers = async () => {
    const ok = await confirmDestructive(
      'تسجيل الخروج من الأجهزة الأخرى',
      'ستبقى مسجّلاً في هذا الجهاز فقط، وسيُطلب من بقية الأجهزة تسجيل الدخول من جديد.',
      'تسجيل الخروج',
    );
    if (!ok) return;
    setBusyId('others');
    const result = await revokeOtherSessions();
    setBusyId(null);
    if (!result.ok) {
      await alertMessage('تعذّر تسجيل الخروج', result.message ?? 'حاول مجدداً');
      return;
    }
    setSessions((prev) => prev?.filter((s) => s.current) ?? prev);
  };

  const current = sessions?.filter((s) => s.current) ?? [];
  const others = sessions?.filter((s) => !s.current) ?? [];

  return (
    <SettingsScreen title="الأجهزة المتصلة">
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
          {sessions.length === 0 ? (
            <SettingsHero
              icon="phone-portrait-outline"
              title="لا توجد أجهزة أخرى"
              body="حسابك غير مسجّل في أي جهاز آخر."
            />
          ) : null}

          {current.map((s) => (
            <SessionDeviceCard key={s.id} session={s} groupTitle="هذا الجهاز" onSignOut={() => void signOutHere()} />
          ))}

          {others.map((s, index) => (
            <SessionDeviceCard
              key={s.id}
              session={s}
              groupTitle={index === 0 ? `أجهزة أخرى · ${others.length}` : undefined}
              groupFooter={
                index === others.length - 1
                  ? 'إذا رأيت جهازاً لا تعرفه، سجّل خروجه ثم غيّر كلمة المرور.'
                  : undefined
              }
              busy={busyId === s.id}
              onSignOut={canRevoke ? () => void signOutDevice(s) : undefined}
            />
          ))}

          {canRevoke && others.length > 0 ? (
            <SettingsGroup>
              <SettingsActionRow
                testID="sessions-revoke-others"
                title="تسجيل الخروج من جميع الأجهزة الأخرى"
                tone="danger"
                loading={busyId === 'others'}
                onPress={() => void signOutOthers()}
              />
            </SettingsGroup>
          ) : null}

          <SettingsGroup footer="تغيير كلمة المرور يُخرج حسابك من كل الأجهزة، ثم تدخل من جديد بكلمة المرور الجديدة.">
            <SarhSettingsRow
              icon="lock-outline"
              iconTile
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

function sortSessions(list: ConnectedSession[]): ConnectedSession[] {
  return [...list].sort((a, b) => {
    if (a.current !== b.current) return a.current ? -1 : 1;
    const at = Date.parse(a.lastActiveAt ?? a.signedInAt) || 0;
    const bt = Date.parse(b.lastActiveAt ?? b.signedInAt) || 0;
    return bt - at;
  });
}
