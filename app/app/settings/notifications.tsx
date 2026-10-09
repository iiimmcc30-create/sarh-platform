import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { SettingsScreen } from '@/components/settings/SettingsScreen';
import { SettingsGroup, SettingsStatus } from '@/components/settings/SettingsRows';
import { SarhSettingsRow } from '@/design-system/components';
import { alertMessage } from '@/lib/actionSheet';
import {
  NOTIFICATION_PREF_COPY,
  NOTIFICATION_PREF_KEYS,
  fetchNotificationSettings,
  updateNotificationSettings,
  type NotificationPrefKey,
  type NotificationSettings,
} from '@/services/userSettings';

/**
 * Settings → الإشعارات: master switch + one switch per notification type.
 * Toggles auto-save (optimistic, rolled back on failure) — no «حفظ» button.
 */
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

  const allOn = settings ? NOTIFICATION_PREF_KEYS.every((key) => settings.prefs[key]) : false;

  return (
    <SettingsScreen title="الإشعارات" largeTitle>
      {loading && !settings ? (
        <SettingsStatus state="loading" />
      ) : failed || !settings ? (
        <SettingsStatus
          state="error"
          icon="notifications-outline"
          message="تعذّر تحميل إعدادات الإشعارات"
          onRetry={() => void load()}
        />
      ) : (
        <>
          <SettingsGroup footer="عند الإيقاف لن تصلك أي إشعارات فورية. تبقى الإشعارات داخل التطبيق.">
            <SarhSettingsRow
              testID="notif-master"
              icon="notifications-outline"
              title="الإشعارات الفورية"
              subtitle={settings.notificationsEnabled ? (allOn ? 'كل الأنواع مفعّلة' : 'مفعّلة لأنواع مختارة') : 'متوقفة'}
              switchValue={settings.notificationsEnabled}
              onSwitchChange={(next) => void save({ notificationsEnabled: next })}
              showDivider={false}
            />
          </SettingsGroup>
          <SettingsGroup
            title="أنواع الإشعارات"
            footer="إشعارات الحساب والمدفوعات والأمان تصلك دائماً. تُحفظ التغييرات تلقائياً."
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
          </SettingsGroup>
        </>
      )}
    </SettingsScreen>
  );
}
