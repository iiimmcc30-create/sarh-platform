import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { SettingsAccountCard } from '@/components/settings/SettingsAccountCard';
import { AppText, SarhInput, SarhSettingsRow, SarhSettingsSection } from '@/design-system/components';
import { Screen, ScreenBody } from '@/design-system/layout';
import { useAuth } from '@/contexts/AuthContext';
import { useAppUser } from '@/hooks/useApp';
import { useFreeTrialEligibility } from '@/hooks/useFreeTrialEligibility';
import { useTheme } from '@/hooks/useTheme';
import { alertMessage, confirmDestructive, presentOptionPicker } from '@/lib/actionSheet';
import { appVersionLabel } from '@/lib/appVersion';
import { safePush } from '@/lib/safeNavigate';
import {
  APPEARANCE_LABELS,
  COMMENTS_AUDIENCE_LABELS,
  FOLLOWING_LIST_LABELS,
  MESSAGES_AUDIENCE_LABELS,
  TIER_LABEL_AR,
  buildSettingsGroups,
  type SettingsAction,
  type SettingsRow,
} from '@/lib/settingsRows';
import { filterSettingsGroups } from '@/lib/settingsSearch';
import { sidebarShowsVerifiedBadge } from '@/lib/verifiedBadge';
import { fetchAccountSettings, fetchBlockedUsers, fetchPrivacySettings, updatePrivacySettings, DEFAULT_PRIVACY_SETTINGS, type AccountSettings, type PrivacySettings } from '@/services/users';
import {
  fetchMutedUsers,
  fetchNotificationSettings,
  fetchSessions,
  notificationsSummary,
  type NotificationSettings,
} from '@/services/userSettings';
import { fetchVerificationStatus, formatArabicDate, type VerificationStatus } from '@/services/verification';

type MessagesChoice = keyof typeof MESSAGES_AUDIENCE_LABELS;

export function messagesChoiceOf(p: PrivacySettings): MessagesChoice {
  if (!p.allowPrivateMessages) return 'nobody';
  return p.privateMessagesAudience;
}

/** Active paid or trial plan (badge tier), else null. */
export function activePlanOf(status: VerificationStatus | null): { tier: string; until: string | null; trial: boolean } | null {
  const sub = status?.subscription;
  if (!sub || !sub.tier) return null;
  if (sub.state !== 'active' && sub.state !== 'canceled' && sub.state !== 'grace_period') return null;
  const until = formatArabicDate(sub.renewDate);
  return { tier: sub.tier, until: until ? `حتى ${until}` : null, trial: !!sub.isTrial };
}

/**
 * Settings home — iOS Settings / X look: account card, search, grouped rounded
 * sections with light icons, grey current values and chevrons, logout and
 * delete at the bottom, app version under them.
 */
