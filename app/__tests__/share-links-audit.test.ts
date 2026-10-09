import { readFileSync } from 'fs';
import path from 'path';
import { shareLinkId, shareLinkUsername } from '@/lib/shareLinks';
import { avatarUrl } from '@/lib/listingMedia';
import {
  isActivelyPromoted,
  resetPromotionTracking,
  trackPromotedClick,
  trackPromotedImpression,
} from '@/lib/promotionTracking';
import { chatOlderCursor, prependOlderMessages, reconcileLoadedMessages } from '@/lib/chatRealtime';
import type { ChatMessage } from '@/services/chatMessages';
import type { Listing } from '@/services/types';

jest.mock('@/services/listingPromotion', () => ({ trackPromotionEvent: jest.fn(() => Promise.resolve()) }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { trackPromotionEvent } = require('@/services/listingPromotion') as { trackPromotionEvent: jest.Mock };

const root = path.join(__dirname, '..');
const src = (rel: string) => readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');

describe('share link routes', () => {
  it('parses ids / usernames defensively', () => {
    expect(shareLinkId('abc-123_X')).toBe('abc-123_X');
    expect(shareLinkId(['id1'])).toBe('id1');
    expect(shareLinkId('../etc')).toBeNull();
    expect(shareLinkId(undefined)).toBeNull();
    expect(shareLinkUsername('@mutab_1')).toBe('mutab_1');
    expect(shareLinkUsername('bad name')).toBeNull();
  });

  it('/l/[id] redirects to the listing, /u/[username] resolves the handle', () => {
    expect(src('app/l/[id].tsx')).toContain("pathname: '/listing/[id]'");
    const u = src('app/u/[username].tsx');
    expect(u).toContain('resolveUsername(username)');
    expect(u).toContain("pathname: '/users/[id]'");
    expect(src('services/users.ts')).toContain('/api/users/by-username/');
  });
});

describe('avatarUrl', () => {
  const raw = 'https://res.cloudinary.com/demo/image/upload/v123/avatars/a.jpg';
  it('small w_96 crop, large w_288; non-Cloudinary untouched', () => {
    expect(avatarUrl(raw)).toBe('https://res.cloudinary.com/demo/image/upload/w_96,c_fill,q_auto,f_auto/v123/avatars/a.jpg');
    expect(avatarUrl(raw, 'large')).toContain('/w_288,c_fill,q_auto,f_auto/');
    expect(avatarUrl('https://example.com/a.jpg')).toBe('https://example.com/a.jpg');
    expect(avatarUrl(null)).toBeUndefined();
  });

  it('chat, stories and comments request resized avatars', () => {
    expect(src('app/chat.tsx')).toContain('uriSource(avatarUrl(headerAvatar))');
    expect(src('components/feature/StoryViewer.tsx')).toContain('avatarUrl(group.user.avatar)');
    expect(src('components/feature/PostItem.tsx')).toContain('uriSource(avatarUrl(post.author.avatar))');
    expect(src('design-system/components/SarhAvatar.tsx')).toContain('avatarUrl(uri');
  });
});

describe('promotion tracking', () => {
  const promoted = { id: 'p1', promoted: true, promotedUntil: '2999-01-01T00:00:00.000Z' } as Listing;
  beforeEach(() => {
    resetPromotionTracking();
    trackPromotionEvent.mockClear();
  });

  it('only live promotions count, once per session', () => {
    expect(isActivelyPromoted({ promoted: true, promotedUntil: '2000-01-01T00:00:00.000Z' })).toBe(false);
    expect(isActivelyPromoted({ promoted: false })).toBe(false);
    expect(trackPromotedImpression(promoted)).toBe(true);
    expect(trackPromotedImpression(promoted)).toBe(false);
    expect(trackPromotedClick(promoted)).toBe(true);
    expect(trackPromotedClick({ id: 'x', promoted: false } as Listing)).toBe(false);
    expect(trackPromotionEvent.mock.calls).toEqual([
      ['p1', 'impression'],
      ['p1', 'click'],
    ]);
  });

  it('market feed wires impressions (viewability) and clicks; ListingCard untouched', () => {
    const feed = src('components/market/MarketListingsFeed.tsx');
    expect(feed).toContain('onViewableItemsChanged={onViewableItemsChanged}');
    expect(feed).toContain('viewabilityConfig={PROMOTION_VIEWABILITY}');
    expect(feed).toContain('trackPromotedClick(item);');
    expect(src('components/feature/ListingCard.tsx')).not.toContain('trackPromot');
  });
});

describe('chat history paging', () => {
  const m = (id: string, at: string): ChatMessage =>
    ({ id, createdAt: at, senderId: 'a', text: id }) as unknown as ChatMessage;

  it('prepends older pages without duplicates', () => {
    const cur = [m('m3', '2026-01-03'), m('m4', '2026-01-04')];
    const next = prependOlderMessages(cur, [m('m1', '2026-01-01'), m('m2', '2026-01-02'), m('m3', '2026-01-03')]);
    expect(next.map((x) => x.id)).toEqual(['m1', 'm2', 'm3', 'm4']);
    expect(prependOlderMessages(cur, [])).toBe(cur);
  });

  it('a newest-page reload keeps older pages above it', () => {
    const prev = [m('m1', '2026-01-01'), m('m3', '2026-01-03'), m('m4', '2026-01-04')];
    expect(reconcileLoadedMessages(prev, [m('m3', '2026-01-03'), m('m4', '2026-01-04')]).map((x) => x.id)).toEqual([
      'm1',
      'm3',
      'm4',
    ]);
  });

  it('cursor only while the server says there is more', () => {
    expect(chatOlderCursor({ hasMore: true, nextCursor: 'c1' })).toBe('c1');
    expect(chatOlderCursor({ hasMore: false, nextCursor: 'c1' })).toBeNull();
    expect(chatOlderCursor(null)).toBeNull();
  });

  it('thread list is inverted and pages older messages on end reached', () => {
    const chat = src('app/chat.tsx');
    expect(chat).toContain('inverted');
    expect(chat).toContain('onEndReached={() => void loadOlderMessages()}');
    expect(chat).toContain('?cursor=${encodeURIComponent(olderCursor)}');
    expect(chat).not.toContain('scrollToEnd');
  });
});

describe('deep links config', () => {
  it('app.json declares App Links + Universal Links for share paths', () => {
    const app = JSON.parse(src('app.json')).expo;
    expect(app.ios.associatedDomains).toContain('applinks:sarhsa.online');
    const filter = app.android.intentFilters[0];
    expect(filter.autoVerify).toBe(true);
    expect(filter.data).toEqual(expect.arrayContaining([{ scheme: 'https', host: 'sarhsa.online', pathPrefix: '/l/' }]));
    expect(src('android/app/src/main/AndroidManifest.xml')).toContain('android:pathPrefix="/post/"');
  });
});
