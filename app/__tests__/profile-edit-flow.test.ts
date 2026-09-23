import { readFileSync } from 'fs';
import path from 'path';

const root = path.join(__dirname, '..');

function src(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8');
}

describe('profile edit redesign', () => {
  const hub = src('app/profile/edit/index.tsx');
  const field = src('components/feature/ProfileFieldEditScreen.tsx');
  const route = src('app/profile/edit/[field].tsx');

  it('centers the avatar and uses a display-only account card', () => {
    expect(hub).toContain('styles.avatarBlock');
    expect(hub).toContain('alignItems: \'center\'');
    expect(hub).toContain('تعديل الصورة أو الأفاتار');
    expect(hub).toContain('SarhCard');
    expect(hub).toContain('label="الاسم"');
    expect(hub).toContain('label="اسم المستخدم"');
    expect(hub).toContain('label="رابط الملف الشخصي"');
    expect(hub).toContain('label="السيرة الذاتية"');
    expect(hub).toContain('معلومات أساسية');
    expect(hub).toContain('inline');
    expect(hub).toContain('infoRowSpacer');
    expect(hub).toContain('valueAlign="center"');
    expect(hub).toContain('infoValueCenter');
    expect(hub).not.toContain('SarhInput');
    expect(hub).not.toContain('BottomAction');
  });

  it('opens dedicated name, username, and bio screens and keeps the URL as copy-only', () => {
    expect(hub).toContain("openField('name')");
    expect(hub).toContain("openField('username')");
    expect(hub).toContain("openField('bio')");
    expect(hub).toContain('copyToClipboard');
    expect(hub).toContain('sarhProfileShareUrl');
    expect(hub).toContain("trailing=\"copy\"");
    expect(route).toContain('ProfileFieldEditScreen');
    expect(field).toContain("title: 'الاسم'");
    expect(field).toContain("title: 'اسم المستخدم'");
    expect(field).toContain("title: 'السيرة الذاتية'");
  });

  it('reuses updateMe and keeps current field rules', () => {
    expect(hub).toContain('updateMe');
    expect(field).toContain('updateMe');
    expect(field).toContain("value.replace(/\\s/g, '').toLowerCase()");
    expect(field).toContain('maxLength: 160');
    expect(field).toContain('يرجى ملء جميع الحقول المطلوبة');
    expect(field).toContain('accessibilityLabel="حفظ"');
    expect(field).toContain('accessibilityLabel="رجوع"');
    expect(field).not.toContain('authFetch');
  });

  it('shows name and username cooldown copy above SarhInput', () => {
    expect(field).toContain('profileNameHint');
    expect(field).toContain('profileUsernameHint');
    expect(field).toContain('nameNextAllowedAt');
    expect(field).toContain('usernameNextAllowedAt');
    expect(field.indexOf('{hint ?')).toBeLessThan(field.indexOf('<SarhInput'));
  });

  it('disables save during cooldown or a taken username and skips the update', () => {
    expect(field).toContain('saveBlocked');
    expect(field).toContain('if (saveBlocked) return;');
    expect(field).toContain('disabled={saving || saveBlocked}');
    expect(field).toContain("usernameAvailability === 'taken'");
  });

  it('checks username availability without racing older responses', () => {
    expect(field).toContain('useDebouncedValue');
    expect(field).toContain('createRequestGeneration');
    expect(field).toContain('checkUsernameAvailable');
    expect(field).toContain('اسم المستخدم متاح');
    expect(field).toContain('اسم المستخدم محجوز');
    expect(field).toContain('isCurrent(token)');
  });

  it('returns to the hub after a successful field save', () => {
    expect(field).toContain('router.back()');
    expect(hub).toContain('me.arabicName || me.displayName');
    expect(hub).toContain('me.username');
    expect(hub).toContain('me.bio');
  });
});