export function SettingsHomeScreen() {
  const router = useRouter();
  const { signOut, user } = useAuth();
  const { me } = useAppUser();
  const { preference, setPreference } = useTheme();
  const trialEligible = useFreeTrialEligibility();
  const [query, setQuery] = useState('');
  const [privacy, setPrivacy] = useState<PrivacySettings>(DEFAULT_PRIVACY_SETTINGS);
  const [account, setAccount] = useState<AccountSettings | null>(null);
  const [verification, setVerification] = useState<VerificationStatus | null>(null);
  const [notifications, setNotifications] = useState<NotificationSettings | null>(null);
  const [sessionsCount, setSessionsCount] = useState<number | null>(null);
  const [blockedCount, setBlockedCount] = useState<number | null>(null);
  const [mutedCount, setMutedCount] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      void Promise.all([
        fetchPrivacySettings(user?.id),
        fetchAccountSettings(),
        fetchVerificationStatus(),
        fetchNotificationSettings(),
        fetchSessions(),
        fetchBlockedUsers().catch(() => null),
        fetchMutedUsers(),
      ]).then(([p, a, v, n, s, b, m]) => {
        if (!alive) return;
        setPrivacy(p);
        setAccount(a);
        setVerification(v);
        setNotifications(n);
        setSessionsCount(s ? s.length : null);
        setBlockedCount(b ? b.length : null);
        setMutedCount(m ? m.length : null);
      });
      return () => {
        alive = false;
      };
    }, [user?.id]),
  );

  const plan = activePlanOf(verification);
  const name = me.arabicName || me.displayName || me.username || 'حسابي';

  const groups = useMemo(
    () =>
      buildSettingsGroups({
        subscription: {
          planLabel: plan ? TIER_LABEL_AR[plan.tier] ?? plan.tier : null,
          until: plan?.until ?? null,
          trialEligible,
          trialActive: !!plan?.trial,
        },
        phone: account?.phone ?? user?.phone ?? null,
        email: account?.email ?? user?.email ?? null,
        sessionsCount,
        privacy: {
          messages: MESSAGES_AUDIENCE_LABELS[messagesChoiceOf(privacy)],
          comments: COMMENTS_AUDIENCE_LABELS[privacy.commentsAudience],
          followingList: privacy.showFollowingList ? FOLLOWING_LIST_LABELS.public : FOLLOWING_LIST_LABELS.private,
          showInSearch: privacy.showInSearch,
        },
        blockedCount,
        mutedCount,
        isSubscriber: !!plan,
        notificationsValue: notifications
          ? notificationsSummary(notifications)
          : privacy.notificationsEnabled
            ? 'مفعّلة'
            : 'متوقفة',
        appearanceValue: APPEARANCE_LABELS[preference] ?? APPEARANCE_LABELS.system,
        appVersion: appVersionLabel(),
      }),
    [account, blockedCount, mutedCount, notifications, plan, preference, privacy, sessionsCount, trialEligible, user?.email, user?.phone],
  );
  const visible = useMemo(() => filterSettingsGroups(groups, query), [groups, query]);

  const patchPrivacy = async (patch: Partial<PrivacySettings>) => {
    const previous = privacy;
    setPrivacy({ ...privacy, ...patch });
    const result = await updatePrivacySettings(patch, user?.id, previous);
    if (!result.settings) {
      setPrivacy(previous);
      await alertMessage('تعذّر الحفظ', result.message ?? 'تحقق من الاتصال وحاول مجدداً');
      return;
    }
    setPrivacy(result.settings);
  };

  const runAction = async (action: SettingsAction, row: SettingsRow, next?: boolean) => {
    switch (action) {
      case 'show-in-search':
        await patchPrivacy({ showInSearch: next ?? !row.switchValue });
        return;
      case 'appearance': {
        const key = await presentOptionPicker({
          title: 'المظهر',
          selectedKey: preference,
          options: [
            { key: 'system', label: APPEARANCE_LABELS.system, subtitle: 'حسب إعداد الجهاز' },
            { key: 'dark', label: APPEARANCE_LABELS.dark },
            { key: 'light', label: APPEARANCE_LABELS.light },
          ],
        });
        if (key === 'system' || key === 'dark' || key === 'light') await setPreference(key);
        return;
      }
      case 'logout': {
        const ok = await confirmDestructive(
          'تسجيل الخروج',
          'هل أنت متأكد أنك تريد الخروج من حسابك؟',
          'تسجيل الخروج',
        );
        if (!ok) return;
        await signOut();
        router.replace('/auth/phone' as never);
        return;
      }
    }
  };

  const onRowPress = (row: SettingsRow) => {
    if (row.action) {
      void runAction(row.action, row);
      return;
    }
    if (row.route) safePush(row.route, undefined, router);
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader variant="screen" title="الإعدادات" showBack />
      <ScreenBody gutter={false} padBottom="xxxl">
        <View style={styles.search}>
          <SarhInput
            appearance="theme"
            shape="pill"
            size="compact"
            icon="search"
            value={query}
            onChangeText={setQuery}
            placeholder="ابحث في الإعدادات"
            returnKeyType="search"
            autoCorrect={false}
            clearButtonMode="while-editing"
            accessibilityLabel="ابحث في الإعدادات"
            testID="settings-search"
          />
        </View>

        {!query ? (
          <SettingsAccountCard
            name={name}
            username={me.username || null}
            avatar={me.avatar}
            verified={sidebarShowsVerifiedBadge(true, me.verified)}
            tier={me.verifiedTier}
            planLine={
              plan ? `${plan.trial ? 'تجربة' : 'مشترك'} ${TIER_LABEL_AR[plan.tier] ?? ''}`.trim() : null
            }
            onPress={() => safePush('/profile/edit', undefined, router)}
          />
        ) : null}

        {visible.length === 0 ? (
          <AppText variant="body" color="textMuted" align="center" style={styles.empty}>
            لا توجد نتائج لـ «{query.trim()}»
          </AppText>
        ) : null}

        {visible.map((group) => (
          <SarhSettingsSection
            key={group.key}
            grouped
            title={group.title || undefined}
            footer={query ? undefined : group.footer}
          >
            {group.rows.map((row, index) => (
              <SarhSettingsRow
                key={row.key}
                testID={`settings-row-${row.key}`}
                icon={row.icon}
                title={row.title}
                value={row.value}
                tone={row.tone}
                showChevron={row.tone === 'danger' ? false : undefined}
                switchValue={row.switchValue}
                onSwitchChange={
                  typeof row.switchValue === 'boolean' && row.action
                    ? (next) => void runAction(row.action as SettingsAction, row, next)
                    : undefined
                }
                showDivider={index < group.rows.length - 1}
                onPress={() => onRowPress(row)}
              />
            ))}
          </SarhSettingsSection>
        ))}
      </ScreenBody>
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: { paddingHorizontal: 16, paddingTop: 8 },
  empty: { paddingTop: 48, paddingHorizontal: 24 },
});

export default SettingsHomeScreen;
