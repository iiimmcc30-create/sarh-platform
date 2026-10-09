/**
 * Settings home (iOS Settings / X look): the groups and rows in display order.
 * Pure data so the order, routes and search can be unit-tested; the screen maps
 * `action` rows to handlers (pickers, logout) and `route` rows to navigation.
 */
import type { SearchableSettingsGroup, SearchableSettingsRow } from '@/lib/settingsSearch';

export type SettingsAction =
  | 'messages-audience'
  | 'comments-audience'
  | 'following-list'
  | 'show-in-search'
  | 'appearance'
  | 'logout';

export type SettingsRow = SearchableSettingsRow & {
  icon: string;
  route?: string;
  action?: SettingsAction;
  /** Inline switch rows (value is the switch state). */
  switchValue?: boolean;
  tone?: 'default' | 'danger';
};

export type SettingsGroup = SearchableSettingsGroup<SettingsRow> & { footer?: string };

export type SettingsContext = {
  subscription: {
    /** «أزرق» / «أزرق+» / «ذهبي» or null when not subscribed. */
    planLabel: string | null;
    /** «حتى ١٢ نوفمبر» etc. */
    until: string | null;
    trialEligible: boolean;
    trialActive: boolean;
  };
  phone: string | null;
  email: string | null;
  sessionsCount: number | null;
  privacy: {
    messages: string;
    comments: string;
    followingList: string;
    showInSearch: boolean;
  };
  blockedCount: number | null;
  mutedCount: number | null;
  isSubscriber: boolean;
  notificationsValue: string;
  appearanceValue: string;
  appVersion: string;
};

const count = (n: number | null) => (n === null ? undefined : n > 0 ? String(n) : undefined);

export const MESSAGES_AUDIENCE_LABELS = {
  everyone: 'الجميع',
  followers: 'متابعيني',
  following: 'من أتابعهم',
  nobody: 'لا أحد',
} as const;

export const COMMENTS_AUDIENCE_LABELS = {
  everyone: 'الجميع',
  followers: 'المتابعون',
} as const;

export const FOLLOWING_LIST_LABELS = {
  public: 'الجميع',
  private: 'أنت فقط',
} as const;

export const APPEARANCE_LABELS = {
  system: 'تلقائي',
  dark: 'داكن',
  light: 'فاتح',
} as const;

