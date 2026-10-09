import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SettingsSaveHeader } from '@/components/settings/SettingsScreen';
import { useSettingsGroups } from '@/components/settings/useSettingsGroups';
import { AppText, SarhInput, SarhSettingsRow, SarhSettingsSection } from '@/design-system/components';
import { Screen, ScreenBody } from '@/design-system/layout';
import { safePush } from '@/lib/safeNavigate';
import { settingsSectionHref, type SettingsAction, type SettingsRow } from '@/lib/settingsRows';
import { filterSettingsGroups } from '@/lib/settingsSearch';

export { activePlanOf, messagesChoiceOf } from '@/components/settings/useSettingsGroups';

/**
 * Settings hub — X «الإعدادات»: header with the @username, a pill search
 * field, then one plain row per section (thin outline icon · white title ·
 * grey description), no cards, separators or chevrons, and the app version
 * centred at the bottom. Searching lists the matching rows under bold section
 * titles. Profile editing lives under «حسابك» → «الملف الشخصي» ('/profile/edit').
 */
export function SettingsHomeScreen() {
  const router = useRouter();
  const { groups, appVersion, runAction, onRowPress } = useSettingsGroups();
  const [query, setQuery] = useState('');
  const results = useMemo(() => (query.trim() ? filterSettingsGroups(groups, query) : []), [groups, query]);
  const searching = query.trim().length > 0;

  const renderRow = (row: SettingsRow) => (
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
  );

  return (
    <Screen edges={['top', 'bottom']}>
      <SettingsSaveHeader title="الإعدادات" />
      <ScreenBody gutter={false} padBottom="xxxl">
        <View style={styles.search}>
          <SarhInput
            appearance="theme"
            shape="pill"
            size="compact"
            icon="search"
            value={query}
            onChangeText={setQuery}
            placeholder="إعدادات البحث"
            returnKeyType="search"
            autoCorrect={false}
            clearButtonMode="while-editing"
            accessibilityLabel="إعدادات البحث"
            testID="settings-search"
          />
        </View>

        {searching ? (
          results.length === 0 ? (
            <AppText variant="body" color="textMuted" align="center" style={styles.empty}>
              لا توجد نتائج لـ «{query.trim()}»
            </AppText>
          ) : (
            results.map((group) => (
              <SarhSettingsSection key={group.key} title={group.title}>
                {group.rows.map(renderRow)}
              </SarhSettingsSection>
            ))
          )
        ) : (
          <SarhSettingsSection>
            {groups.map((group) => (
              <SarhSettingsRow
                key={group.key}
                testID={`settings-section-${group.key}`}
                icon={group.icon}
                title={group.title}
                subtitle={group.description}
                onPress={() => {
                  const href = settingsSectionHref(group);
                  if (href) safePush(href, undefined, router);
                }}
              />
            ))}
          </SarhSettingsSection>
        )}

        {!searching ? (
          <AppText testID="settings-version" variant="caption" color="textMuted" align="center" style={styles.version}>
            {appVersion}
          </AppText>
        ) : null}
      </ScreenBody>
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  empty: { paddingTop: 48, paddingHorizontal: 24 },
  version: { paddingTop: 24, paddingBottom: 8 },
});

export default SettingsHomeScreen;
