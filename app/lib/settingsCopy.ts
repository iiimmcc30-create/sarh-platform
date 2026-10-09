import type { NotificationPrefKey } from '@/services/userSettings';

/** Copy for the inner settings pages (kept out of route files so tests can import it). */

/** Categories shown on the page (order + copy). Every pref key appears exactly once. */
export const NOTIFICATION_CATEGORIES: Array<{
  key: string;
  title: string;
  footer: string;
  prefs: NotificationPrefKey[];
}> = [
  {
    key: 'chats',
    title: 'المحادثات',
    footer: 'تنبيه عند وصول رسالة جديدة في محادثاتك الخاصة.',
    prefs: ['messages'],
  },
  {
    key: 'activity',
    title: 'التفاعل مع حسابك',
    footer: 'عندما يتابعك أحد أو يتفاعل مع منشوراتك وقصصك.',
    prefs: ['follows', 'interactions'],
  },
  {
    key: 'following',
    title: 'من تتابعهم',
    footer: 'جديد الحسابات التي تتابعها، وبدء المجالس والدعوات إليها.',
    prefs: ['followingPosts', 'councils'],
  },
  {
    key: 'sarh',
    title: 'من سرح',
    footer: 'العروض والتحديثات التسويقية من سرح.',
    prefs: ['offers'],
  },
];


/** «تحميل بياناتي»: what the export file contains (shown before and after preparing). */
export const EXPORT_INCLUDED: Array<{ key: string; icon: string; title: string; hint: string }> = [
  { key: 'account', icon: 'person-outline', title: 'معلومات الحساب', hint: 'الاسم واسم المستخدم والجوال والبريد' },
  { key: 'listings', icon: 'pricetag-outline', title: 'الإعلانات', hint: 'إعلاناتك الحالية والسابقة' },
  { key: 'posts', icon: 'newspaper-outline', title: 'المنشورات', hint: 'ما نشرته في الحساب' },
  { key: 'comments', icon: 'chatbubble-outline', title: 'التعليقات', hint: 'تعليقاتك على المنشورات والإعلانات' },
  { key: 'follows', icon: 'people-outline', title: 'المتابعات', hint: 'من تتابعهم ومن يتابعونك' },
  { key: 'payments', icon: 'card-outline', title: 'المدفوعات', hint: 'سجل عمليات الدفع' },
  { key: 'support', icon: 'help-circle-outline', title: 'تذاكر الدعم', hint: 'مراسلاتك مع فريق الدعم' },
];

export type AudienceKind = 'messages' | 'comments' | 'following';

type AudiencePrivacy = {
  allowPrivateMessages: boolean;
  privateMessagesAudience: 'everyone' | 'following' | 'followers';
  commentsAudience: 'everyone' | 'followers';
  showFollowingList: boolean;
};

/**
 * «الخصوصية» audience pages (من يمكنه مراسلتي / التعليق / قائمة المتابعات):
 * checkmark options + a footnote. Option labels match the hub row values.
 */
export const AUDIENCE_PAGES: Record<
  AudienceKind,
  {
    title: string;
    header: string;
    footer: string;
    options: Array<{ key: string; label: string; hint?: string; icon: string }>;
  }
> = {
  messages: {
    title: 'من يمكنه مراسلتي',
    header: 'الرسائل الخاصة',
    footer:
      'يحدد من يستطيع مراسلتك في الخاص. يمكنك دائماً حظر أي حساب أو كتمه من «الحسابات المحظورة».',
    options: [
      { key: 'everyone', label: 'الجميع', hint: 'أي حساب في سرح', icon: 'globe-outline' },
      { key: 'followers', label: 'متابعيني', hint: 'الحسابات التي تتابعك', icon: 'people-outline' },
      { key: 'following', label: 'من أتابعهم', hint: 'الحسابات التي تتابعها أنت', icon: 'person-add-outline' },
      { key: 'nobody', label: 'لا أحد', hint: 'إيقاف الرسائل الخاصة', icon: 'lock-outline' },
    ],
  },
  comments: {
    title: 'من يمكنه التعليق',
    header: 'التعليقات على منشوراتك وإعلاناتك',
    footer: 'ينطبق على منشوراتك وإعلاناتك. يمكنك أيضاً حذف أي تعليق أو حظر صاحبه.',
    options: [
      { key: 'everyone', label: 'الجميع', hint: 'أي حساب في سرح', icon: 'globe-outline' },
      { key: 'followers', label: 'المتابعون', hint: 'الحسابات التي تتابعك فقط', icon: 'people-outline' },
    ],
  },
  following: {
    title: 'من يرى قائمة متابعاتي',
    header: 'قائمة الحسابات التي تتابعها',
    footer: 'عند اختيار «أنت فقط» لا يستطيع الآخرون فتح قائمة من تتابعهم من ملفك الشخصي.',
    options: [
      { key: 'public', label: 'الجميع', hint: 'يراها زوار ملفك الشخصي', icon: 'eye-outline' },
      { key: 'private', label: 'أنت فقط', hint: 'مخفية عن الآخرين', icon: 'eye-off-outline' },
    ],
  },
};

export function isAudienceKind(v: unknown): v is AudienceKind {
  return v === 'messages' || v === 'comments' || v === 'following';
}

/** Which option is currently checked. */
export function audienceSelected(kind: AudienceKind, p: AudiencePrivacy): string {
  if (kind === 'messages') return p.allowPrivateMessages ? p.privateMessagesAudience : 'nobody';
  if (kind === 'comments') return p.commentsAudience;
  return p.showFollowingList ? 'public' : 'private';
}

/** Privacy patch for a chosen option (same patches the old option sheet sent). */
export function audiencePatch(kind: AudienceKind, key: string): Partial<AudiencePrivacy> | null {
  if (kind === 'messages') {
    if (key === 'nobody') return { allowPrivateMessages: false };
    if (key === 'everyone' || key === 'followers' || key === 'following') {
      return { privateMessagesAudience: key, allowPrivateMessages: true };
    }
    return null;
  }
  if (kind === 'comments') {
    return key === 'everyone' || key === 'followers' ? { commentsAudience: key } : null;
  }
  if (key === 'public') return { showFollowingList: true };
  if (key === 'private') return { showFollowingList: false };
  return null;
}
