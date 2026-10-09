/**
 * Settings (X look): the hub sections and the rows inside each section page,
 * in display order. Pure data so the order, routes and search can be
 * unit-tested; the screens map `action` rows to handlers (switches, appearance,
 * logout) and `route` rows to navigation.
 *
 * Hub: one row per section (icon · title · grey description). A section with a
 * single row (`direct`) opens that row's route; the others open
 * `/settings/section?key=…`, which lists the section's rows the same way.
 */
import type { SearchableSettingsGroup, SearchableSettingsRow } from '@/lib/settingsSearch';
import { withoutDigitalPurchaseRows } from '@/lib/storePurchases';

export type SettingsAction =
  | 'show-in-search'
  | 'appearance'
  | 'logout';

export type SettingsRow = SearchableSettingsRow & {
  icon: string;
  route?: string;
  action?: SettingsAction;
  /** Grey 1–3 line description under the title. */
  description?: string;
  /** Inline switch rows (value is the switch state). */
  switchValue?: boolean;
  tone?: 'default' | 'danger';
};

export type SettingsGroup = SearchableSettingsGroup<SettingsRow> & {
  /** Hub row icon (thin outline). */
  icon: string;
  /** Hub row description (grey, 2–3 lines). */
  description: string;
  /** Tapping the hub row opens the single row's route instead of a section page. */
  direct?: boolean;
  footer?: string;
};

