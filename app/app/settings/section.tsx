import { useLocalSearchParams } from 'expo-router';
import { SettingsScreen } from '@/components/settings/SettingsScreen';
import { SettingsStatus } from '@/components/settings/SettingsRows';
import { useSettingsGroups } from '@/components/settings/useSettingsGroups';
import { SarhSettingsRow, SarhSettingsSection } from '@/design-system/components';
import type { SettingsAction } from '@/lib/settingsRows';

/**
 * One settings section (X «حسابك» / «الخصوصية والأمان» …): the same header
 * with the section title and @username, then plain rows — outline icon,
 * white title, grey description, switches inline at the end.
 */
export default function SettingsSectionScreen() {
  const { key } = useLocalSearchParams<{ key?: string }>();
  const { groups, runAction, onRowPress } = useSettingsGroups();
  const group = groups.find((g) => g.key === key);

  return (
    <SettingsScreen title={group?.title ?? 'الإعدادات'}>
      {!group ? (
        <SettingsStatus state="empty" icon="information-circle-outline" message="هذا القسم غير متاح" />
      ) : (
        <SarhSettingsSection footer={group.footer}>
          {group.rows.map((row) => (
            <SarhSettingsRow
              key={row.key}
              testID={`settings-row-${row.key}`}
              icon={row.icon}
              title={row.title}
              subtitle={row.description}
              value={row.value}
              tone={row.tone}
              switchValue={row.switchValue}
              onSwitchChange={
                typeof row.switchValue === 'boolean' && row.action
                  ? (next) => void runAction(row.action as SettingsAction, row, next)
                  : undefined
              }
              onPress={() => onRowPress(row)}
            />
          ))}
        </SarhSettingsSection>
      )}
    </SettingsScreen>
  );
}
