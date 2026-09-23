import { localeUsesRtl, normalizeAppLocale, DEFAULT_LOCALE } from '@/lib/locale';
import {
  categoryRequiresWeight,
  isLivestockCategory,
  isSlaughterCategory,
  LIVESTOCK_CATEGORIES,
} from '@/lib/listingCategories';
import {
  canDeleteComment,
  canManageAsOwner,
  isSameUser,
  normalizeAuthUser,
  resolveCurrentUserId,
} from '@/lib/currentUser';

describe('locale', () => {
  it('defaults Arabic and treats only ar as RTL', () => {
    expect(DEFAULT_LOCALE).toBe('ar');
    expect(localeUsesRtl('ar')).toBe(true);
    expect(localeUsesRtl('en')).toBe(false);
  });

  it('normalizes unknown/null locales to ar', () => {
    expect(normalizeAppLocale('en')).toBe('en');
    expect(normalizeAppLocale('ar')).toBe('ar');
    expect(normalizeAppLocale(null)).toBe('ar');
    expect(normalizeAppLocale(undefined)).toBe('ar');
    expect(normalizeAppLocale('fr')).toBe('ar');
  });
});

describe('listingCategories', () => {
  it('identifies livestock vs non-livestock', () => {
    for (const cat of LIVESTOCK_CATEGORIES) {
      expect(isLivestockCategory(cat)).toBe(true);
    }
    expect(isLivestockCategory('feed')).toBe(false);
    expect(isLivestockCategory('equipment')).toBe(false);
    expect(isLivestockCategory(null)).toBe(false);
    expect(isLivestockCategory(undefined)).toBe(false);
  });

  it('requires weight for ذبائح parents and carcass slugs', () => {
    expect(isSlaughterCategory('slaughter')).toBe(true);
    expect(isSlaughterCategory('sheep-carcass')).toBe(true);
    expect(isSlaughterCategory('slaughter-other')).toBe(true);
    expect(isSlaughterCategory('sheep')).toBe(false);
    expect(categoryRequiresWeight({ category: 'slaughter' })).toBe(true);
    expect(categoryRequiresWeight({ category: 'sheep-carcass' })).toBe(true);
    expect(categoryRequiresWeight({ category: 'sheep' })).toBe(false);
    expect(categoryRequiresWeight({ category: 'sheep', requiresWeight: true })).toBe(true);
  });
});

describe('currentUser helpers', () => {
  it('normalizes legacy userId into id', () => {
    expect(normalizeAuthUser({ userId: 'u-1', displayName: 'A' })).toEqual({
      userId: 'u-1',
      displayName: 'A',
      id: 'u-1',
    });
    expect(normalizeAuthUser({ id: 'u-2' }).id).toBe('u-2');
  });

  it('resolves current user id from auth or me', () => {
    expect(resolveCurrentUserId({ id: 'a' }, { id: 'b' })).toBe('a');
    expect(resolveCurrentUserId({ userId: 'legacy' }, { id: 'b' })).toBe('legacy');
    expect(resolveCurrentUserId(null, { id: 'b' })).toBe('b');
    expect(resolveCurrentUserId(null, null)).toBe('');
  });

  it('compares users and ownership precisely', () => {
    expect(isSameUser(' x ', 'x')).toBe(true);
    expect(isSameUser('', 'x')).toBe(false);
    expect(canManageAsOwner('owner', { id: 'owner' } as any, null)).toBe(true);
    expect(canManageAsOwner('owner', { id: 'other' } as any, null)).toBe(false);
  });

  it('allows comment delete for author or resource owner', () => {
    const me = { id: 'me' };
    expect(canDeleteComment('me', 'seller', null, me)).toBe(true);
    expect(canDeleteComment('other', 'me', null, me)).toBe(true);
    expect(canDeleteComment('other', 'seller', null, me)).toBe(false);
    expect(canDeleteComment('other', 'seller', null, null)).toBe(false);
  });
});
