/**
 * Post detail (البوست من الداخل) + replies: X post-page layout without a Grok icon.
 * Source + token checks, like the other layout suites.
 */
import { readFileSync } from 'fs';
import path from 'path';
import {
  INTERACTION_BAR_JUSTIFY,
  INTERACTION_COUNT_FONT_SIZE,
  INTERACTION_DETAIL_BAR_HEIGHT,
  INTERACTION_DETAIL_BAR_STYLE,
  INTERACTION_DETAIL_BUTTON_STYLE,
  INTERACTION_DETAIL_COUNT_FONT_SIZE,
  INTERACTION_DETAIL_HIT_SLOP,
  INTERACTION_DETAIL_ICON_SIZE,
  INTERACTION_ICON_SIZE,
  INTERACTION_TOUCH_MIN,
} from '@/lib/interactionActions';
import {
  POST_DETAIL_BODY_FONT_SIZE,
  POST_DETAIL_BODY_LINE_HEIGHT,
  POST_DETAIL_MEDIA_RADIUS,
  POST_ITEM_LAYOUT,
} from '@/components/feature/postItemLayout';
import { formatViewsLabelAr, formatViewsPartsAr } from '@/lib/formatRelativeTime';

const root = path.join(__dirname, '..');
const src = (rel: string) => readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');

const postItem = src('components/feature/PostItem.tsx');
const comments = src('components/feature/PostCommentsSection.tsx');
const bar = src('components/ui/InteractionActions.tsx');
const screen = src('app/post/[id].tsx');

function between(text: string, start: string, end: string): string {
  const i = text.indexOf(start);
  expect(i).toBeGreaterThan(-1);
  const j = text.indexOf(end, i);
  expect(j).toBeGreaterThan(i);
  return text.slice(i, j);
}

function style(file: string, name: string): string {
  return between(file, `    ${name}: {`, '\n    },');
}

describe('post detail: no Grok, only actions Sarh supports', () => {
  it.each([
    ['PostItem', postItem],
    ['PostCommentsSection', comments],
    ['InteractionActions', bar],
    ['post/[id]', screen],
  ])('%s has no Grok icon or label', (_name, file) => {
    expect(file.toLowerCase()).not.toContain('grok');
  });

  it('detail action row: reply, repost, like, bookmark, share (no views slot, no compact group)', () => {
    const detail = between(postItem, '<InteractionBar variant="detail">', '</InteractionBar>');
    const order = [
      'icon="chatbubble-ellipses-outline"',
      'icon="repeat-2"',
      "icon={post.liked ? 'heart' : 'heart-outline'}",
      "icon={post.bookmarked ? 'bookmark' : 'bookmark-outline'}",
      '<ShareAction color={colors.textSecondary} onPress={onShare} />',
    ].map((t) => detail.indexOf(t));
    order.forEach((i) => expect(i).toBeGreaterThan(-1));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(detail).not.toContain('views-4-bars');
    expect(detail).not.toContain('InteractionTrailingGroup');
    // Same handlers as before.
    for (const h of ['onPress={onComment}', 'onPress={onLike}', 'pending={likePending}', 'onPress={onBookmark ??', 'onPress={onRepost ??']) {
      expect(detail).toContain(h);
    }
    expect(postItem).toContain('<View style={styles.detailActions}>{detailActions}</View>');
  });

  it('detail actions are larger than the feed and spread edge to edge', () => {
    expect(INTERACTION_DETAIL_ICON_SIZE).toBeGreaterThanOrEqual(22);
    expect(INTERACTION_DETAIL_ICON_SIZE).toBeLessThanOrEqual(24);
    expect(INTERACTION_DETAIL_ICON_SIZE).toBeGreaterThan(INTERACTION_ICON_SIZE);
    expect(INTERACTION_DETAIL_COUNT_FONT_SIZE).toBeGreaterThan(INTERACTION_COUNT_FONT_SIZE);
    expect(INTERACTION_DETAIL_BAR_STYLE.justifyContent).toBe(INTERACTION_BAR_JUSTIFY);
    expect(INTERACTION_DETAIL_BAR_STYLE.height).toBe(INTERACTION_DETAIL_BAR_HEIGHT);
    expect(INTERACTION_DETAIL_BUTTON_STYLE.flexGrow).toBe(0);
    expect(INTERACTION_DETAIL_BUTTON_STYLE.height).toBe(INTERACTION_DETAIL_BAR_HEIGHT);
    // Touch target: visible height + slop never below the feed button's.
    expect(INTERACTION_DETAIL_BAR_HEIGHT).toBeGreaterThanOrEqual(INTERACTION_TOUCH_MIN);
    expect(INTERACTION_DETAIL_ICON_SIZE + INTERACTION_DETAIL_HIT_SLOP.left + INTERACTION_DETAIL_HIT_SLOP.right)
      .toBeGreaterThanOrEqual(44);
    expect(bar).toContain('<DetailContext.Provider value>');
    expect(bar).toContain("variant?: 'feed' | 'detail';");
    const actions = style(postItem, 'detailActions');
    expect(actions).toContain('borderTopWidth: StyleSheet.hairlineWidth');
    expect(actions).toContain('borderBottomWidth: StyleSheet.hairlineWidth');
  });
});

