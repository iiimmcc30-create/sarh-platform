import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { buildSettingsGroups, type SettingsContext } from '../lib/settingsRows';
import { filterSettingsGroups, normalizeArabic } from '../lib/settingsSearch';
import {
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
    expect(plain[0].rows[0].title).toBe('ترقية الحساب');
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

  it('pickers use the shared option picker and messages offer followers', () => {
    const home = src('components/settings/SettingsHomeScreen.tsx');
    expect(home).toContain('presentOptionPicker');
    expect(home).toContain('followers');
    expect(src('services/users.ts')).toContain("'followers'");
  });

  it('account deletion asks again on its own page', () => {
    const page = src('app/settings/delete-account.tsx');
    expect(page).toContain('presentConfirm');
    expect(page).toContain('deleteAccount');
    expect(src('app/profile/settings/account.tsx')).not.toContain('deleteAccount');
  });
});
