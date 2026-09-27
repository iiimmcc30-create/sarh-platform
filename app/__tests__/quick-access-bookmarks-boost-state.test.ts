import { readFileSync, existsSync } from 'fs';
import path from 'path';
import {
  effectiveListingPromotionWeight,
  isListingFeaturedActive,
  isListingPinnedActive,
  isListingPromotedActive,
} from '@/lib/listingBoostState';
import { compareListingBoostPriority, interleavePromotedListings } from '@/lib/listingSort';
import type { Listing } from '@/services/types';

const root = path.join(__dirname, '..');
const src = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

describe('Home quick access: المحفوظات replaces المفضلة in the same slot', () => {
  const catalog = src('lib/homeQuickAccess.ts');
  const keys = [...catalog.matchAll(/key: '([^']+)'/g)].map((m) => m[1]);

  it('keeps the order and swaps only this item', () => {
    expect(keys).toEqual(['services', 'bookmarks', 'feed-suppliers', 'settings']);
    expect(catalog).toContain("label: 'المحفوظات'");
    expect(catalog).not.toContain("label: 'المفضلة'");
    expect(catalog).toContain("href: '/bookmarks'");
  });

  it('uses the same save icon as the Feed interaction button (PostItem)', () => {
    const postItem = src('components/feature/PostItem.tsx');
    const feedIcon = postItem.match(/icon=\{post\.bookmarked \? '([^']+)' : '([^']+)'\}/);
    expect(feedIcon).not.toBeNull();
    const unsavedIcon = feedIcon![2];
    expect(unsavedIcon).toBe('bookmark-outline');
    const block = catalog.slice(catalog.indexOf("key: 'bookmarks'"), catalog.indexOf("key: 'feed-suppliers'"));
    expect(block).toContain(`icon: '${unsavedIcon}'`);
    // Same AppIcon component in both places; quick access design is untouched.
    const quick = src('components/feature/HomeQuickAccess.tsx');
    expect(quick).toContain("import { AppIcon } from '@/components/ui/FlaticonIcon'");
    expect(postItem).toContain('AppIcon');
  });

  it('opens a /bookmarks screen that reuses SidebarBookmarks with the standard header', () => {
    expect(existsSync(path.join(root, 'app/bookmarks.tsx'))).toBe(true);
    const screen = src('app/bookmarks.tsx');
    expect(screen).toContain("import { SidebarBookmarks } from '@/components/feature/SidebarBookmarks'");
    expect(screen).toContain('<SidebarBookmarks presentation="screen" />');
    expect(screen).toContain('<ScreenHeader variant="screen" title="العلامات المرجعية" showBack />');
    expect(src('app/_layout.tsx')).toContain('<Stack.Screen name="bookmarks" />');
    // /favorites stays (still referenced elsewhere).
    expect(existsSync(path.join(root, 'app/favorites.tsx'))).toBe(true);
    expect(src('app/_layout.tsx')).toContain('<Stack.Screen name="favorites" />');
  });

  it('on the screen items open with a plain push; the sidebar still closes first', () => {
    const block = src('components/feature/SidebarBookmarks.tsx');
    expect(block).toContain("presentation = 'sidebar'");
    expect(block).toContain("if (presentation === 'screen') {");
    expect(block).toContain('safePush(');
    expect(block).toContain("closeThenPush({ pathname: '/listing/[id]', params: { id: item.id } })");
  });
});

const NOW = Date.parse('2026-09-27T12:00:00.000Z');
const iso = (minutes: number) => new Date(NOW + minutes * 60_000).toISOString();

function listing(id: string, over: Partial<Listing> = {}): Listing {
  return {
    id,
    title: id,
    arabicTitle: id,
    price: 100,
    currency: 'SAR',
    category: 'sheep',
    breed: '',
    age: '',
    location: '',
    arabicLocation: '',
    country: 'SA',
    images: [],
    description: '',
    arabicDescription: '',
    seller: { id: 'u1', verified: false } as Listing['seller'],
    featured: false,
    pinned: false,
    postedAt: '',
    createdAt: iso(-60),
    ...over,
  } as Listing;
}

describe('client effective boost state (stale in-memory / snapshot copies)', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('expired Featured must not appear as Featured', () => {
    expect(isListingFeaturedActive(listing('a', { featured: true, featuredUntil: iso(-1) }))).toBe(false);
    expect(isListingFeaturedActive(listing('b', { featured: true, featuredUntil: iso(30) }))).toBe(true);
    // Plan-granted (no Until) stays active, same rule as the backend.
    expect(isListingFeaturedActive(listing('c', { featured: true, featuredUntil: null }))).toBe(true);
  });

  it('expired Pinned must not appear as Pinned', () => {
    expect(isListingPinnedActive(listing('a', { pinned: true, pinnedUntil: iso(-1) }))).toBe(false);
    expect(isListingPinnedActive(listing('b', { pinned: true, pinnedUntil: iso(1) }))).toBe(true);
  });

  it('expired Featured + active Pinned / active Featured + expired Pinned', () => {
    const a = listing('a', { featured: true, featuredUntil: iso(-5), pinned: true, pinnedUntil: iso(5) });
    expect([isListingFeaturedActive(a), isListingPinnedActive(a)]).toEqual([false, true]);
    const b = listing('b', { featured: true, featuredUntil: iso(5), pinned: true, pinnedUntil: iso(-5) });
    expect([isListingFeaturedActive(b), isListingPinnedActive(b)]).toEqual([true, false]);
  });

  it('expired Promotion is not promoted and its weight no longer counts', () => {
    const p = listing('p', { promoted: true, promotedUntil: iso(-1), promotionWeight: 300 });
    expect(isListingPromotedActive(p)).toBe(false);
    expect(effectiveListingPromotionWeight(p)).toBe(0);
  });

  it('client ranking treats a stale expired boost as a regular listing', () => {
    const regular = listing('regular', { createdAt: iso(-10) });
    const stale = listing('stale', {
      createdAt: iso(-500),
      featured: true,
      featuredUntil: iso(-1),
      pinned: true,
      pinnedUntil: iso(-1),
    });
    expect([stale, regular].sort(compareListingBoostPriority).map((l) => l.id)).toEqual(['regular', 'stale']);
    expect(interleavePromotedListings([stale, regular]).map((l) => l.id)).toEqual(['regular', 'stale']);
  });

  it('UI and mappers use the effective state and keep the Until fields', () => {
    const card = src('components/feature/ListingCard.tsx');
    expect(card).toContain('const featuredActive = isListingFeaturedActive(listing);');
    expect(card).not.toContain('pinned={listing.pinned} featured={listing.featured}');
    expect(src('app/listing/[id].tsx')).toContain('isListingFeaturedActive(listing) ? (');
    expect(src('services/listings.ts')).toContain('featuredUntil: l.featuredUntil ?? null,');
    expect(src('services/unifiedSearch.ts')).toContain('pinnedUntil: l.pinnedUntil ?? null,');
    expect(src('contexts/AppContext.tsx')).toContain("featuredUntil: typeof l.featuredUntil === 'string'");
  });
});