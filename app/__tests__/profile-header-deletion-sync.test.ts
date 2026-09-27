/**
 * Profile header (no tab bar, Back, Share + Edit pills), bookmarks pager sync
 * and post/listing deletion counters + caches.
 */
import { readFileSync } from 'fs';
import path from 'path';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  PROFILE_ACTION_PILL_GAP,
  PROFILE_ACTION_PILL_HEIGHT,
  PROFILE_ACTION_PILL_SHAPE,
  PROFILE_ACTION_PILL_VARIANT,
  PROFILE_BACK_BUTTON_SIZE,
  PROFILE_BACK_FALLBACK_ROUTE,
  PROFILE_EDIT_LABEL,
  PROFILE_EDIT_ROUTE,
  resolveProfileBack,
} from '@/lib/profileHeader';
import { isTabBarHiddenForRoute, TAB_BAR_HIDDEN_ROUTES } from '@/lib/tabBarVisibility';
import { SHARE_LABEL } from '@/lib/interactionActions';
import {
  applyDeletionToCounts,
  decrementCount,
  emitContentDeleted,
  onContentDeleted,
  withoutId,
} from '@/lib/contentDeletion';
import {
  FEED_SNAPSHOT_KEY,
  removeFromFeedSnapshot,
  withoutFeedItems,
  type FeedSnapshot,
} from '@/lib/feedSnapshot';
import { BOOKMARK_TABS, bookmarkPagerIndex, bookmarkPagerOffset } from '@/lib/bookmarks';
import { createSellerListingsPager } from '@/services/sellerListingsPager';
import type { Listing } from '@/services/types';

const root = path.join(__dirname, '..');
const src = (rel: string) => readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');

