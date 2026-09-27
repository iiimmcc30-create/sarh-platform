import { readFileSync } from 'fs';
import path from 'path';
import { recordPostView } from '@/lib/postEngagement';

jest.mock('@/services/authFetch', () => ({
  authFetch: (input: string, init?: RequestInit) => global.fetch(input, init as RequestInit),
}));

const root = path.join(__dirname, '..');
const src = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

describe('post views are recorded only by display, never by interactions', () => {
  it('records a view once even when display callbacks fire repeatedly', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { recorded: true, viewsCount: 3 } }),
    });
    (global as { fetch?: typeof fetch }).fetch = fetchMock as typeof fetch;
    const results = await Promise.all([
      recordPostView('views-lifecycle-1'),
      recordPostView('views-lifecycle-1'),
      recordPostView('views-lifecycle-1'),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('/api/posts/views-lifecycle-1/view');
    expect(results.filter((r) => r === 3)).toHaveLength(1);
  });

  it('post detail fetches once per post and never refetches on like/repost/bookmark patches', () => {
    const detail = src('app/post/[id].tsx');
    // loadPost must not depend on the cached feed object (it changes on every optimistic patch).
    expect(detail).toContain('}, [postId, router]);');
    expect(detail).not.toContain('[postId, cached, router]');
    expect(detail).not.toContain('[postId, cached, loadPost]');
    expect(detail).toContain('}, [loadPost]);');
    // Detail open records a single view through the view endpoint, keyed only on postId.
    expect(detail).toContain('void recordPostView(postId)');
    expect(detail).toMatch(/recordPostView\(postId\)[\s\S]*?\}, \[postId\]\);/);
  });

  it('interaction handlers never call the view endpoint', () => {
    const actions = src('lib/usePostFeedActions.ts');
    const bindBody = actions.slice(actions.indexOf('const bind = useCallback'), actions.indexOf('const observe'));
    expect(bindBody).not.toContain('recordPostView');
    const ctx = src('contexts/AppContext.tsx');
    const toggles = ctx.slice(ctx.indexOf('const toggleLike = useCallback'), ctx.indexOf('const addComment'));
    expect(toggles).not.toContain('/view');
    expect(toggles).not.toContain('recordPostView');
  });

  it('feed impressions come from a stable viewability callback', () => {
    const feed = src('app/(tabs)/posts.tsx');
    expect(feed).toContain('const onViewableItemsChanged = useRef(');
    expect(feed).toContain('const viewabilityConfig = useRef(');
    const actions = src('lib/usePostFeedActions.ts');
    expect(actions).toMatch(/const observe = useCallback\([\s\S]*?\[\],\s*\);/);
  });
});
