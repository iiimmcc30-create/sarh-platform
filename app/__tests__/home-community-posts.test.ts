import { readFileSync } from 'fs';
import path from 'path';
import {
  HOME_COMMUNITY_POSTS_LIMIT,
  pickHomeCommunityPosts,
} from '@/lib/homeCommunityPosts';

const root = path.join(__dirname, '..');

function src(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8');
}

describe('home community posts', () => {
  it('picks the five highest-liked posts and breaks ties by newest', () => {
    const picked = pickHomeCommunityPosts([
      { likes: 2, createdAt: '2026-09-01T00:00:00.000Z' },
      { likes: 9, createdAt: '2026-08-01T00:00:00.000Z' },
      { likes: 9, createdAt: '2026-09-10T00:00:00.000Z' },
      { likes: 1, createdAt: '2026-09-11T00:00:00.000Z' },
      { likes: 4, createdAt: '2026-09-02T00:00:00.000Z' },
      { likes: 3, createdAt: '2026-09-03T00:00:00.000Z' },
      { likes: 0, createdAt: '2026-09-12T00:00:00.000Z' },
    ]);
    expect(HOME_COMMUNITY_POSTS_LIMIT).toBe(5);
    expect(picked).toHaveLength(5);
    expect(picked.map((item) => item.likes)).toEqual([9, 9, 4, 3, 2]);
    expect(picked[0].createdAt).toBe('2026-09-10T00:00:00.000Z');
  });

  it('renders a community section component with view counts on post detail', () => {
    const home = src('app/(tabs)/index.tsx');
    const section = src('components/feature/HomeCommunityPosts.tsx');
    const postItem = src('components/feature/PostItem.tsx');
    const detail = src('app/post/[id].tsx');
    expect(home).not.toContain('<HomeCommunityPosts');
    expect(section).toContain('مجتمع سرح');
    expect(section).toContain('pickHomeCommunityPosts');
    expect(postItem).toContain('formatCount(post.views ?? 0)');
    expect(postItem).toContain('name="bar-chart-2"');
    expect(detail).toContain('viewsCount');
  });
});
