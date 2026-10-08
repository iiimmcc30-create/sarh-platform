// Pure helpers behind the subscription perks: «بائع ذهبي», «من شاهد ملفك»,
// «تمييز مجاني» and scheduled councils. The server owns every gate; these only
// mirror its answers in the UI.
jest.mock('@/services/api', () => ({ API_BASE: 'https://api.test' }));
jest.mock('@/services/authFetch', () => ({ authFetch: jest.fn() }));
jest.mock('@/constants/sarhOfficial', () => ({ SARH_OFFICIAL_SITE: 'https://sarh.test' }));

import { GOLD_SELLER_LABEL, goldSellersFirstInRegion, isGoldSeller } from '@/lib/goldSeller';
import { normalizeProfileViews, profileViewsSummary } from '@/services/profileViews';
import { freeBoostSubtitle, freeBoostTitle, normalizeFreeBoostQuota } from '@/services/freeBoost';
import {
  COUNCIL_SCHEDULE_MIN_LEAD_MS,
  councilDayLabel,
  councilErrorMessage,
  councilScheduleDays,
  councilScheduleSlots,
  councilTimeLabel,
  CouncilApiError,
  isValidCouncilSchedule,
} from '@/services/councils';

describe('gold seller', () => {
  it('needs a verified gold badge', () => {
    expect(GOLD_SELLER_LABEL).toBe('بائع ذهبي');
    expect(isGoldSeller({ verified: true, verifiedTier: 'gold' })).toBe(true);
    expect(isGoldSeller({ verified: false, verifiedTier: 'gold' })).toBe(false);
    expect(isGoldSeller({ verified: true, verifiedTier: 'blue_plus' })).toBe(false);
    expect(isGoldSeller(null)).toBe(false);
  });

  it('puts gold sellers first, keeps pins on top and order stable', () => {
    const future = new Date(Date.now() + 3_600_000).toISOString();
    const list = [
      { id: 'a', seller: { verified: true, verifiedTier: 'blue' } },
      { id: 'g1', seller: { verified: true, verifiedTier: 'gold' } },
      { id: 'p', pinned: true, pinnedUntil: future, seller: {} },
      { id: 'b', seller: null },
      { id: 'g2', seller: { verified: true, verifiedTier: 'gold' } },
    ];
    expect(goldSellersFirstInRegion(list).map((l) => l.id)).toEqual(['p', 'g1', 'g2', 'a', 'b']);
  });

  it('returns the list unchanged when there is no gold seller', () => {
    const list = [
      { id: 'x', seller: null },
      { id: 'y', pinned: false },
    ];
    expect(goldSellersFirstInRegion(list).map((l) => l.id)).toEqual(['x', 'y']);
  });
});

describe('profile views', () => {
  it('never exposes identities while locked', () => {
    const r = normalizeProfileViews({
      locked: true,
      total: 7,
      windowDays: 30,
      viewers: [{ user: { id: 'u' }, viewedAt: '2026-10-01T00:00:00Z' }],
    });
    expect(r).toEqual({ locked: true, windowDays: 30, total: 7, viewers: [] });
  });

  it('keeps valid viewers when unlocked', () => {
    const r = normalizeProfileViews({
      locked: false,
      total: 2,
      viewers: [{ user: { id: 'u1', username: 'a' }, viewedAt: '2026-10-01T00:00:00Z' }, { bad: true }],
    });
    expect(r?.locked).toBe(false);
    expect(r?.viewers.map((v) => v.user.id)).toEqual(['u1']);
  });

  it('summarises counts in Arabic', () => {
    expect(profileViewsSummary(0)).toContain('لم يشاهد أحد');
    expect(profileViewsSummary(2)).toContain('شخصان');
    expect(profileViewsSummary(12)).toContain('12 شخصاً');
  });
});

describe('free weekly boost', () => {
  it('is ineligible without a weekly limit', () => {
    expect(normalizeFreeBoostQuota({ eligible: true, weeklyLimit: 0 })?.eligible).toBe(false);
    expect(normalizeFreeBoostQuota(null)).toBeNull();
  });

  it('normalises the quota', () => {
    const q = normalizeFreeBoostQuota({ eligible: true, weeklyLimit: 4, used: 1, remaining: 3, durationHours: 24 });
    expect(q).toMatchObject({ eligible: true, weeklyLimit: 4, used: 1, remaining: 3, boostType: 'featured' });
  });

  it('formats the title and subtitle', () => {
    expect(freeBoostTitle(2)).toBe('تمييز مجاني (متبقي 2)');
    expect(freeBoostSubtitle({ remaining: 1, durationHours: 24, nextResetAt: null })).toContain('24 ساعة');
    const now = new Date('2026-10-08T10:00:00Z');
    expect(
      freeBoostSubtitle({ remaining: 0, durationHours: 24, nextResetAt: '2026-10-11T09:00:00Z' }, now),
    ).toContain('3 أيام');
  });
});

describe('scheduled councils', () => {
  const now = new Date(2026, 9, 8, 21, 10); // local 21:10

  it('offers only slots after the minimum lead time', () => {
    const today = councilScheduleSlots(councilScheduleDays(now)[0], now);
    expect(today.length).toBeGreaterThan(0);
    expect(today[0].getTime() - now.getTime()).toBeGreaterThanOrEqual(COUNCIL_SCHEDULE_MIN_LEAD_MS);
    expect(today[0].getHours()).toBe(21);
    expect(today[0].getMinutes()).toBe(30);
    expect(councilScheduleSlots(councilScheduleDays(now)[1], now)).toHaveLength(48);
  });

  it('validates the schedule window', () => {
    expect(isValidCouncilSchedule(new Date(now.getTime() + 60_000), now)).toBe(false);
    expect(isValidCouncilSchedule(new Date(now.getTime() + 3_600_000), now)).toBe(true);
    expect(isValidCouncilSchedule(new Date(now.getTime() + 15 * 86_400_000), now)).toBe(false);
    expect(isValidCouncilSchedule(null, now)).toBe(false);
  });

  it('labels days and times in Arabic', () => {
    expect(councilDayLabel(new Date(2026, 9, 8, 23), now)).toBe('اليوم');
    expect(councilDayLabel(new Date(2026, 9, 9, 1), now)).toBe('غداً');
    expect(councilTimeLabel(new Date(2026, 9, 8, 21, 30))).toBe('9:30 م');
    expect(councilTimeLabel(new Date(2026, 9, 8, 0, 5))).toBe('12:05 ص');
  });

  it('maps the new council error codes', () => {
    expect(councilErrorMessage(new CouncilApiError('x', 403, 'council_followers_only'))).toContain('للمتابعين فقط');
    expect(councilErrorMessage(new CouncilApiError('x', 409, 'council_not_started'))).toBe('لم يبدأ المجلس بعد');
    expect(councilErrorMessage(new CouncilApiError('رسالة الخادم', 403, 'perk_required'))).toBe('رسالة الخادم');
  });
});
