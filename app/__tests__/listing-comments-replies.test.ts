import * as fs from 'fs';
import * as path from 'path';
import { listingListMetrics } from '../components/feature/listingCardLayout';
import { groupListingComments, mapListingComment } from '../components/feature/listingCommentsUtils';
import type { PostComment } from '../services/types';

const src = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

const author = (id: string) => ({ id, username: id, displayName: id, arabicName: '' });
const c = (id: string, parentId?: string | null): PostComment =>
  mapListingComment({ id, content: id, createdAt: new Date().toISOString(), parentId, author: author('u') });

describe('listing comment replies — grouping', () => {
  it('nests replies under their parent, oldest first; orphans stay top-level', () => {
    const threads = groupListingComments([c('a'), c('b'), c('r1', 'a'), c('r2', 'a'), c('o', 'gone')]);
    expect(threads.map((t) => t.comment.id)).toEqual(['a', 'b', 'o']);
    expect(threads[0].replies.map((r) => r.id)).toEqual(['r1', 'r2']);
    expect(threads[1].replies).toEqual([]);
  });

  it('reply-to-reply (older data) stays in the same thread', () => {
    const threads = groupListingComments([c('a'), c('r1', 'a'), c('r2', 'r1')]);
    expect(threads).toHaveLength(1);
    expect(threads[0].replies.map((r) => r.id)).toEqual(['r1', 'r2']);
  });

  it('maps parentId from the API row', () => {
    expect(c('x', 'p').parentId).toBe('p');
    expect(c('y').parentId).toBeNull();
  });
});

describe('listing comments — RTL row layout', () => {
  const row = src('components/feature/ListingCommentRow.tsx');
  const section = src('components/feature/ListingCommentsSection.tsx');
  const modal = src('components/feature/ListingCommentsModal.tsx');

  it('header: avatar + name + badge at the start, time at the far end, text directly under', () => {
    const avatar = row.indexOf('avatarUrl(c.author.avatar)');
    const name = row.indexOf('<VerifiedInlineName');
    const spacer = row.indexOf('<View style={styles.headerSpacer} />');
    const time = row.indexOf('{c.createdAt}');
    const text = row.indexOf('{c.content}');
    expect(avatar).toBeGreaterThan(-1);
    expect(avatar).toBeLessThan(name);
    expect(name).toBeLessThan(spacer);
    expect(spacer).toBeLessThan(time);
    expect(time).toBeLessThan(text);
    expect(row).toMatch(/time: \{[^}]*color: colors\.textSecondary,/);
  });

  it('replies: indented with a thread line, smaller avatar, collapsible «عرض الردود (n)»', () => {
    expect(row).toContain('export const LISTING_REPLY_AVATAR = 26;');
    expect(row).toMatch(/threadLine: \{[^}]*position: 'absolute',/);
    expect(row).toContain('`عرض الردود (${count})`');
    expect(row).toContain('count > LISTING_REPLIES_COLLAPSE_OVER');
  });

  it('«رد» opens the composer as a reply and sends parentId', () => {
    expect(section).toContain('onReply={openReply}');
    expect(section).toContain('initialReplyTo={replyTo}');
    expect(modal).toContain('onReply={startReply}');
    expect(modal).toContain('...(replyTo ? { parentId: replyTo.id } : {})');
    expect(modal).toContain('الرد على');
  });

  it('seller comments get «البائع»', () => {
    expect(row).toContain('البائع');
    expect(src('app/listing/[id].tsx')).toContain(
      'sellerId={isManagedListing(listing) ? undefined : listing.seller?.id}',
    );
  });

  it('hairline dividers between threads; no empty-state copy', () => {
    expect(row).toMatch(/divider: \{\s*borderBottomWidth: StyleSheet\.hairlineWidth,/);
    expect(section).toContain('comments.length === 0 ? null');
  });

  it('composer: rounded field, accent send fill animated in only when there is text', () => {
    expect(modal).toContain('const canSend = !!text.trim() && !sending && isAuthenticated && !loadError;');
    expect(modal).toContain('Animated.timing(sendAnim');
    expect(modal).toMatch(/sendFill: \{[^}]*backgroundColor: colors\.electric,/);
    expect(modal).toContain('disabled={!canSend}');
    expect(modal).toMatch(/inputField: \{[^}]*borderRadius: 22,/);
  });
});

describe('ListingCard seller row — verified badge right after the name', () => {
  const card = src('components/feature/ListingCard.tsx');

  it('list and haraj variants render name, then badge (not between avatar and name)', () => {
    const blocks = card.split('sellerNameBadgeRow, getRtlRow()').slice(1);
    expect(blocks).toHaveLength(2);
    for (const b of blocks) {
      const name = b.indexOf('{sellerName}');
      const badge = b.indexOf('<VerificationBadge');
      expect(name).toBeGreaterThan(-1);
      expect(badge).toBeGreaterThan(name);
    }
    expect(card).toContain('<VerificationBadge size={m.verifiedBadge} tier={seller?.verifiedTier} />');
  });

  it('badge size follows the meta font', () => {
    expect(listingListMetrics(360).verifiedBadge).toBe(13);
    expect(listingListMetrics(390).verifiedBadge).toBe(14);
    expect(listingListMetrics(430).verifiedBadge).toBe(16);
  });
});
