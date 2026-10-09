import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { AppText, SarhButton, SarhSettingsRow, SarhSettingsSection } from '@/design-system/components';
import { Screen, ScreenBody } from '@/design-system/layout';
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
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader variant="screen" title="الأجهزة المتصلة" showBack />
      <ScreenBody gutter={false} padBottom="xxxl">
        {loading && !sessions ? (
          <View style={styles.center}>
            <ActivityIndicator />
          </View>
        ) : !sessions ? (
          <View style={styles.center}>
            <AppText variant="body" color="textMuted" align="center">
              تعذّر تحميل الأجهزة
            </AppText>
            <SarhButton title="إعادة المحاولة" variant="secondary" onPress={() => void load()} />
          </View>
        ) : (
          <SarhSettingsSection
            grouped
            title="أماكن تسجيل الدخول"
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
          </SarhSettingsSection>
        )}
      </ScreenBody>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { paddingTop: 64, paddingHorizontal: 24, gap: 16, alignItems: 'center' },
});
