import { readFileSync } from 'fs';
import path from 'path';
import {
  ABOUT_ACCOUNT_ROUTE,
  ABOUT_ACCOUNT_TITLE,
  aboutAccountRows,
  aboutCountryLabel,
  profileRatingInline,
} from '@/lib/aboutAccount';
import { formatArMonthYear, formatVerifiedSince } from '@/lib/verifiedBadge';

const root = path.join(__dirname, '..');
const src = (rel: string) => readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');

describe('profile rating inline «★ 4.8 (23)»', () => {
  it('one decimal average + count; null without reviews', () => {
    expect(profileRatingInline(4.8333, 23)).toEqual({ average: '4.8', count: '(23)' });
    expect(profileRatingInline(5, 1)).toEqual({ average: '5.0', count: '(1)' });
    expect(profileRatingInline(4.2, 1200)).toEqual({ average: '4.2', count: '(1,200)' });
    expect(profileRatingInline(null, 0)).toBeNull();
    expect(profileRatingInline(4, 0)).toBeNull();
    expect(profileRatingInline(undefined, undefined)).toBeNull();
  });
});

describe('«عن هذا الحساب» rows', () => {
  it('month-year formatting shared with the verified sheet', () => {
    expect(formatArMonthYear('2025-03-14T09:30:00.000Z')).toBe('مارس 2025');
    expect(formatArMonthYear(null)).toBeNull();
    expect(formatArMonthYear('nope')).toBeNull();
    expect(formatVerifiedSince('2026-09-10T12:00:00.000Z')).toBe('موثّق منذ سبتمبر 2026');
  });

  it('country comes from the stored User.country code only', () => {
    expect(aboutCountryLabel('SA')).toBe('السعودية');
    expect(aboutCountryLabel('AE')).toBe('الإمارات');
    expect(aboutCountryLabel('XX')).toBeNull();
    expect(aboutCountryLabel(null)).toBeNull();
  });

  it('joined → located in → verified (X order), with real values only', () => {
    const rows = aboutAccountRows({
      createdAt: '2025-03-14T09:30:00.000Z',
      country: 'SA',
      verified: true,
      verifiedSince: '2026-09-10T12:00:00.000Z',
    });
    expect(rows.map((r) => r.key)).toEqual(['joined', 'country', 'verified']);
    expect(rows[0]).toMatchObject({ title: 'تاريخ الانضمام', subtitle: 'مارس 2025', icon: 'calendar-outline' });
    expect(rows[1]).toMatchObject({ title: 'الحساب موجود في', subtitle: 'السعودية', icon: 'location-outline' });
    expect(rows[2]).toMatchObject({ title: 'مُوثّق', subtitle: 'منذ سبتمبر 2026' });
  });

  it('hides rows with no data; verified row only for verified accounts', () => {
    expect(aboutAccountRows({}).length).toBe(0);
    expect(aboutAccountRows({ verified: false, verifiedSince: '2026-09-10T12:00:00.000Z' })).toEqual([]);
    expect(aboutAccountRows({ verified: true })).toEqual([
      { key: 'verified', icon: null, title: 'مُوثّق', subtitle: null },
    ]);
  });

  it('screen: stack push, shared header with back, cached profile (no new tracking)', () => {
    const screen = src('app/profile/about.tsx');
    expect(ABOUT_ACCOUNT_ROUTE).toBe('/profile/about');
    expect(ABOUT_ACCOUNT_TITLE).toBe('عن هذا الحساب');
    expect(screen).toContain('<ScreenHeader variant="screen" title={ABOUT_ACCOUNT_TITLE} showBack />');
    expect(screen).toContain('aboutAccountRows(current)');
    expect(screen).toContain('getCachedUserProfile(id)');
    expect(screen).toContain('<VerificationBadge size={ABOUT_ROW_ICON} tier={current?.verifiedTier} />');
    expect(screen).not.toMatch(/expo-location|ipapi|ip-api|ipinfo|getCurrentPosition/i);
    expect(screen).not.toMatch(/linear-?gradient|shadowColor/i);
  });
});

describe('SarhButton strong emphasis', () => {
  it('bold label variant without changing the default', () => {
    const btn = src('design-system/components/SarhButton.tsx');
    expect(btn).toContain("emphasis = 'default',");
    expect(btn).toContain("emphasis === 'strong' ? STRONG_LABEL : null");
    expect(btn).toContain('const STRONG_LABEL = { fontFamily: fontFamily.bold, fontWeight: fontWeight.bold } as const;');
  });
});
