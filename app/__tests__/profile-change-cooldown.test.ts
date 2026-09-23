import { formatCalendarDateAr } from '../lib/formatDateTime';
import { profileNameHint, profileUsernameHint } from '../lib/profileChangeCooldown';

describe('profile change cooldown copy', () => {
  it('formats the backend nextAllowedAt as a Gregorian Arabic date', () => {
    expect(formatCalendarDateAr(new Date(2026, 8, 29))).toBe('29 سبتمبر 2026');
    expect(formatCalendarDateAr(new Date(2026, 9, 22))).toBe('22 أكتوبر 2026');
  });

  it('shows the name cooldown rule when change is allowed', () => {
    expect(profileNameHint(null)).toBe('يمكنك تغيير اسمك مرة واحدة كل 7 أيام.');
    expect(profileNameHint(undefined)).toBe('يمكنك تغيير اسمك مرة واحدة كل 7 أيام.');
  });

  it('shows the backend next allowed name date', () => {
    expect(profileNameHint(new Date(2026, 8, 29).toISOString())).toBe(
      `يمكنك تغيير اسمك مرة أخرى في ${formatCalendarDateAr(new Date(2026, 8, 29))}.`,
    );
  });

  it('shows the username cooldown rule when change is allowed', () => {
    expect(profileUsernameHint(null)).toBe(
      'يمكنك تغيير اسم المستخدم مرة واحدة كل 30 يومًا.',
    );
  });

  it('shows the backend next allowed username date', () => {
    expect(profileUsernameHint(new Date(2026, 9, 22).toISOString())).toBe(
      `يمكنك تغيير اسم المستخدم مرة أخرى في ${formatCalendarDateAr(new Date(2026, 9, 22))}.`,
    );
  });
});
