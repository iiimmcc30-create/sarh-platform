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

describe('replies: start right under the post + feed-style rows', () => {
  it('no «الردود» title and no spacer between the action row and the first reply', () => {
    expect(comments).not.toContain('الردود');
    expect(comments).not.toContain('repliesHeader');
    expect(comments).toContain('<View testID="post-replies">');
    // Single hairline: the post's action-row bottom border; the detail wrapper adds none.
    expect(style(postItem, 'detailWrap')).toContain('borderBottomWidth: 0');
    expect(style(postItem, 'detailActions')).toContain('borderBottomWidth: StyleSheet.hairlineWidth');
    expect(style(postItem, 'detailPad')).not.toContain('paddingBottom');
    expect(style(postItem, 'detailPad')).not.toContain('marginBottom');
    expect(style(comments, 'commentWrap')).not.toContain('borderTopWidth');
    expect(style(comments, 'commentWrap')).not.toContain('marginTop');
    expect(screen).toContain('<PostCommentsList />');
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
    expect(comments).toContain('accessibilityLabel="إرسال التعليق"');
    expect(comments).toContain('onPress={() => void handleSend()}');
    expect(comments).toContain('ref={setInputRef}');
    expect(comments).toContain('editable={isAuthenticated && !sending && !loadError}');
    expect(comments).toContain("'سجّل الدخول للتعليق'");
    expect(screen).toContain('<ComposerKeyboardView');
    expect(screen).toContain('restingBottom');
  });
});

describe('reply composer: X reply bar', () => {
  const composer = between(comments, 'export function PostCommentsComposer()', '\n}\n');

  it('avatar at the inline start, pill input «انشر ردك», primary «رد» pill at the end', () => {
    const avatar = composer.indexOf('styles.composerAvatar');
    const input = composer.indexOf('styles.inputPill');
    const send = composer.indexOf('styles.sendBtn,');
    expect(avatar).toBeGreaterThan(-1);
    expect(input).toBeGreaterThan(avatar);
    expect(send).toBeGreaterThan(input);
    expect(composer).toContain("placeholder={isAuthenticated ? 'انشر ردك' : 'سجّل الدخول للتعليق'}");
    expect(composer).toContain('<AppText style={styles.sendBtnText}>رد</AppText>');
    expect(composer).not.toContain('name="send"');
  });

  it('bar = page background + top hairline; pill input without border; primary pill send', () => {
    const bar = style(comments, 'composer');
    expect(bar).toContain('backgroundColor: rowBg');
    expect(bar).toContain('borderTopWidth: StyleSheet.hairlineWidth');
    expect(style(comments, 'composerAvatar')).toContain('width: 32');
    const pill = style(comments, 'inputPill');
    expect(pill).toContain('borderRadius: radius.pill');
    expect(pill).toContain('backgroundColor: colors.bgField');
    expect(pill).not.toContain('borderWidth');
    const btn = style(comments, 'sendBtn');
    expect(btn).toContain('backgroundColor: colors.electric');
    expect(btn).toContain('borderRadius: radius.pill');
    expect(style(comments, 'sendBtnText')).toContain('color: colors.onElectric');
    // Empty / sending / signed out: disabled and low contrast.
    expect(composer).toContain('const disabled = !text.trim() || sending || !isAuthenticated || !!loadError;');
    expect(composer).toContain('disabled && styles.sendBtnDisabled');
    expect(style(comments, 'sendBtnDisabled')).toMatch(/opacity: 0\.[0-4]/);
  });
});

describe('handles read «@username» (LTR) and the detail skeleton matches the detail row', () => {
  it('detail, feed and reply handles are LTR inside the RTL row', () => {
    expect(style(postItem, 'handle')).toContain("writingDirection: 'ltr'");
    expect(style(postItem, 'handle')).toContain("alignSelf: 'flex-start'");
    expect(style(postItem, 'feedHandle')).toContain("writingDirection: 'ltr'");
    expect(style(comments, 'commentHandle')).toContain("writingDirection: 'ltr'");
    // «@» is part of the text itself, never a separate mirrored node.
    expect(postItem).toContain("const handle = post.author.username ? `@${post.author.username}` : '';");
    expect(comments).toContain('@{c.author.username}');
  });

  it('PostDetailSkeleton draws the five-slot detail row between hairlines', () => {
    const sk = src('components/ui/skeleton/PostCardSkeleton.tsx');
    const detail = between(sk, 'export function PostDetailSkeleton()', 'export function PostCardSkeleton(');
    expect(detail).toContain('<DetailActionsSkeleton styles={styles} />');
    expect(detail).not.toContain('<ActionsSkeleton');
    expect(detail).toContain('fontSize={POST_DETAIL_BODY_FONT_SIZE}');
    expect(sk).toContain('const DETAIL_ACTIONS = 5;');
    expect(sk).toContain('<SkeletonCircle size={INTERACTION_DETAIL_ICON_SIZE} />');
    expect(sk).toContain('...INTERACTION_DETAIL_BAR_STYLE');
    expect(sk).toContain('...INTERACTION_DETAIL_BUTTON_STYLE');
    const wrap = style(sk, 'detailActionsWrap');
    expect(wrap).toContain('borderTopWidth: StyleSheet.hairlineWidth');
    expect(wrap).toContain('borderBottomWidth: StyleSheet.hairlineWidth');
  });
});
