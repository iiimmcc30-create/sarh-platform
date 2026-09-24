import { getProfileTabs } from '@/lib/profileTabs';
import { postDetailHref } from '@/lib/openPost';
import { readFileSync } from 'fs';
import path from 'path';

const root = path.join(__dirname, '..');

function src(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8');
}

describe('profile tabs', () => {
  it('builds a different tab list for own vs other profiles', () => {
    const own = getProfileTabs(true).map((tab) => tab.key);
    const other = getProfileTabs(false).map((tab) => tab.key);
    expect(own).toEqual(['posts', 'ads', 'replies', 'reposts', 'likes']);
    expect(other).toEqual(['posts', 'ads', 'replies', 'reposts']);
    expect(other).not.toContain('likes');
  });

  it('keeps likes out of the visitor tab array in source', () => {
    const visitor = src('app/users/[id].tsx');
    const tabs = src('lib/profileTabs.ts');
    expect(tabs).toContain("key: 'likes'");
    expect(visitor).not.toContain('likesContent');
    expect(visitor).toContain("tab === 'replies' || tab === 'reposts'");
    expect(visitor).not.toContain("tab === 'likes'");
  });

  it('opens the original post from a reply with replyId', () => {
    const own = src('app/(tabs)/profile.tsx');
    const visitor = src('app/users/[id].tsx');
    const open = src('lib/openPost.ts');
    const detail = src('app/post/[id].tsx');
    const comments = src('components/feature/PostCommentsSection.tsx');
    expect(own).toContain('replyId: reply.id');
    expect(visitor).toContain('replyId: reply.id');
    expect(open).toContain('replyId');
    expect(detail).toContain('highlightCommentId={replyId || undefined}');
    expect(comments).toContain('highlightCommentId');
    expect(comments).toContain('commentHighlight');
  });

  it('reuses the existing posts list route for activity', () => {
    const client = src('services/posts.ts');
    expect(client).toContain('/api/posts?userId=');
    expect(client).toContain('activity=');
    expect(client).toContain('fetchUserPostActivity');
  });

  it('keeps post detail href with optional comment focus', () => {
    expect(postDetailHref('p1')).toBe('/post/p1');
    expect(postDetailHref('p1', true)).toBe('/post/p1?focusComment=1');
  });
});