export function buildSettingsGroups(ctx: SettingsContext): SettingsGroup[] {
  const sub = ctx.subscription;
  const subscriptionRows: SettingsRow[] = sub.planLabel
    ? [
        {
          key: 'subscription',
          icon: 'diamond-outline',
          title: sub.trialActive ? 'التجربة المجانية' : 'اشتراكك',
          value: sub.until ? `${sub.planLabel} · ${sub.until}` : sub.planLabel,
          route: '/verification',
          keywords: ['اشتراك', 'خطة', 'تجديد', 'ذهبي', 'ازرق', 'توثيق'],
        },
      ]
    : [
        {
          key: 'subscription',
          icon: 'diamond-outline',
          title: sub.trialEligible ? 'جرّب أزرق+ مجاناً لأسبوع' : 'ترقية الحساب',
          value: sub.trialEligible ? 'مجاناً' : undefined,
          route: '/verification',
          keywords: ['اشتراك', 'ترقية', 'تجربة', 'توثيق', 'شارة'],
        },
      ];

  return [
    { key: 'subscription', title: 'الاشتراك', rows: subscriptionRows },
    {
      key: 'account',
      title: 'الحساب والأمان',
      rows: [
        {
          key: 'phone',
          icon: 'call-outline',
          title: 'رقم الجوال',
          value: ctx.phone ?? 'غير مضاف',
          route: '/profile/settings/change-phone',
          keywords: ['جوال', 'هاتف', 'رقم'],
        },
        {
          key: 'email',
          icon: 'mail-outline',
          title: 'البريد وتاريخ الميلاد',
          value: ctx.email ?? 'غير مضاف',
          route: '/profile/settings/account',
          keywords: ['بريد', 'ايميل', 'ميلاد'],
        },
        {
          key: 'password',
          icon: 'lock-outline',
          title: 'كلمة المرور',
          route: '/profile/settings/password',
          keywords: ['كلمة المرور', 'باسورد', 'امان'],
        },
        {
          key: 'sessions',
          icon: 'phone-portrait-outline',
          title: 'الأجهزة المتصلة',
          value: count(ctx.sessionsCount),
          route: '/settings/sessions',
          keywords: ['اجهزة', 'جلسات', 'دخول'],
        },
        {
          key: 'export',
          icon: 'download-outline',
          title: 'تحميل بياناتي',
          route: '/settings/export',
          keywords: ['بيانات', 'تصدير', 'نسخة'],
        },
      ],
    },
    {
      key: 'privacy',
      title: 'الخصوصية',
      rows: [
        {
          key: 'messages-audience',
          icon: 'chatbubble-ellipses-outline',
          title: 'من يمكنه مراسلتي',
          value: ctx.privacy.messages,
          action: 'messages-audience',
          keywords: ['رسائل', 'مراسلة', 'خاص'],
        },
        {
          key: 'comments-audience',
          icon: 'chatbubble-ellipses-outline',
          title: 'من يمكنه التعليق',
          value: ctx.privacy.comments,
          action: 'comments-audience',
          keywords: ['تعليقات'],
        },
        {
          key: 'following-list',
          icon: 'people-outline',
          title: 'من يرى قائمة متابعاتي',
          value: ctx.privacy.followingList,
          action: 'following-list',
          keywords: ['متابعة', 'قائمة'],
        },
        {
          key: 'show-in-search',
          icon: 'search-outline',
          title: 'الظهور في نتائج البحث',
          switchValue: ctx.privacy.showInSearch,
          action: 'show-in-search',
          keywords: ['بحث', 'ظهور'],
        },
        {
          key: 'blocked',
          icon: 'block',
          title: 'الحسابات المحظورة',
          value: count(ctx.blockedCount),
          route: '/settings/blocked',
          keywords: ['حظر', 'محظور'],
        },
        {
          key: 'muted',
          icon: 'volume-mute-outline',
          title: 'الحسابات المكتومة',
          value: count(ctx.mutedCount),
          route: '/settings/muted',
          keywords: ['كتم', 'مكتوم'],
        },
        {
          key: 'profile-views',
          icon: 'eye-outline',
          title: 'من شاهد ملفك',
          value: ctx.isSubscriber ? undefined : 'للمشتركين',
          route: '/profile/views',
          keywords: ['مشاهدات', 'زوار', 'شاهد'],
        },
      ],
    },
    {
      key: 'notifications',
      title: 'الإشعارات',
      rows: [
        {
          key: 'notifications',
          icon: 'notifications-outline',
          title: 'الإشعارات',
          value: ctx.notificationsValue,
          route: '/settings/notifications',
          keywords: ['اشعارات', 'تنبيهات', 'رسائل', 'متابعات', 'مجالس', 'عروض'],
        },
      ],
    },
    {
      key: 'listings',
      title: 'إعلاناتي والمدفوعات',
      rows: [
        {
          key: 'my-listings',
          icon: 'storefront-outline',
          title: 'إعلاناتي',
          route: '/(tabs)/profile',
          keywords: ['اعلانات', 'عروضي'],
        },
        {
          key: 'promote',
          icon: 'megaphone-outline',
          title: 'التعزيز وإحصائياته',
          route: '/promote',
          keywords: ['تعزيز', 'ترويج', 'احصائيات', 'ظهور', 'نقرات'],
        },
        {
          key: 'fees',
          icon: 'card-outline',
          title: 'سداد الرسوم',
          route: '/fees',
          keywords: ['رسوم', 'عمولة', 'سداد'],
        },
        {
          key: 'payments',
          icon: 'receipt-outline',
          title: 'سجل المدفوعات',
          route: '/settings/payments',
          keywords: ['فواتير', 'ايصالات', 'مدفوعات'],
        },
      ],
    },
    {
      key: 'appearance',
      title: 'المظهر',
      rows: [
        {
          key: 'appearance',
          icon: 'contrast-outline',
          title: 'المظهر',
          value: ctx.appearanceValue,
          action: 'appearance',
          keywords: ['داكن', 'فاتح', 'ليلي', 'ثيم', 'وضع'],
        },
      ],
    },
    {
      key: 'help',
      title: 'المساعدة',
      rows: [
        {
          key: 'help-center',
          icon: 'lifebuoy',
          title: 'مركز المساعدة',
          route: '/support',
          keywords: ['مساعدة', 'دعم', 'اسئلة', 'تذاكر'],
        },
        {
          key: 'contact',
          icon: 'mail-outline',
          title: 'تواصل معنا',
          route: '/info/contact',
          keywords: ['تواصل', 'اتصال'],
        },
        {
          key: 'terms',
          icon: 'document-text-outline',
          title: 'الشروط والأحكام',
          route: '/info/terms',
          keywords: ['شروط'],
        },
        {
          key: 'privacy-policy',
          icon: 'shield-checkmark-outline',
          title: 'سياسة الخصوصية',
          route: '/info/privacy',
          keywords: ['خصوصية', 'سياسة'],
        },
      ],
    },
    {
      key: 'session',
      title: '',
      footer: ctx.appVersion,
      rows: [
        {
          key: 'logout',
          icon: 'log-out-outline',
          title: 'تسجيل الخروج',
          action: 'logout',
          tone: 'danger',
          keywords: ['خروج'],
        },
        {
          key: 'delete-account',
          icon: 'trash-outline',
          title: 'حذف الحساب',
          route: '/settings/delete-account',
          tone: 'danger',
          keywords: ['حذف'],
        },
      ],
    },
  ];
}

/** «أزرق+» etc. for the account card and subscription row. */
export const TIER_LABEL_AR: Record<string, string> = {
  blue: 'أزرق',
  blue_plus: 'أزرق+',
  gold: 'ذهبي',
};
