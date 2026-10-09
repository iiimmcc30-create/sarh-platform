import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { buildSettingsGroups, type SettingsContext } from '../lib/settingsRows';
import { filterSettingsGroups, normalizeArabic } from '../lib/settingsSearch';
import {
  AUDIENCE_PAGES,
  EXPORT_INCLUDED,
  NOTIFICATION_CATEGORIES,
  audiencePatch,
  audienceSelected,
} from '../lib/settingsCopy';
import {
  formatPaymentAmount,
  groupPaymentsByMonth,
  paymentStatusTone,
  paymentType,
} from '../lib/paymentHistory';
import {
  NOTIFICATION_PREF_KEYS,
  publicIpLabel,
  type PaymentRecord,
  normalizeNotificationSettings,
  notificationsSummary,
  summarizeExport,
} from '../services/userSettings';

const root = path.join(__dirname, '..');
const src = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

const ctx = (over: Partial<SettingsContext> = {}): SettingsContext => ({
  subscription: { planLabel: null, until: null, trialEligible: true, trialActive: false },
  phone: '0500000000',
  email: null,
  sessionsCount: 2,
  privacy: { messages: 'الجميع', comments: 'الجميع', followingList: 'الجميع', showInSearch: true },
  blockedCount: 0,
  mutedCount: 3,
  isSubscriber: false,
  notificationsValue: 'الكل',
  appearanceValue: 'تلقائي',
  appVersion: '1.2.3 (45)',
  ...over,
});

