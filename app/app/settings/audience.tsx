import { useCallback, useState } from 'react';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SettingsScreen } from '@/components/settings/SettingsScreen';
import { SettingsGroup, SettingsStatus } from '@/components/settings/SettingsRows';
import { useAuth } from '@/contexts/AuthContext';
import { SarhSettingsRow } from '@/design-system/components';
import { alertMessage } from '@/lib/actionSheet';
import { AUDIENCE_PAGES, audiencePatch, audienceSelected, isAudienceKind } from '@/lib/settingsCopy';
import { fetchPrivacySettings, updatePrivacySettings, type PrivacySettings } from '@/services/users';

/**
 * Privacy audience page (`?kind=messages|comments|following`): iOS checkmark
 * list with a footnote. A tap saves immediately (optimistic, reverted on failure).
 */
export default function PrivacyAudienceScreen() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{ kind?: string }>();
  const kind = isAudienceKind(params.kind) ? params.kind : 'messages';
  const page = AUDIENCE_PAGES[kind];
  const [privacy, setPrivacy] = useState<PrivacySettings | null>(null);
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      void fetchPrivacySettings(user?.id).then((p) => {
        if (alive) setPrivacy(p);
      });
      return () => {
        alive = false;
      };
    }, [user?.id]),
  );

  const choose = async (key: string) => {
    if (!privacy || saving) return;
    if (audienceSelected(kind, privacy) === key) return;
    const patch = audiencePatch(kind, key);
    if (!patch) return;
    const previous = privacy;
    setPrivacy({ ...privacy, ...patch });
    setSaving(true);
    const result = await updatePrivacySettings(patch, user?.id, previous);
    setSaving(false);
    if (!result.settings) {
      setPrivacy(previous);
      await alertMessage('تعذّر الحفظ', result.message ?? 'تحقق من الاتصال وحاول مجدداً');
      return;
    }
    setPrivacy(result.settings);
  };

  const selected = privacy ? audienceSelected(kind, privacy) : null;

  return (
    <SettingsScreen title={page.title} largeTitle>
      {!privacy ? (
        <SettingsStatus state="loading" />
      ) : (
        <SettingsGroup title={page.header} footer={page.footer}>
          {page.options.map((option, i) => (
            <SarhSettingsRow
              key={option.key}
              testID={`audience-${kind}-${option.key}`}
              icon={option.icon}
              iconTile
              title={option.label}
              subtitle={option.hint}
              checked={selected === option.key}
              onPress={() => void choose(option.key)}
              showDivider={i < page.options.length - 1}
            />
          ))}
        </SettingsGroup>
      )}
    </SettingsScreen>
  );
}