describe('post detail header, text, media and meta', () => {
  it('follow pill is the filled theme primary (black Light / white Dark), bordered when followed', () => {
    const btn = style(postItem, 'followBtn');
    // Theme accent: black in Light, white in Dark.
    expect(btn).toContain('backgroundColor: colors.electric');
    expect(btn).toContain('borderRadius: radius.pill');
    expect(style(postItem, 'followBtnText')).toContain('color: colors.onElectric');
    expect(style(postItem, 'followBtnActive')).toContain("backgroundColor: 'transparent'");
    expect(postItem).toContain("accessibilityLabel={following ? 'متابَع' : 'متابعة'}");
    expect(postItem).toContain('accessibilityLabel="المزيد"');
    expect(postItem).toContain('ellipsis-vertical');
  });

  it('post text is larger than the feed body and media is a rounded card in the column', () => {
    expect(POST_DETAIL_BODY_FONT_SIZE).toBeGreaterThanOrEqual(17);
    expect(POST_DETAIL_BODY_LINE_HEIGHT).toBeGreaterThan(POST_DETAIL_BODY_FONT_SIZE);
    expect(style(postItem, 'detailBody')).toContain('fontSize: POST_DETAIL_BODY_FONT_SIZE');
    const media = style(postItem, 'detailMedia');
    expect(media).toContain('borderRadius: POST_DETAIL_MEDIA_RADIUS');
    expect(media).toContain("overflow: 'hidden'");
    expect(POST_DETAIL_MEDIA_RADIUS).toBeGreaterThanOrEqual(12);
  });

  it('meta line: time • date • bold views number + word', () => {
    const meta = between(postItem, 'testID="post-detail-meta"', '</View>');
    expect(meta.indexOf('{clock}')).toBeLessThan(meta.indexOf('{dateLabel}'));
    expect(meta.indexOf('{dateLabel}')).toBeLessThan(meta.indexOf('{viewsParts.count}'));
    expect(meta).toContain('•');
    expect(meta).toContain('<AppText style={styles.viewsCount}>{viewsParts.count}</AppText> {viewsParts.label}');
    expect(style(postItem, 'viewsCount')).toContain("resolveAppFontFace('700')");
    expect(formatViewsPartsAr(831)).toEqual({ count: '٨٣١', label: 'مشاهدات' });
    expect(formatViewsPartsAr(1).label).toBe('مشاهدة');
    expect(formatViewsLabelAr(831)).toBe('٨٣١ مشاهدات');
  });
});

describe('replies: «الردود» header + feed-style rows', () => {
  it('plain header (no sort chevron: comments have no sort options)', () => {
    expect(comments).toContain('testID="post-replies-header"');
    expect(comments).toContain('الردود');
    expect(comments).not.toContain('chevron-down');
    expect(style(comments, 'repliesHeaderText')).toContain("resolveAppFontFace('700')");
  });

  it('reply rows use the feed row metrics (avatar, gap, one-line meta)', () => {
    expect(style(comments, 'avatar')).toContain('width: POST_ITEM_LAYOUT.avatar');
    expect(POST_ITEM_LAYOUT.avatar).toBe(40);
    expect(style(comments, 'commentRow')).toContain('gap: POST_ITEM_LAYOUT.rowGap');
    expect(style(comments, 'nameTimeRow')).toContain("flexWrap: 'nowrap'");
    expect(style(comments, 'commentHandle')).toContain('flexShrink: POST_HANDLE_FLEX_SHRINK');
    expect(style(comments, 'commentText')).toContain('...typography.body');
  });

  it('reply rows show only the reply action (feed size), wired to the existing composer', () => {
    const row = between(comments, 'styles.commentActions', '</View>\n              </View>');
    expect(row).toContain('<InteractionAction');
    expect(row).toContain('icon="chatbubble-ellipses-outline"');
    expect(row).toContain('onPress={() => startReply(c.author.username)}');
    expect(row).not.toContain('size=');
    expect(comments).not.toContain('heart-outline');
    expect(comments).not.toContain('repeat-2');
    expect(comments).toContain('inputRef?.focus();');
  });

  it('existing comment features stay: delete menu, highlight, composer, retry', () => {
    expect(comments).toContain('canDeleteComment(c.author.id, postOwnerId, user, me)');
    expect(comments).toContain('styles.commentHighlight');
    expect(comments).toContain('إعادة المحاولة');
    expect(comments).toContain('اكتب تعليقاً');
    expect(comments).toContain('accessibilityLabel="إرسال التعليق"');
    expect(style(comments, 'sendBtn')).toContain('backgroundColor: colors.electric');
  });
});