export type SettingsContext = {
  /** Display name and @username for the «الملف الشخصي» row. */
  identity?: { name: string; username: string };
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
  /** Shown centred at the bottom of the hub. */
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
  const handle = ctx.identity?.username ? `@${ctx.identity.username}` : '';
  const profileLine = [ctx.identity?.name, handle].filter(Boolean).join(' · ');

  // Store builds: drop the verification / promote rows (lib/storePurchases.ts).
  return withoutDigitalPurchaseRows<SettingsRow, SettingsGroup>([
    {
      key: 'account',
      title: 'حسابك',
      icon: 'person-outline',
      description: 'اطّلع على معلومات حسابك، أو نزّل نسخة من بياناتك، أو تعرّف على خيارات حذف الحساب.',
      rows: [
        {
          key: 'profile',
          icon: 'person-outline',
          title: 'الملف الشخصي',
          description: profileLine || 'الاسم واسم المستخدم والصورة والنبذة.',
          route: '/profile/edit',
          keywords: ['الاسم', 'اسم المستخدم', 'صورة', 'نبذة', 'ملف'],
        },
        {
          key: 'phone',
          icon: 'call-outline',
          title: 'رقم الجوال',
          description: 'الرقم الذي تسجّل الدخول به وتستعيد به حسابك.',
          value: ctx.phone ?? 'غير مضاف',
          route: '/profile/settings/change-phone',
          keywords: ['جوال', 'هاتف', 'رقم'],
        },
        {
          key: 'email',
          icon: 'mail-outline',
          title: 'البريد وتاريخ الميلاد',
          description: ctx.email ?? 'أضف بريدك الإلكتروني وتاريخ ميلادك.',
          route: '/profile/settings/account',
          keywords: ['بريد', 'ايميل', 'ميلاد'],
        },
        {
          key: 'export',
          icon: 'download-outline',
          title: 'تحميل بياناتي',
          description: 'احصل على نسخة من بيانات حسابك وإعلاناتك ومنشوراتك ومدفوعاتك.',
          route: '/settings/export',
          keywords: ['بيانات', 'تصدير', 'نسخة', 'ارشيف'],
        },
        {
          key: 'delete-account',
          icon: 'trash-outline',
          title: 'حذف الحساب',
          description: 'اعرف ما يحدث عند حذف حسابك وكيف تحذفه.',
          route: '/settings/delete-account',
          tone: 'danger',
          keywords: ['حذف', 'تعطيل'],
        },
        {
          key: 'logout',
          icon: 'log-out-outline',
          title: 'تسجيل الخروج',
          action: 'logout',
          tone: 'danger',
          keywords: ['خروج'],
        },
      ],
    },
    {
      key: 'security',
      title: 'الأمان والوصول إلى الحساب',
      icon: 'lock-outline',
      description: 'أدِر أمان حسابك، وتابع الأجهزة التي سجّلت الدخول بحسابك.',
      rows: [
        {
          key: 'password',
          icon: 'lock-outline',
          title: 'كلمة المرور',
          description: 'غيّر كلمة المرور في أي وقت.',
          route: '/profile/settings/password',
          keywords: ['كلمة المرور', 'باسورد', 'امان'],
        },
        {
          key: 'sessions',
          icon: 'phone-portrait-outline',
          title: 'الأجهزة المتصلة',
          description: 'الأجهزة التي سجّلت الدخول بحسابك، ويمكنك تسجيل خروجها.',
          value: count(ctx.sessionsCount),
          route: '/settings/sessions',
          keywords: ['اجهزة', 'جلسات', 'دخول'],
        },
      ],
    },
    {
      key: 'verification',
      title: 'توثيق الحساب',
      icon: 'badge-check',
      description: sub.planLabel
        ? `${sub.trialActive ? 'تجربة' : 'مشترك'} ${sub.planLabel}${sub.until ? ` · ${sub.until}` : ''}`
        : 'اطّلع على مزايا التوثيق وشارة الحساب، وأدِر اشتراكك.',
      direct: true,
      rows: [
        {
          key: 'subscription',
          icon: 'badge-check',
          title: sub.planLabel
            ? sub.trialActive
              ? 'التجربة المجانية'
              : 'اشتراكك'
            : sub.trialEligible
              ? 'جرّب أزرق+ مجاناً لأسبوع'
              : 'توثيق الحساب',
          description: sub.planLabel
            ? sub.until
              ? `${sub.planLabel} · ${sub.until}`
              : sub.planLabel
            : 'شارة التوثيق ومزايا الحسابات الموثّقة.',
          route: '/verification',
          keywords: ['اشتراك', 'خطة', 'تجديد', 'ذهبي', 'ازرق', 'توثيق', 'شارة', 'تجربة'],
        },
      ],
    },
    {
      key: 'privacy',
      title: 'الخصوصية والأمان',
      icon: 'shield-checkmark-outline',
      description: 'أدِر من يراسلك ويعلّق على منشوراتك ويرى متابعاتك، والحسابات المحظورة والمكتومة.',
      rows: [
        {
          key: 'messages-audience',
          icon: 'chatbubble-ellipses-outline',
          title: 'من يمكنه مراسلتي',
          description: 'اختر من يستطيع مراسلتك في الخاص.',
          value: ctx.privacy.messages,
          route: '/settings/audience?kind=messages',
          keywords: ['رسائل', 'مراسلة', 'خاص'],
        },
        {
          key: 'comments-audience',
          icon: 'chatbubble-outline',
          title: 'من يمكنه التعليق',
          description: 'اختر من يستطيع التعليق على منشوراتك وإعلاناتك.',
          value: ctx.privacy.comments,
          route: '/settings/audience?kind=comments',
          keywords: ['تعليقات'],
        },
        {
          key: 'following-list',
          icon: 'people-outline',
          title: 'من يرى قائمة متابعاتي',
          description: 'حدّد من يستطيع رؤية الحسابات التي تتابعها.',
          value: ctx.privacy.followingList,
          route: '/settings/audience?kind=following',
          keywords: ['متابعة', 'قائمة', 'متابعين'],
        },
        {
          key: 'show-in-search',
          icon: 'search-outline',
          title: 'الظهور في نتائج البحث',
          description: 'اسمح للآخرين بالعثور على حسابك عند البحث.',
          switchValue: ctx.privacy.showInSearch,
          action: 'show-in-search',
          keywords: ['بحث', 'ظهور'],
        },
        {
          key: 'blocked',
          icon: 'block',
          title: 'الحسابات المحظورة',
          description: 'أدِر الحسابات التي حظرتها.',
          value: count(ctx.blockedCount),
          route: '/settings/blocked',
          keywords: ['حظر', 'محظور'],
        },
        {
          key: 'muted',
          icon: 'volume-mute-outline',
          title: 'الحسابات المكتومة',
          description: 'أدِر الحسابات التي كتمتها.',
          value: count(ctx.mutedCount),
          route: '/settings/muted',
          keywords: ['كتم', 'مكتوم'],
        },
        {
          key: 'profile-views',
          icon: 'eye-outline',
          title: 'من شاهد ملفك',
          description: 'اطّلع على من زار ملفك الشخصي.',
          value: ctx.isSubscriber ? undefined : 'للمشتركين',
          route: '/profile/views',
          keywords: ['مشاهدات', 'زوار', 'شاهد'],
        },
      ],
    },
    {
      key: 'notifications',
      title: 'الإشعارات',
      icon: 'notifications-outline',
      description: 'اختر أنواع الإشعارات التي تصلك عن نشاطك ومن تتابعهم وعروض سرح.',
      direct: true,
      rows: [
        {
          key: 'notifications',
          icon: 'notifications-outline',
          title: 'الإشعارات',
          description: ctx.notificationsValue,
          route: '/settings/notifications',
          keywords: ['اشعارات', 'تنبيهات', 'رسائل', 'متابعات', 'مجالس', 'عروض'],
        },
      ],
    },
    {
      key: 'payments',
      title: 'المدفوعات',
      icon: 'card-outline',
      description: 'سجل عمليات الدفع وإيصالاتها، ورسوم الإعلانات.',
      rows: [
        {
          key: 'payments',
          icon: 'receipt-outline',
          title: 'سجل المدفوعات',
          description: 'عمليات الدفع وحالتها وإيصال كل عملية.',
          route: '/settings/payments',
          keywords: ['فواتير', 'ايصالات', 'مدفوعات'],
        },
        {
          key: 'fees',
          icon: 'card-outline',
          title: 'سداد الرسوم',
          description: 'رسوم إعلاناتك وحالة سدادها.',
          route: '/fees',
          keywords: ['رسوم', 'عمولة', 'سداد'],
        },
        {
          key: 'promote',
          icon: 'megaphone-outline',
          title: 'التعزيز وإحصائياته',
          description: 'إعلاناتك المعزّزة ونتائج ظهورها.',
          route: '/promote',
          keywords: ['تعزيز', 'ترويج', 'احصائيات', 'ظهور', 'نقرات'],
        },
      ],
    },
    {
      key: 'display',
      title: 'العرض واللغة',
      icon: 'contrast-outline',
      description: 'أدِر طريقة عرض سرح: الوضع الداكن أو الفاتح. لغة التطبيق العربية.',
      rows: [
        {
          key: 'appearance',
          icon: 'contrast-outline',
          title: 'المظهر',
          description: 'داكن أو فاتح، أو حسب إعداد جهازك.',
          value: ctx.appearanceValue,
          action: 'appearance',
          keywords: ['داكن', 'فاتح', 'ليلي', 'ثيم', 'وضع', 'لغة'],
        },
      ],
    },
    {
      key: 'resources',
      title: 'موارد إضافية',
      icon: 'link-outline',
      description: 'مركز المساعدة، والسياسات والشروط، ومعلومات عن سرح.',
      rows: [
        {
          key: 'help-center',
          icon: 'lifebuoy',
          title: 'مركز المساعدة',
          description: 'الأسئلة الشائعة وتذاكر الدعم.',
          route: '/support',
          keywords: ['مساعدة', 'دعم', 'اسئلة', 'تذاكر'],
        },
        {
          key: 'contact',
          icon: 'mail-outline',
          title: 'تواصل معنا',
          description: 'راسل فريق سرح.',
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
          icon: 'shield-outline',
          title: 'سياسة الخصوصية',
          route: '/info/privacy',
          keywords: ['خصوصية', 'سياسة'],
        },
        {
          key: 'policies',
          icon: 'document-text-outline',
          title: 'السياسات والشروط',
          description: 'كل سياسات سرح في مكان واحد.',
          route: '/info/policies',
          keywords: ['سياسات', 'استرجاع', 'استرداد'],
        },
        {
          key: 'about',
          icon: 'information-circle-outline',
          title: 'عن سرح',
          route: '/info/about',
          keywords: ['من نحن', 'عن'],
        },
      ],
    },
  ]);
}

/** Hub row → where it goes: the single row of a `direct` section, else the section page. */
export function settingsSectionHref(group: SettingsGroup): string | null {
  if (group.direct && group.rows[0]?.route) return group.rows[0].route;
  return `/settings/section?key=${group.key}`;
}

/** «أزرق+» etc. for the account card and subscription row. */
export const TIER_LABEL_AR: Record<string, string> = {
  blue: 'أزرق',
  blue_plus: 'أزرق+',
  gold: 'ذهبي',
};
