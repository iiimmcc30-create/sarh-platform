import { ProfileSettingsMenuScreen } from '@/components/feature/ProfileSettingsMenuScreen';
import { useAuth } from '@/contexts/AuthContext';
import { alertMessage, confirmDestructive, presentActionSheet } from '@/lib/actionSheet';
import {
  DEFAULT_PRIVACY_SETTINGS,
  fetchAccountSettings,
  fetchPrivacySettings,
  updatePrivacySettings,
  type AccountSettings,
  type PrivacySettings,
} from '@/services/users';
import { useRouter, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
const COMMENTS_LABELS: Record<PrivacySettings['commentsAudience'], string> = {
  everyone: 'الجميع',
  followers: 'المتابعين',
};
const MESSAGES_LABELS: Record<PrivacySettings['privateMessagesAudience'], string> = {
  everyone: 'الجميع',
  following: 'الأشخاص الذين أتابعهم',
};
const FOLLOWING_LIST_LABELS = {
  public: 'الجميع',
  private: 'أنت فقط',
} as const;
function notificationsLabel(enabled: boolean) {
  return enabled ? 'مفعّلة' : 'متوقفة';
}
function formatAccountSubtitle(account: AccountSettings | null, userPhone?: string, userEmail?: string) {
  const phone = account?.phone ?? userPhone;
  const email = account?.email ?? userEmail;
  const parts = [
    phone ? `جوال: ${phone}` : null,
    email ? `بريد: ${email}` : null,
    account?.birthDate ? `ميلاد: ${account.birthDate}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'الهاتف، البريد، تاريخ الميلاد';
}
export default function ProfileSettingsScreen() {
  const router = useRouter();
  const { signOut, user } = useAuth();
  const [privacy, setPrivacy] = useState<PrivacySettings>(DEFAULT_PRIVACY_SETTINGS);
  const [account, setAccount] = useState<AccountSettings | null>(null);
  const loadSettings = useCallback(async () => {
    const [privacyData, accountData] = await Promise.all([
      fetchPrivacySettings(user?.id),
      fetchAccountSettings(),
    ]);
    setPrivacy(privacyData);
    setAccount(
      accountData ?? {
        phone: user?.phone ?? null,
        email: user?.email ?? null,
        birthDate: null,
      },
    );
  }, [user?.email, user?.id, user?.phone]);
  useFocusEffect(
    useCallback(() => {
      void loadSettings();
    }, [loadSettings]),
  );
  const patchPrivacy = async (patch: Partial<PrivacySettings>, successMessage: string) => {
    const result = await updatePrivacySettings(patch, user?.id, privacy);
    if (!result.settings) {
      await alertMessage('تعذّر الحفظ', result.message ?? 'تحقق من الاتصال وحاول مجدداً');
      return;
    }
    setPrivacy(result.settings);
    await alertMessage('تم الحفظ', successMessage);
  };
  const openCommentsSheet = async () => {
    const key = await presentActionSheet({
      title: 'السماح بالتعليقات من',
      message: 'من يمكنه التعليق على منشوراتك وإعلاناتك؟',
      items: [
        { key: 'everyone', label: 'الجميع' },
        { key: 'followers', label: 'المتابعين' },
      ],
    });
    if (key === 'everyone' || key === 'followers') {
      await patchPrivacy(
        { commentsAudience: key },
        key === 'everyone' ? 'يمكن للجميع التعليق' : 'التعليقات للمتابعين فقط',
      );
    }
  };
  const openMessagesSheet = async () => {
    const key = await presentActionSheet({
      title: 'الرسائل الخاصة',
      message: 'من يمكنه مراسلتك؟',
      items: [
        { key: 'everyone', label: 'الجميع' },
        { key: 'following', label: 'الأشخاص الذين أتابعهم' },
      ],
    });
    if (key === 'everyone' || key === 'following') {
      await patchPrivacy(
        {
          privateMessagesAudience: key,
          allowPrivateMessages: true,
        },
        key === 'everyone' ? 'الرسائل الخاصة مفتوحة للجميع' : 'الرسائل من المتابَعين فقط',
      );
    }
  };
  const openFollowingListSheet = async () => {
    const key = await presentActionSheet({
      title: 'قائمة المتابعة',
      message: 'من يمكنه رؤية الأشخاص الذين تتابعهم؟',
      items: [
        { key: 'public', label: 'الجميع' },
        { key: 'private', label: 'أنت فقط' },
      ],
    });
    if (key === 'public') {
      await patchPrivacy({ showFollowingList: true }, 'قائمة المتابعة ظاهرة للجميع');
    } else if (key === 'private') {
      await patchPrivacy({ showFollowingList: false }, 'قائمة المتابعة خاصة بك');
    }
  };
  const openNotificationsSheet = async () => {
    const key = await presentActionSheet({
      title: 'الإشعارات',
      message: 'تفعيل أو إيقاف الإشعارات الفورية',
      items: [
        { key: 'on', label: 'تفعيل' },
        { key: 'off', label: 'إيقاف' },
      ],
    });
    if (key === 'on') {
      await patchPrivacy({ notificationsEnabled: true }, 'تم تفعيل الإشعارات');
    } else if (key === 'off') {
      await patchPrivacy({ notificationsEnabled: false }, 'تم إيقاف الإشعارات');
    }
  };
  const handleLogout = async () => {
    const confirmed = await confirmDestructive(
      'تسجيل الخروج',
      'هل أنت متأكد أنك تريد الخروج من حسابك؟',
      'تسجيل الخروج',
    );
    if (!confirmed) return;
    await signOut();
    router.replace('/auth/phone' as any);
  };
  const accountSubtitle = formatAccountSubtitle(account, user?.phone, user?.email);
  const interactionItems = useMemo(
    () => [
      {
        key: 'comments',
        icon: 'chatbubble-ellipses-outline',
        label: 'التعليقات',
        subtitle: COMMENTS_LABELS[privacy.commentsAudience],
        onPress: () => void openCommentsSheet(),
      },
      {
        key: 'messages',
        icon: 'mail-outline',
        label: 'الرسائل الخاصة',
        subtitle: MESSAGES_LABELS[privacy.privateMessagesAudience],
        onPress: () => void openMessagesSheet(),
      },
      {
        key: 'following-list',
        icon: 'people-outline',
        label: 'قائمة المتابعة',
        subtitle: privacy.showFollowingList
          ? FOLLOWING_LIST_LABELS.public
          : FOLLOWING_LIST_LABELS.private,
        onPress: () => void openFollowingListSheet(),
      },
      {
        key: 'notifications',
        icon: 'notifications-outline',
        label: 'الإشعارات',
        subtitle: notificationsLabel(privacy.notificationsEnabled),
        onPress: () => void openNotificationsSheet(),
      },
    ],
    [privacy],
  );
  return (
    <ProfileSettingsMenuScreen
      title="إعدادات الحساب"
      onLogout={() => void handleLogout()}
      sections={[
        {
          title: 'الحساب',
          items: [
            {
              key: 'account-info',
              icon: 'person-circle-outline',
              label: 'معلومات الحساب',
              subtitle: accountSubtitle,
              route: '/profile/settings/account',
            },
            {
              key: 'change-phone',
              icon: 'call-outline',
              label: 'تغيير رقم الجوال',
              subtitle: account?.phone ?? user?.phone ?? 'غير مضاف',
              route: '/profile/settings/change-phone',
            },
            {
              key: 'password',
              icon: 'lock-outline',
              label: 'تغيير كلمة المرور',
              route: '/profile/settings/password',
            },
          ],
        },
        {
          title: 'الخصوصية',
          items: [...interactionItems],
        },
        {
          title: 'الأمان',
          items: [
            {
              key: 'blocked',
              icon: 'block',
              label: 'المحظورين',
              route: '/settings/blocked',
            },
          ],
        },
      ]}
    />
  );
}