/** `/settings/muted` → app/settings/muted.tsx (or …/index.tsx, or a (group) route). */
function routeFileExists(route: string): boolean {
  const clean = route.split('?')[0].replace(/^\//, '');
  const base = path.join(root, 'app', clean);
  return [`${base}.tsx`, path.join(base, 'index.tsx')].some((f) => existsSync(f));
}

describe('settings home groups', () => {
  const groups = buildSettingsGroups(ctx());

  it('keeps the target order', () => {
    expect(groups.map((g) => g.key)).toEqual([
      'subscription',
      'account',
      'privacy',
      'notifications',
      'listings',
      'appearance',
      'help',
      'session',
    ]);
  });

  it('every row either navigates to an existing screen or runs a known action', () => {
    for (const group of groups) {
      for (const row of group.rows) {
        expect({ key: row.key, wired: Boolean(row.route || row.action) }).toEqual({ key: row.key, wired: true });
        if (row.route) expect({ route: row.route, exists: routeFileExists(row.route) }).toEqual({ route: row.route, exists: true });
      }
    }
  });

  it('has no duplicate row keys', () => {
    const keys = groups.flatMap((g) => g.rows.map((r) => `${g.key}/${r.key}`));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('ends with logout and an inner delete-account page, both muted red, plus the version', () => {
    const last = groups[groups.length - 1];
    expect(last.rows.map((r) => r.key)).toEqual(['logout', 'delete-account']);
    expect(last.rows.every((r) => r.tone === 'danger')).toBe(true);
    expect(last.rows[1].route).toBe('/settings/delete-account');
    expect(last.footer).toContain('1.2.3 (45)');
  });

  it('help links to the shared /support hub', () => {
    const help = groups.find((g) => g.key === 'help')!;
    expect(help.rows[0].route).toBe('/support');
  });

  it('shows the active plan or an upgrade/trial entry', () => {
    const subscribed = buildSettingsGroups(
      ctx({ subscription: { planLabel: 'ذهبي', until: 'حتى ١ نوفمبر', trialEligible: false, trialActive: false } }),
    );
    expect(subscribed[0].rows[0].value).toBe('ذهبي · حتى ١ نوفمبر');
    expect(groups[0].rows[0].title).toContain('مجاناً');
    const plain = buildSettingsGroups(ctx({ subscription: { planLabel: null, until: null, trialEligible: false, trialActive: false } }));
    expect(plain[0].rows[0].title).toBe('توثيق الحساب');
  });

  it('shows counts only when there is something to count', () => {
    const privacy = groups.find((g) => g.key === 'privacy')!;
    expect(privacy.rows.find((r) => r.key === 'blocked')!.value).toBeUndefined();
    expect(privacy.rows.find((r) => r.key === 'muted')!.value).toBe('3');
  });
});

describe('settings search', () => {
  const groups = buildSettingsGroups(ctx());

  it('normalizes Arabic letter forms and the article', () => {
    expect(normalizeArabic('الإشعارات')).toBe(normalizeArabic('اشعارات'));
    expect(normalizeArabic('كلمة المرور')).toBe(normalizeArabic('كلمه مرور'));
  });

  it('filters rows and drops empty groups', () => {
    const out = filterSettingsGroups(groups, 'كتم');
    expect(out).toHaveLength(1);
    expect(out[0].rows.map((r) => r.key)).toEqual(['muted']);
  });

  it('matches keywords and returns everything for an empty query', () => {
    expect(filterSettingsGroups(groups, 'باسورد')[0].rows[0].key).toBe('password');
    expect(filterSettingsGroups(groups, '   ')).toBe(groups);
    expect(filterSettingsGroups(groups, 'zzzz')).toEqual([]);
  });
});

describe('notification prefs client', () => {
  it('defaults missing keys to on and respects the master switch', () => {
    const s = normalizeNotificationSettings({ notificationsEnabled: true, prefs: { messages: false } })!;
    expect(s.prefs.messages).toBe(false);
    expect(s.prefs.follows).toBe(true);
    expect(notificationsSummary(s)).toBe('5 من 6');
    expect(notificationsSummary({ ...s, notificationsEnabled: false })).toBe('متوقفة');
    expect(notificationsSummary(normalizeNotificationSettings({ prefs: {} }))).toBe('الكل');
    expect(normalizeNotificationSettings(null)).toBeNull();
  });

  it('summarizes the data export', () => {
    const rows = summarizeExport({ listings: [1, 2], comments: { posts: [1], listings: [1, 2] }, payments: [] });
    expect(rows.find((r) => r.label === 'الإعلانات')!.count).toBe(2);
    expect(rows.find((r) => r.label === 'التعليقات')!.count).toBe(3);
    expect(summarizeExport(null)).toEqual([]);
  });
});

describe('settings screens wiring', () => {
  it('both settings entry routes render the same home', () => {
    expect(src('app/settings/index.tsx')).toContain('SettingsHomeScreen');
    expect(src('app/profile/settings/index.tsx')).toContain('SettingsHomeScreen');
  });

  it('the old split privacy / account screens redirect to the home', () => {
    expect(src('app/profile/settings/privacy.tsx')).toContain('<Redirect');
    expect(src('app/settings/account.tsx')).toContain('<Redirect');
  });

  it('privacy audiences open their own checkmark page and messages offer followers', () => {
    const home = src('components/settings/SettingsHomeScreen.tsx');
    expect(home).not.toContain("case 'messages-audience'");
    const privacy = buildSettingsGroups(ctx()).find((g) => g.key === 'privacy')!;
    const routes = Object.fromEntries(privacy.rows.map((r) => [r.key, r.route]));
    expect(routes['messages-audience']).toBe('/settings/audience?kind=messages');
    expect(routes['comments-audience']).toBe('/settings/audience?kind=comments');
    expect(routes['following-list']).toBe('/settings/audience?kind=following');
    expect(AUDIENCE_PAGES.messages.options.map((o) => o.key)).toEqual(['everyone', 'followers', 'following', 'nobody']);
    expect(src('services/users.ts')).toContain("'followers'");
  });

  it('account deletion asks again on its own page', () => {
    const page = src('app/settings/delete-account.tsx');
    expect(page).toContain('presentConfirm');
    expect(page).toContain('deleteAccount');
    expect(src('app/profile/settings/account.tsx')).not.toContain('deleteAccount');
  });
});

describe('settings inner pages (iOS inset-grouped)', () => {
  const SAVE_PAGES = [
    'app/profile/settings/account.tsx',
    'app/profile/settings/password.tsx',
    'app/profile/settings/change-phone.tsx',
  ];
  const AUTO_PAGES = [
    'app/settings/notifications.tsx',
    'app/settings/blocked.tsx',
    'app/settings/muted.tsx',
    'app/settings/sessions.tsx',
    'app/settings/payments.tsx',
    'app/settings/export.tsx',
    'app/settings/delete-account.tsx',
    'app/settings/audience.tsx',
    'app/settings/payment.tsx',
  ];

  it('every inner page uses the shared settings shell, no legacy header or cards', () => {
    for (const file of [...SAVE_PAGES, ...AUTO_PAGES]) {
      const text = src(file);
      expect(text).toContain('<SettingsScreen');
      expect(text).not.toContain('ScreenHeader');
      expect(text).not.toContain('SarhCard');
      expect(text).not.toContain('SarhButton');
    }
    expect(src('components/ui/SettingsMenuScreen.tsx')).toContain('<SettingsScreen title={title} largeTitle');
  });

  it('edit forms save from the top-left bar, dim until changed, and guard unsaved edits', () => {
    for (const file of SAVE_PAGES) {
      const text = src(file);
      expect(text).toMatch(/save=\{/);
      expect(text).toContain('useUnsavedChangesGuard');
      expect(text).toContain('useSettingsSave');
    }
    expect(src('app/profile/settings/account.tsx')).toContain('enabled: dirty');
    expect(src('app/profile/settings/account.tsx')).toContain('updateAccountSettings(patch, user?.id)');
    expect(src('app/profile/settings/password.tsx')).toContain('/api/auth/change-password');
    expect(src('app/profile/settings/change-phone.tsx')).toContain("label: 'إرسال'");
    expect(src('app/profile/settings/change-phone.tsx')).toContain("label: 'تأكيد'");
  });

  it('toggle and list pages apply instantly (no «حفظ»)', () => {
    for (const file of AUTO_PAGES) expect(src(file)).not.toMatch(/save=\{/);
    expect(src('app/settings/notifications.tsx')).toContain('updateNotificationSettings(patch)');
  });

  it('the save bar: back on the inline start, «حفظ» on the end, spinner while saving, discard prompt', () => {
    const shell = src('components/settings/SettingsScreen.tsx');
    expect(shell).toContain('getRtlRow()');
    expect(shell.indexOf('<SarhBackButton')).toBeLessThan(shell.indexOf('testID="settings-save"'));
    expect(shell).toContain('<ActivityIndicator');
    expect(shell).toContain('usePreventRemove');
    expect(shell).toContain('تجاهل التغييرات');
    expect(shell).toContain("color={enabled ? 'textPrimary' : 'textMuted'}");
    expect(shell).not.toMatch(/LinearGradient|shadowOpacity|elevation:/);
  });

  it('selection rows show a checkmark instead of a radio', () => {
    const row = src('design-system/components/SarhSettingsRow.tsx');
    expect(row).toContain('checked?: boolean');
    expect(row).toContain('name="checkmark"');
    expect(src('app/settings/delete-account.tsx')).toContain('checked={understood}');
  });
});

describe('settings follow-up: account card, audience, notifications, devices, export, payments', () => {
  it('the hub card shows the name in a themed DS text and no «حساب مجاني» line', () => {
    const card = src('components/settings/SettingsAccountCard.tsx');
    expect(card).toContain('color="textPrimary"');
    expect(card).toContain('testID="settings-account-name"');
    expect(card).toContain('planLine ? (');
    const home = src('components/settings/SettingsHomeScreen.tsx');
    expect(home).not.toContain('حساب مجاني');
  });

  it('the subscription entry reads «توثيق الحساب», never «ترقية الحساب»', () => {
    const rows = src('lib/settingsRows.ts');
    expect(rows).toContain("'توثيق الحساب'");
    expect(rows).not.toContain('ترقية الحساب');
  });

  it('audience selection maps to the same privacy patches as before', () => {
    const p = {
      allowPrivateMessages: true,
      privateMessagesAudience: 'everyone' as const,
      commentsAudience: 'everyone' as const,
      showFollowingList: true,
    };
    expect(audienceSelected('messages', p)).toBe('everyone');
    expect(audienceSelected('messages', { ...p, allowPrivateMessages: false })).toBe('nobody');
    expect(audienceSelected('following', { ...p, showFollowingList: false })).toBe('private');
    expect(audiencePatch('messages', 'nobody')).toEqual({ allowPrivateMessages: false });
    expect(audiencePatch('messages', 'followers')).toEqual({ privateMessagesAudience: 'followers', allowPrivateMessages: true });
    expect(audiencePatch('comments', 'followers')).toEqual({ commentsAudience: 'followers' });
    expect(audiencePatch('following', 'private')).toEqual({ showFollowingList: false });
    expect(audiencePatch('comments', 'nobody')).toBeNull();
    const page = src('app/settings/audience.tsx');
    expect(page).toContain('checked={selected === option.key}');
    expect(page).toContain('updatePrivacySettings(patch, user?.id, previous)');
    for (const kind of ['messages', 'comments', 'following'] as const) expect(AUDIENCE_PAGES[kind].footer.length).toBeGreaterThan(10);
  });

  it('notification categories cover every preference exactly once, each with a footer', () => {
    const keys = NOTIFICATION_CATEGORIES.flatMap((c) => c.prefs);
    expect([...keys].sort()).toEqual([...NOTIFICATION_PREF_KEYS].sort());
    for (const c of NOTIFICATION_CATEGORIES) expect(c.footer.length).toBeGreaterThan(5);
  });

  it('device cards: this-device badge, last activity, per-device and bulk sign-out', () => {
    const card = src('components/settings/SessionDeviceCard.tsx');
    expect(card).toContain('هذا الجهاز');
    expect(card).toContain('sessionActivityLabel');
    const page = src('app/settings/sessions.tsx');
    expect(page).toContain('revokeSession(session.id)');
    expect(page).toContain('revokeOtherSessions()');
    expect(page).toContain('تسجيل الخروج من جميع الأجهزة الأخرى');
    expect(publicIpLabel('172.18.0.5')).toBeNull();
    expect(publicIpLabel('10.0.0.1')).toBeNull();
    expect(publicIpLabel('::ffff:192.168.1.4')).toBeNull();
    expect(publicIpLabel('51.36.10.20')).toBe('51.36.10.20');
  });

  it('export page explains, lists what is included and shows the request status', () => {
    const page = src('app/settings/export.tsx');
    expect(page).toContain('<SettingsHero');
    expect(page).toContain('EXPORT_INCLUDED.map');
    expect(page).toContain('testID="export-status"');
    expect(EXPORT_INCLUDED.length).toBeGreaterThanOrEqual(6);
  });

  it('payments group by month with type icon, amount and status pill, and open a detail page', () => {
    const pay = (id: string, at: string, over: Partial<PaymentRecord> = {}): PaymentRecord => ({
      id,
      orderId: `o-${id}`,
      amount: 10,
      currency: 'SAR',
      status: 'paid',
      method: 'mada',
      createdAt: at,
      ...over,
    });
    const groups = groupPaymentsByMonth([
      pay('a', '2026-08-03T10:00:00Z'),
      pay('b', '2026-10-01T10:00:00Z', { referenceType: 'featured_ad' }),
      pay('c', '2026-10-05T10:00:00Z'),
    ]);
    expect(groups.map((g) => g.key)).toEqual(['2026-10', '2026-08']);
    expect(groups[0].items.map((p) => p.id)).toEqual(['c', 'b']);
    expect(groups[0].label).toBe('أكتوبر 2026');
    expect(paymentType({ referenceType: 'featured_ad' }).icon).toBe('star-outline');
    expect(paymentType({ referenceType: 'unknown' }).icon).toBe('card-outline');
    expect(paymentStatusTone('failed')).toBe('danger');
    expect(formatPaymentAmount({ amount: 10, currency: 'SAR' })).toContain('ر.س');
    const list = src('app/settings/payments.tsx');
    expect(list).toContain('/settings/payment?id=');
    expect(list).toContain('<SettingsPill');
    expect(list).toContain('لا توجد مدفوعات بعد');
    expect(existsSync(path.join(root, 'app/settings/payment.tsx'))).toBe(true);
  });
});
