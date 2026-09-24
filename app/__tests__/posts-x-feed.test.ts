import { readFileSync } from 'fs';
import path from 'path';
import { formatPostCardTimestampAr, formatViewsLabelAr } from '@/lib/formatRelativeTime';

const root = path.join(__dirname, '..');

function src(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8');
}

function hoursAgo(h: number, now = Date.now()) {
  return new Date(now - h * 60 * 60 * 1000).toISOString();
}

function daysAgo(d: number, now = Date.now()) {
  return new Date(now - d * 24 * 60 * 60 * 1000).toISOString();
}

describe('create post media upload', () => {
  it('picks images and videos and uploads video via uploadMediaFromUri', () => {
    const create = src('app/create/post.tsx');
    expect(create).toContain("mediaTypes: ['images', 'videos']");
    expect(create).toContain("uploadMediaFromUri");
    expect(create).toContain("'posts',");
    expect(create).toContain("'video'");
    expect(create).not.toContain('uploadImageFromUri');
    expect(create).toContain('media: uploaded');
  });
});

describe('Posts feed — X-style structure', () => {
  const postItem = src('components/feature/PostItem.tsx');
  const comments = src('components/feature/PostCommentsSection.tsx');
  const detail = src('app/post/[id].tsx');

  it('PostItem is a full-width row without floating cards', () => {
    expect(postItem).toContain('borderBottomWidth: StyleSheet.hairlineWidth');
    expect(postItem).not.toContain('MENU_CARD');
    expect(postItem).not.toContain('borderRadius: MENU_CARD');
    expect(postItem).not.toContain("textAlign: 'right'");
    expect(postItem).not.toContain("direction: 'ltr'");
    expect(postItem).not.toContain('row-reverse');
    expect(postItem).not.toContain('RtlTextShell');
    expect(postItem).toContain('ellipsis-vertical');
    expect(postItem).toContain('formatViewsLabelAr');
    expect(postItem).toContain('formatPostCardTimestampAr');
    expect(postItem).toContain("from '@/components/ui/AppText'");
    expect(postItem).toContain('formatCount(post.views ?? 0)');
  });

  it('places comment, repost, like, analytics, bookmark, then share', () => {
    const actions = postItem.slice(postItem.indexOf('styles.actions'));
    const comment = actions.indexOf('icon="chatbubble-ellipses-outline"');
    const repost = actions.indexOf('icon="repeat-2"');
    const like = actions.indexOf("icon={post.liked ? 'heart' : 'heart-outline'}");
    const views = actions.indexOf('name="bar-chart-2"');
    const bookmark = actions.indexOf("icon={post.bookmarked ? 'bookmark' : 'bookmark-outline'}");
    const share = actions.indexOf('icon="share-up"');
    expect(comment).toBeGreaterThan(-1);
    expect(repost).toBeGreaterThan(comment);
    expect(like).toBeGreaterThan(repost);
    expect(views).toBeGreaterThan(like);
    expect(bookmark).toBeGreaterThan(views);
    expect(share).toBeGreaterThan(bookmark);
    expect(actions).toContain('getRtlRow()');
    expect(actions).toContain('LIKE_RED');
    expect(actions).toContain('accessibilityLabel={`مشاهدات ${formatCount(post.views ?? 0)}`}');
  });

  it('comments are a continuation of the post feed without a section title', () => {
    expect(comments).not.toContain('styles.title');
    expect(comments).not.toContain('CoverTrailRow');
    expect(comments).not.toContain('commentBubble');
    expect(comments).not.toContain('RtlTextShell');
    expect(comments).not.toContain("textAlign: 'right'");
    expect(comments).toContain('ellipsis-vertical');
    expect(comments).toContain('اكتب تعليقاً');
    expect(comments).toContain('PostCommentsComposer');
    expect(comments).toContain('deletePostComment');
  });

  it('detail screen keeps post + replies in one feed with a sticky composer', () => {
    expect(detail).toContain('PostCommentsProvider');
    expect(detail).toContain('PostCommentsList');
    expect(detail).toContain('PostCommentsComposer');
    expect(detail).toContain('addComment');
    expect(detail).toContain('toggleLike');
    expect(detail).toContain('showPostMenu');
    expect(detail).not.toContain('formatPostCardTimestampAr');
  });

  it('formats real view counts in Arabic', () => {
    expect(formatViewsLabelAr(1)).toContain('مشاهدة');
    expect(formatViewsLabelAr(831)).toContain('مشاهدات');
    expect(formatViewsLabelAr(831)).toContain('٨٣١');
  });

  it('formats external post card relative time', () => {
    const now = Date.parse('2026-09-05T12:00:00.000Z');
    expect(formatPostCardTimestampAr(hoursAgo(5, now), now)).toBe('5س');
    expect(formatPostCardTimestampAr(hoursAgo(17, now), now)).toBe('17س');
    expect(formatPostCardTimestampAr(hoursAgo(23, now), now)).toBe('23س');
    expect(formatPostCardTimestampAr(hoursAgo(24, now), now)).toBe('1يوم');
    expect(formatPostCardTimestampAr(daysAgo(3, now), now)).toBe('3يوم');
    expect(formatPostCardTimestampAr(daysAgo(7, now), now)).toBe('7يوم');
    expect(formatPostCardTimestampAr(daysAgo(8, now), now)).toMatch(/^\d+\s+\S+$/);
    expect(formatPostCardTimestampAr(daysAgo(30, now), now)).toMatch(/^\d+\s+\S+$/);
  });

  it('downscales Cloudinary post images in the gallery without changing PostItem or the viewer', () => {
    const gallery = src('components/feature/PostMediaGallery.tsx');
    expect(gallery).toContain('postFeedImageUrl');
    expect(gallery).toContain('postFeedDeliveryUri(uri)');
    expect(gallery).toContain("contentFit: 'cover'");
    expect(gallery).toContain('aspectRatio: ASPECT_RATIO');
    expect(gallery).toContain('collectPostMedia');
    expect(gallery).toContain('collectPostMedia(images, video, media)');
    expect(gallery).toContain('MediaViewerModal');
    expect(gallery).not.toContain('cloudinaryFitUrl');
    expect(postItem).not.toContain('postFeedImageUrl');
    expect(postItem).not.toContain('cloudinaryFitUrl');
    expect(postItem).toContain('uriSource(post.author.avatar)');
    expect(postItem).toContain('<PostMediaGallery');
  });

  it('keeps the outer feed card cropped and reserves contain for internal detail', () => {
    const gallery = src('components/feature/PostMediaGallery.tsx');
    expect(gallery).toContain("variant === 'detail'");
    expect(gallery).toContain("const contentFit = isDetail ? 'contain' : 'cover'");
    expect(gallery).toContain('detailMediaHeight');
    expect(gallery).toContain('postDetailImageUrl');
    expect(postItem).toContain("variant={variant === 'detail' ? 'detail' : 'feed'}");
    expect(postItem).toContain('styles.detailBody');
    expect(postItem).toContain('متابعة');
    expect(postItem).toContain('setFollowUser');
    expect(postItem).toContain('styles.detailMedia');
  });
});
