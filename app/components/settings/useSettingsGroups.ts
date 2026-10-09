import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
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
  type SettingsGroup,
  type SettingsRow,
} from '@/lib/settingsRows';
import {
  DEFAULT_PRIVACY_SETTINGS,
  fetchAccountSettings,
  fetchBlockedUsers,
  fetchPrivacySettings,
  updatePrivacySettings,
  type AccountSettings,
  type PrivacySettings,
} from '@/services/users';
import {
  fetchMutedUsers,
  fetchNotificationSettings,
  fetchSessions,
  notificationsSummary,
  type NotificationSettings,
} from '@/services/userSettings';
import { fetchVerificationStatus, formatArabicDate, type VerificationStatus } from '@/services/verification';
import { useSettingsIdentity } from './SettingsScreen';

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
 * Data + handlers shared by the settings hub and the section pages: loads the
 * current values on focus (same calls as before), builds the X sections and
 * runs row actions (search switch, appearance picker, logout).
 */
export function useSettingsGroups(): {
  groups: SettingsGroup[];
  appVersion: string;
  runAction: (action: SettingsAction, row: SettingsRow, next?: boolean) => Promise<void>;
  onRowPress: (row: SettingsRow) => void;
} {
  const router = useRouter();
  const { signOut, user } = useAuth();
  const identity = useSettingsIdentity();
  const { preference, setPreference } = useTheme();
  const trialEligible = useFreeTrialEligibility();
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
  const appVersion = appVersionLabel();

  const groups = useMemo(
    () =>
      buildSettingsGroups({
        identity,
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
        appVersion,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [account, appVersion, blockedCount, identity.name, identity.username, mutedCount, notifications, plan?.tier, plan?.until, plan?.trial, preference, privacy, sessionsCount, trialEligible, user?.email, user?.phone],
  );

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

  return { groups, appVersion, runAction, onRowPress };
}