describe('profile header', () => {
  const layout = src('components/feature/ProfileScreenLayout.tsx');

  it('hides the floating tab bar on the profile tab only', () => {
    expect(TAB_BAR_HIDDEN_ROUTES).toEqual(['profile']);
    expect(isTabBarHiddenForRoute('profile')).toBe(true);
    for (const route of ['index', 'listings', 'explore', 'messages', 'notifications', '', null, undefined]) {
      expect(isTabBarHiddenForRoute(route as string | null | undefined)).toBe(false);
    }
    const bar = src('components/navigation/FloatingTabBar.tsx');
    expect(bar).toContain('if (tabBarForceHidden || isTabBarHiddenForRoute(activeRoute))');
  });

  it('goes back when there is history, otherwise replaces to home', () => {
    expect(resolveProfileBack(true)).toEqual({ kind: 'back' });
    expect(resolveProfileBack(false)).toEqual({ kind: 'replace', href: PROFILE_BACK_FALLBACK_ROUTE });
    expect(PROFILE_BACK_FALLBACK_ROUTE).toBe('/(tabs)');
    for (const file of ['app/(tabs)/profile.tsx', 'app/users/[id].tsx']) {
      const screen = src(file);
      expect(screen).toContain('resolveProfileBack(router.canGoBack())');
      expect(screen).toContain('safeReplace(action.href, undefined, router)');
    }
  });

  it('replaces the pencil with a circular outline Back button', () => {
    expect(layout).not.toContain('icon="pencil"');
    expect(layout).not.toMatch(/pencil/);
    expect(layout).toContain('<SarhBackButton');
    expect(layout).toContain('style={styles.backCircle}');
    const back = layout.slice(layout.indexOf('backCircle: {'), layout.indexOf('},', layout.indexOf('backCircle: {')));
    expect(back).toContain('borderWidth: 1');
    expect(back).not.toMatch(/shadow|elevation|gradient/i);
    expect(PROFILE_BACK_BUTTON_SIZE).toBe(PROFILE_ACTION_PILL_HEIGHT);
  });

  it('uses X-style outline pill tokens', () => {
    expect(PROFILE_ACTION_PILL_HEIGHT).toBeGreaterThanOrEqual(40);
    expect(PROFILE_ACTION_PILL_HEIGHT).toBeLessThanOrEqual(44);
    expect(PROFILE_ACTION_PILL_GAP).toBeGreaterThanOrEqual(12);
    expect(PROFILE_ACTION_PILL_GAP).toBeLessThanOrEqual(16);
    expect(PROFILE_ACTION_PILL_VARIANT).toBe('secondary');
    expect(PROFILE_ACTION_PILL_SHAPE).toBe('pill');
    const pill = layout.slice(layout.indexOf('    pill: {'), layout.indexOf('},', layout.indexOf('    pill: {')));
    expect(pill).toContain('flexBasis: 0');
    expect(pill).toContain('minHeight: PROFILE_ACTION_PILL_HEIGHT');
    expect(pill).not.toMatch(/shadow|elevation|gradient/i);
    expect(layout).toContain('gap: PROFILE_ACTION_PILL_GAP');
  });

  it('puts Share first (right in RTL) then Edit, text only, above the tabs', () => {
    const share = layout.indexOf('title={SHARE_LABEL}');
    const edit = layout.indexOf('title={PROFILE_EDIT_LABEL}');
    expect(share).toBeGreaterThan(-1);
    expect(edit).toBeGreaterThan(share);
    const row = layout.slice(share - 200, edit + 300);
    expect(row).not.toMatch(/\bicon=/);
    expect(row).toContain('onPress={onShare}');
    expect(row).toContain('onPress={onEditProfile}');
    expect(row).toContain('isOwnProfile && (onShare || onEditProfile)');
    expect(SHARE_LABEL).toBe('مشاركة');
    expect(PROFILE_EDIT_LABEL).toBe('تعديل الملفّ الشخصيّ');
  });

  it('wires Share to the existing profile share handlers and Edit to the existing route', () => {
    const own = src('app/(tabs)/profile.tsx');
    expect(own).toContain('onShare={handleShare}');
    expect(own).toContain('onBack={handleBack}');
    expect(own).toContain('onEditProfile={() => safePush(PROFILE_EDIT_ROUTE, undefined, router)}');
    expect(own).toMatch(/Share\.share\(/);
    expect(PROFILE_EDIT_ROUTE).toBe('/profile/edit');
    const other = src('app/users/[id].tsx');
    expect(other).toContain('onShare={handleShareProfile}');
    expect(other).not.toContain('onEditProfile=');
  });

  describe('actions row per profile kind', () => {
    const ownStart = layout.indexOf('{isOwnProfile && (onShare || onEditProfile) ? (');
    const visitorStart = layout.indexOf("{mode === 'visitor' && (onFollow || onMessage) ? (");
    const tabsStart = layout.indexOf('</Animated.View>', visitorStart);
    const ownBlock = layout.slice(ownStart, visitorStart);
    const visitorBlock = layout.slice(visitorStart, tabsStart);

    it('My Profile shows Share + Edit Profile and no Follow / Message', () => {
      expect(ownStart).toBeGreaterThan(-1);
      expect(visitorStart).toBeGreaterThan(ownStart);
      expect(ownBlock).toContain('title={SHARE_LABEL}');
      expect(ownBlock).toContain('title={PROFILE_EDIT_LABEL}');
      expect(ownBlock).not.toContain('onFollow');
      expect(ownBlock).not.toContain('onMessage');
      expect(ownBlock).not.toContain('متابعة');
      expect(ownBlock).not.toContain('مراسلة');
    });

    it('Other User Profile shows only Follow + Message (no Share, no Edit Profile)', () => {
      expect(visitorBlock).toContain('title="مراسلة"');
      expect(visitorBlock).toContain("'متابعة'");
      expect(visitorBlock).toContain('onPress={onMessage}');
      expect(visitorBlock).toContain('onPress={onFollow}');
      expect(visitorBlock).not.toContain('SHARE_LABEL');
      expect(visitorBlock).not.toContain('onShare');
      expect(visitorBlock).not.toContain('PROFILE_EDIT_LABEL');
      expect(visitorBlock).not.toContain('onEditProfile');
      // Restored exactly as before b2a9b78: gap sm, original flex style.
      expect(visitorBlock).toContain('<Row gap="sm" align="center" style={[styles.actionsRow, inset]}>');
      expect(visitorBlock.match(/style=\{styles\.actionBtnFlex\}/g)).toHaveLength(2);
      // Share and Edit pills appear exactly once in the whole layout (own row only).
      expect(layout.match(/title=\{SHARE_LABEL\}/g)).toHaveLength(1);
      expect(layout.match(/title=\{PROFILE_EDIT_LABEL\}/g)).toHaveLength(1);
    });

    it('Other profile keeps sharing via the existing ⋯ menu; own id redirects to My Profile', () => {
      const other = src('app/users/[id].tsx');
      expect(other).toContain('const handleShareProfile = () =>');
      expect(other).toContain("if (key === 'share') handleShareProfile();");
      expect(other).toContain('mode="visitor"');
      expect(other).toContain('onFollow={handleFollow}');
      expect(other).toMatch(/onMessage=\{profile\.allowPrivateMessages === false \? undefined : handleChat\}/);
      expect(other).toContain("router.replace('/(tabs)/profile')");
      expect(src('app/(tabs)/profile.tsx')).toContain('mode="own"');
    });
  });
});

describe('bookmarks pager: one index for indicator, pager and content', () => {
  const count = BOOKMARK_TABS.length;
  const width = 360;

  it.each([true, false])('round-trips every tab (rtl=%s)', (rtl) => {
    for (let i = 0; i < count; i += 1) {
      expect(bookmarkPagerIndex(bookmarkPagerOffset(i, width, count, rtl), width, count, rtl)).toBe(i);
    }
  });

  it('maps physical offsets through RTL (first tab sits on the right)', () => {
    expect(bookmarkPagerOffset(0, width, count, true)).toBe((count - 1) * width);
    expect(bookmarkPagerIndex(0, width, count, true)).toBe(count - 1);
    expect(bookmarkPagerOffset(0, width, count, false)).toBe(0);
    expect(bookmarkPagerIndex(0, width, count, false)).toBe(0);
  });

  it('renders pages and indicator from the same index state', () => {
    const screen = src('app/bookmarks.tsx');
    expect(screen).toContain('bookmarkPagerIndex(event.nativeEvent.contentOffset.x, width, count, rtl)');
    expect(screen).toContain('bookmarkPagerOffset(next, width, count, rtl)');
    expect(screen).not.toContain('scrollToIndex');
    expect(screen).not.toContain('pagerIndexFromOffset');
  });
});

describe('deletion counters', () => {
  const me = { id: 'me', postsCount: 10 };

  it('drops the own posts counter by one, clamped at zero', () => {
    expect(applyDeletionToCounts(me, { kind: 'post', id: 'p1', ownerId: 'me' }).postsCount).toBe(9);
    expect(applyDeletionToCounts({ id: 'me', postsCount: 0 }, { kind: 'post', id: 'p', ownerId: 'me' }).postsCount).toBe(0);
    expect(decrementCount(undefined)).toBe(0);
    expect(decrementCount(Number.NaN)).toBe(0);
  });

  it('leaves counters alone for someone else or a listing', () => {
    expect(applyDeletionToCounts(me, { kind: 'post', id: 'p1', ownerId: 'other' })).toBe(me);
    expect(applyDeletionToCounts(me, { kind: 'listing', id: 'l1', ownerId: 'me' })).toBe(me);
  });

  it('updates counters and caches only after a successful DELETE', () => {
    const ctx = src('contexts/AppContext.tsx');
    for (const fn of ['const deletePost = useCallback', 'const removeListing = useCallback']) {
      const start = ctx.indexOf(fn);
      const body = ctx.slice(start, ctx.indexOf('} catch', start));
      const okAt = body.indexOf('if (res.ok) {');
      const failAt = body.indexOf('return { ok: false, error: await parseApiError(res) };');
      expect(okAt).toBeGreaterThan(-1);
      expect(failAt).toBeGreaterThan(okAt);
      const success = body.slice(okAt, failAt);
      const beforeOk = body.slice(0, okAt);
      for (const call of ['forgetCachedUserProfile(ownerId)', 'removeFromFeedSnapshot(', 'emitContentDeleted(']) {
        expect(success).toContain(call);
        expect(beforeOk).not.toContain(call);
      }
    }
    const del = ctx.slice(ctx.indexOf('const deletePost = useCallback'));
    const delSuccess = del.slice(del.indexOf('if (res.ok) {'), del.indexOf('return { ok: false, error: await parseApiError(res) };'));
    expect(delSuccess).toContain('setMe((prev) => applyDeletionToCounts(prev, event))');
    expect(delSuccess).toContain('postsCacheByFeed.forEach');
    expect(delSuccess).toContain('next.delete(postId);\n          persistBookmarks(next);');
    const rem = ctx.slice(ctx.indexOf('const removeListing = useCallback'));
    expect(rem.slice(0, rem.indexOf('return { ok: false, error: await parseApiError(res) };'))).toContain('forgetBootstrappedListing(listingId)');
  });

  it('notifies subscribers and stops after unsubscribe', () => {
    const seen: string[] = [];
    const off = onContentDeleted((e) => seen.push(`${e.kind}:${e.id}`));
    emitContentDeleted({ kind: 'post', id: 'p1', ownerId: 'me' });
    off();
    emitContentDeleted({ kind: 'listing', id: 'l1' });
    expect(seen).toEqual(['post:p1']);
  });

  it('profile hooks drop the deleted item from their own copies', () => {
    expect(src('hooks/useProfileActivity.ts')).toContain('onContentDeleted((event) => {');
    expect(src('hooks/useSellerListingsPager.ts')).toContain('onContentDeleted((event) => {');
    const list = [{ id: 'a' }, { id: 'b' }];
    expect(withoutId(list, 'x')).toBe(list);
    expect(withoutId(list, 'a')).toEqual([{ id: 'b' }]);
  });

  it('seller listings pager removes one listing without refetching', async () => {
    const searchPage = jest.fn().mockResolvedValue({
      listings: [{ id: 'l1' }, { id: 'l2' }] as Listing[],
      nextCursor: null,
      hasMore: false,
    });
    const pager = createSellerListingsPager({ searchPage });
    await pager.loadFirstPage({ sellerId: 's1' });
    pager.removeListing('l1');
    expect(pager.getState().listings.map((l) => l.id)).toEqual(['l2']);
    pager.removeListing('missing');
    expect(searchPage).toHaveBeenCalledTimes(1);
  });
});

describe('feed snapshot after a delete', () => {
  const snap: FeedSnapshot = {
    posts: [{ id: 'p1' }, { id: 'p2' }] as FeedSnapshot['posts'],
    listings: [{ id: 'l1' }] as FeedSnapshot['listings'],
    savedAt: 1234,
    ownerId: 'me',
  };

  it('drops only the deleted item and keeps savedAt', () => {
    const next = withoutFeedItems(snap, { postId: 'p1' });
    expect(next.posts.map((p) => p.id)).toEqual(['p2']);
    expect(next.listings).toBe(snap.listings);
    expect(next.savedAt).toBe(1234);
    expect(withoutFeedItems(snap, { postId: 'nope' })).toBe(snap);
    expect(withoutFeedItems(snap, { listingId: 'l1' }).listings).toEqual([]);
  });

  it('rewrites the disk snapshot for that owner only', async () => {
    const saved = { ...snap, savedAt: Date.now() };
    await AsyncStorage.setItem(FEED_SNAPSHOT_KEY, JSON.stringify(saved));
    await removeFromFeedSnapshot({ listingId: 'l1' }, 'someone-else');
    expect(JSON.parse((await AsyncStorage.getItem(FEED_SNAPSHOT_KEY)) as string).listings).toHaveLength(1);
    await removeFromFeedSnapshot({ listingId: 'l1' }, 'me');
    const after = JSON.parse((await AsyncStorage.getItem(FEED_SNAPSHOT_KEY)) as string) as FeedSnapshot;
    expect(after.listings).toEqual([]);
    expect(after.posts).toHaveLength(2);
    expect(after.savedAt).toBe(saved.savedAt);
  });
});