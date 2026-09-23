import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { useAppUser } from '@/hooks/useApp';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/hooks/useTheme';
import { alertMessage } from '@/lib/actionSheet';
import {
  DEFAULT_PRIVACY_SETTINGS,
  fetchPrivacySettings,
  updatePrivacySettings,
  type PrivacySettings,
} from '@/services/users';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Switch } from 'react-native';
import { AppText, SarhButton, SarhDivider } from '@/design-system/components';
import { Row, Screen, ScreenBody, Stack } from '@/design-system/layout';
import { space } from '@/design-system/tokens';

type PrivacyToggleKey = {
  [Key in keyof PrivacySettings]: PrivacySettings[Key] extends boolean ? Key : never;
}[keyof PrivacySettings];

const TOGGLES: Array<{
  key: PrivacyToggleKey;
  label: string;
  description: string;
}> = [
  {
    key: 'showInSearch',
    label: 'إظهار الحساب في نتائج البحث',
    description: 'عند الإيقاف لن يظهر حسابك عند البحث عن المستخدمين.',
  },
  {
    key: 'allowPrivateMessages',
    label: 'السماح بالرسائل الخاصة',
    description: 'عند الإيقاف لن يتمكن الآخرون من بدء محادثة معك.',
  },
  {
    key: 'showFollowingList',
    label: 'السماح برؤية الأشخاص الذين أتابعهم',
    description: 'عند الإيقاف ستكون قائمة «يتابع» خاصة بك فقط.',
  },
];

/** Layout only — theme colors are read at render. */
const styles = StyleSheet.create({
  centered: { alignItems: 'center', justifyContent: 'center' },
  row: { paddingVertical: space[16] },
  description: { lineHeight: 20 },
});

export default function PrivacySettingsScreen() {
  const { me } = useAppUser();
  const { accessToken, isLoading: authLoading } = useAuth();
  const { colors } = useTheme();
  const [settings, setSettings] = useState<PrivacySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [savingKey, setSavingKey] = useState<PrivacyToggleKey | null>(null);

  const loadSettings = useCallback(async () => {
    if (authLoading) return;

    if (!accessToken || !me.id) {
      setSettings(null);
      setLoadError(true);
      setLoading(false);
      return;
    }

    setLoadError(false);

    const data = await fetchPrivacySettings(me.id);
    setSettings(data);
    setLoadError(false);
    setLoading(false);
  }, [accessToken, authLoading, me.id]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const handleToggle = async (key: PrivacyToggleKey, value: boolean) => {
    if (!accessToken || !me.id || !settings || savingKey) return;

    const previous = settings[key];
    setSettings({ ...settings, [key]: value });
    setSavingKey(key);

    try {
      const result = await updatePrivacySettings({ [key]: value }, me.id, settings);
      if (!result.settings) {
        setSettings({ ...settings, [key]: previous });
        await alertMessage('تعذّر الحفظ', result.message ?? 'لم نتمكن من تحديث إعداد الخصوصية. تحقق من الاتصال وحاول مجدداً.');
        return;
      }
      setSettings(result.settings);
      setLoadError(false);
    } catch {
      setSettings({ ...settings, [key]: previous });
      await alertMessage('خطأ', 'تعذّر الاتصال بالخادم');
    } finally {
      setSavingKey(null);
    }
  };

  const header = <ScreenHeader variant="screen" title="الخصوصية" showBack />;

  if (!settings && (loading || authLoading)) {
    return (
      <Screen edges={['top', 'bottom']}>
        {header}
        <ScreenBody scroll={false} style={styles.centered}>
          <ActivityIndicator size="large" color={colors.electricBright} />
        </ScreenBody>
      </Screen>
    );
  }

  if (!accessToken || !settings) {
    return (
      <Screen edges={['top', 'bottom']}>
        {header}
        <ScreenBody scroll={false} width="form" style={styles.centered}>
          <Stack gap="md" align="center">
            <AppText variant="body" color="textMuted" align="center">
              {accessToken
                ? 'تعذّر تحميل إعدادات الخصوصية'
                : 'يجب تسجيل الدخول لعرض إعدادات الخصوصية'}
            </AppText>
            {accessToken ? (
              <SarhButton title="إعادة المحاولة" onPress={() => void loadSettings()} />
            ) : null}
          </Stack>
        </ScreenBody>
      </Screen>
    );
  }

  return (
    <Screen edges={['top', 'bottom']}>
      {header}
      <ScreenBody padTop="lg" gap="section" width="form" padBottom="xxl">
        {loadError ? (
          <Stack gap="sm">
            <AppText variant="caption" color="warning">
              عُرضت الإعدادات الافتراضية. قد تحتاج تحديث التطبيق أو الخادم لمزامنة تفضيلاتك.
            </AppText>
            <SarhButton
              title="إعادة المحاولة"
              onPress={() => void loadSettings()}
              variant="secondary"
            />
          </Stack>
        ) : null}

        <AppText variant="bodySmall" color="textSecondary">
          اختر ما تريد مشاركته مع الآخرين في سرح. يمكنك تغيير هذه الإعدادات في أي وقت.
        </AppText>

        <Stack gap="none">
          {TOGGLES.map((item, index) => (
            <Stack key={item.key} gap="none">
              <Row gap="md" align="center" style={styles.row}>
                <Stack gap="xs" fill>
                  <AppText variant="bodyMedium" color="textPrimary">
                    {item.label}
                  </AppText>
                  <AppText variant="caption" color="textMuted" style={styles.description}>
                    {item.description}
                  </AppText>
                </Stack>
                <Switch
                  value={settings[item.key]}
                  onValueChange={(value) => void handleToggle(item.key, value)}
                  disabled={savingKey === item.key}
                  trackColor={{
                    false: colors.bgDeep,
                    true: colors.electric,
                  }}
                  thumbColor="#fff"
                  ios_backgroundColor={colors.bgDeep}
                />
              </Row>
              {index < TOGGLES.length - 1 ? <SarhDivider /> : null}
            </Stack>
          ))}
        </Stack>
      </ScreenBody>
    </Screen>
  );
}
