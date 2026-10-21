import {
  LISTING_LIST_DESC_MAX,
  LISTING_LIST_IMAGE_MAX,
  LISTING_PAGE_SIZE,
  trimListingForList,
} from './listing-list-payload';

describe('trimListingForList', () => {
  it('drops ranking-only and editor-only fields and clips long copy', () => {
    const long = 'أ'.repeat(LISTING_LIST_DESC_MAX + 40);
    const trimmed = trimListingForList({
      id: 'l1',
      arabicDescription: long,
      description: 'short',
      images: Array.from({ length: 10 }, (_, i) => `https://cdn/${i}.jpg`),
      videoWidth: 1920,
      covenantAccepted: true,
      seller: {
        id: 'u1',
        username: 'ali',
        subscription: { planId: 'gold' },
      },
      marketCategory: { id: 'c1', nameAr: 'أغنام', emoji: '🐑', icon: 'sheep' },
    });

    expect(trimmed.arabicDescription).toHaveLength(LISTING_LIST_DESC_MAX);
    expect(trimmed.description).toBe('short');
    expect(trimmed.images).toHaveLength(LISTING_LIST_IMAGE_MAX);
    expect(trimmed).not.toHaveProperty('videoWidth');
    expect(trimmed).not.toHaveProperty('covenantAccepted');
    expect(trimmed.seller).toEqual({ id: 'u1', username: 'ali' });
    expect(trimmed.marketCategory).toEqual({ id: 'c1', nameAr: 'أغنام' });
    expect(LISTING_PAGE_SIZE).toBe(20);
  });

  it('is idempotent', () => {
    const once = trimListingForList({
      id: 'l1',
      description: 'hi',
      images: ['a'],
    });
    expect(trimListingForList(once)).toEqual(once);
  });
});
