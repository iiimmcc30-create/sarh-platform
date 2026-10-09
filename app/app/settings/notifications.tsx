import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { AppText, SarhButton, SarhSettingsRow, SarhSettingsSection } from '@/design-system/components';
import { Screen, ScreenBody } from '@/design-system/layout';
import { alertMessage } from '@/lib/actionSheet';
import {
  NOTIFICATION_PREF_COPY,
  NOTIFICATION_PREF_KEYS,
  fetchNotificationSettings,
  updateNotificationSettings,
  type NotificationPrefKey,
  type NotificationSettings,
} from '@/services/userSettings';

/** Settings → الإشعارات: master switch + one switch per notification type. */
export default function NotificationSettingsScreen() {
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await fetchNotificationSettings();
    setSettings(data);
    setFailed(!data);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const save = async (patch: Partial<Record<NotificationPrefKey, boolean>> & { notificationsEnabled?: boolean }) => {
    if (!settings) return;
    const previous = settings;
    setSettings({
      notificationsEnabled: patch.notificationsEnabled ?? settings.notificationsEnabled,
      prefs: { ...settings.prefs, ...patch },
    });
    const result = await updateNotificationSettings(patch);
    if (!result.settings) {
      setSettings(previous);
      await alertMessage('تعذّر الحفظ', result.message ?? 'تحقق من الاتصال وحاول مجدداً');
      return;
    }
    setSettings(result.settings);
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader variant="screen" title="الإشعارات" showBack />
      <ScreenBody gutter={false} padBottom="xxxl">
        {loading && !settings ? (
          <View style={styles.center}>
            <ActivityIndicator />
          </View>
        ) : failed || !settings ? (
          <View style={styles.center}>
            <AppText variant="body" color="textMuted" align="center">
              تعذّر تحميل إعدادات الإشعارات
            </AppText>
            <SarhButton title="إعادة المحاولة" variant="secondary" onPress={() => void load()} />
          </View>
        ) : (
          <>
            <SarhSettingsSection
              grouped
              footer="عند الإيقاف لن تصلك أي إشعارات فورية. تبقى الإشعارات داخل التطبيق."
            >
              <SarhSettingsRow
                testID="notif-master"
                icon="notifications-outline"
                title="الإشعارات الفورية"
                switchValue={settings.notificationsEnabled}
                onSwitchChange={(next) => void save({ notificationsEnabled: next })}
                showDivider={false}
              />
            </SarhSettingsSection>
            <SarhSettingsSection
              grouped
              title="أنواع الإشعارات"
              footer="إشعارات الحساب والمدفوعات والأمان تصلك دائماً."
            >
              {NOTIFICATION_PREF_KEYS.map((key, index) => (
                <SarhSettingsRow
                  key={key}
                  testID={`notif-${key}`}
                  icon={NOTIFICATION_PREF_COPY[key].icon}
                  title={NOTIFICATION_PREF_COPY[key].label}
                  subtitle={NOTIFICATION_PREF_COPY[key].hint}
                  switchValue={settings.prefs[key]}
                  disabled={!settings.notificationsEnabled}
                  onSwitchChange={(next) => void save({ [key]: next })}
                  showDivider={index < NOTIFICATION_PREF_KEYS.length - 1}
                />
              ))}
            </SarhSettingsSection>
          </>
        )}
      </ScreenBody>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { paddingTop: 64, paddingHorizontal: 24, gap: 16, alignItems: 'center' },
});
