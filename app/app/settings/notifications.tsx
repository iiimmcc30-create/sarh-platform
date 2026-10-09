import { useCallback, useState } from 'react';
import { Linking, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useFocusEffect } from 'expo-router';
import { SettingsScreen } from '@/components/settings/SettingsScreen';
import { SettingsGroup, SettingsPill, SettingsStatus } from '@/components/settings/SettingsRows';
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
import { NOTIFICATION_CATEGORIES } from '@/lib/settingsCopy';

/**
 * Settings → الإشعارات: device permission state, master switch, then one
 * grouped category per kind of notification. Toggles auto-save (optimistic,
 * rolled back on failure) — no «حفظ» button.
 */
export default function NotificationSettingsScreen() {
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [osBlocked, setOsBlocked] = useState(false);

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
      if (Platform.OS !== 'web') {
        void Notifications.getPermissionsAsync()
          .then(({ status }) => setOsBlocked(status === 'denied'))
          .catch(() => setOsBlocked(false));
      }
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

  const enabledCount = settings ? NOTIFICATION_PREF_KEYS.filter((key) => settings.prefs[key]).length : 0;

  return (
    <SettingsScreen title="الإشعارات">
      {osBlocked ? (
        <SettingsGroup footer="الإشعارات متوقفة من إعدادات جهازك، فلن يصلك شيء حتى تسمح بها.">
          <SarhSettingsRow
            icon="notifications-off-outline"
            iconTile
            title="السماح بالإشعارات"
            subtitle="افتح إعدادات الجهاز"
            showDivider={false}
            onPress={() => void Linking.openSettings()}
          />
        </SettingsGroup>
      ) : null}

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
          <SettingsGroup footer="عند الإيقاف لن تصلك أي إشعارات فورية، وتبقى الإشعارات داخل التطبيق.">
            <SarhSettingsRow
              testID="notif-master"
              icon="notifications-outline"
              iconTile
              title="الإشعارات الفورية"
              subtitle={
                settings.notificationsEnabled
                  ? `${enabledCount} من ${NOTIFICATION_PREF_KEYS.length} أنواع مفعّلة`
                  : 'متوقفة'
              }
              switchValue={settings.notificationsEnabled}
              onSwitchChange={(next) => void save({ notificationsEnabled: next })}
              showDivider={false}
            />
          </SettingsGroup>

          {NOTIFICATION_CATEGORIES.map((category) => (
            <SettingsGroup key={category.key} title={category.title} footer={category.footer}>
              {category.prefs.map((key, index) => (
                <SarhSettingsRow
                  key={key}
                  testID={`notif-${key}`}
                  icon={NOTIFICATION_PREF_COPY[key].icon}
                  iconTile
                  title={NOTIFICATION_PREF_COPY[key].label}
                  subtitle={NOTIFICATION_PREF_COPY[key].hint}
                  switchValue={settings.prefs[key]}
                  disabled={!settings.notificationsEnabled}
                  onSwitchChange={(next) => void save({ [key]: next })}
                  showDivider={index < category.prefs.length - 1}
                />
              ))}
            </SettingsGroup>
          ))}

          <SettingsGroup
            title="تصلك دائماً"
            footer="لا يمكن إيقافها لأنها تخص أمان حسابك ومدفوعاتك. تُحفظ بقية التغييرات تلقائياً."
          >
            <SarhSettingsRow
              icon="shield-checkmark-outline"
              iconTile
              title="الحساب والأمان"
              subtitle="تنبيهات أمان حسابك"
              accessory={<SettingsPill label="دائماً" />}
            />
            <SarhSettingsRow
              icon="card-outline"
              iconTile
              title="المدفوعات"
              subtitle="إيصالات وحالة عمليات الدفع"
              accessory={<SettingsPill label="دائماً" />}
              showDivider={false}
            />
          </SettingsGroup>
        </>
      )}
    </SettingsScreen>
  );
}
