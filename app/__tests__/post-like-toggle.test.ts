import { readFileSync } from 'fs';
import path from 'path';
import {
  isLikePending,
  LIKE_ERROR_FALLBACK_AR,
  nextLikeState,
  toggleLikeOptimistic,
  type LikeSnapshot,
} from '@/lib/postLikeToggle';

jest.mock('@/services/authFetch', () => ({
  authFetch: (input: string, init?: RequestInit) => global.fetch(input, init as RequestInit),
}));

const root = path.join(__dirname, '..');
const src = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('post like toggle', () => {
  it('computes like and unlike states', () => {
    expect(nextLikeState({ liked: false, likes: 3 })).toEqual({ liked: true, likes: 4 });
    expect(nextLikeState({ liked: true, likes: 4 })).toEqual({ liked: false, likes: 3 });
    expect(nextLikeState({ liked: true, likes: 0 })).toEqual({ liked: false, likes: 0 });
  });

  it('applies the optimistic state immediately and settles on the server answer', async () => {
    const applied: LikeSnapshot[] = [];
    const pending: boolean[] = [];
    const req = deferred<{ liked: boolean; likesCount: number }>();
    const result = toggleLikeOptimistic({
      postId: 'like-p1',
      current: { liked: false, likes: 10 },
      request: () => req.promise,
      apply: (s) => applied.push(s),
      onPendingChange: (p) => pending.push(p),
    });
    expect(applied).toEqual([{ liked: true, likes: 11 }]);
    expect(pending).toEqual([true]);
    expect(isLikePending('like-p1')).toBe(true);
    req.resolve({ liked: true, likesCount: 12 });
    await expect(result).resolves.toEqual({ ok: true, liked: true, likes: 12 });
    expect(applied[applied.length - 1]).toEqual({ liked: true, likes: 12 });
    expect(pending).toEqual([true, false]);
    expect(isLikePending('like-p1')).toBe(false);
  });

  it('pressing again unlikes', async () => {
    let state: LikeSnapshot = { liked: false, likes: 5 };
    const server = { liked: false, count: 5 };
    const request = async () => {
      server.liked = !server.liked;
      server.count += server.liked ? 1 : -1;
      return { liked: server.liked, likesCount: server.count };
    };
    const apply = (s: LikeSnapshot) => {
      state = s;
    };
    await toggleLikeOptimistic({ postId: 'like-p2', current: state, request, apply });
    expect(state).toEqual({ liked: true, likes: 6 });
    await toggleLikeOptimistic({ postId: 'like-p2', current: state, request, apply });
    expect(state).toEqual({ liked: false, likes: 5 });
  });

  it('sends a single request for rapid double taps (in-flight guard per post)', async () => {
    const req = deferred<{ liked: boolean; likesCount: number }>();
    const request = jest.fn(() => req.promise);
    const apply = jest.fn();
    const first = toggleLikeOptimistic({
      postId: 'like-p3',
      current: { liked: false, likes: 0 },
      request,
      apply,
    });
    const second = toggleLikeOptimistic({
      postId: 'like-p3',
      current: { liked: true, likes: 1 },
      request,
      apply,
    });
    const third = toggleLikeOptimistic({
      postId: 'like-p3',
      current: { liked: true, likes: 1 },
      request,
      apply,
    });
    await expect(second).resolves.toBeNull();
    await expect(third).resolves.toBeNull();
    expect(request).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledTimes(1);
    req.resolve({ liked: true, likesCount: 1 });
    await first;
    // Other posts are independent.
    const other = jest.fn(async () => ({ liked: true, likesCount: 1 }));
    await toggleLikeOptimistic({
      postId: 'like-p3-other',
      current: { liked: false, likes: 0 },
      request: other,
      apply: jest.fn(),
    });
    expect(other).toHaveBeenCalledTimes(1);
  });

  it('rolls back to the exact previous state and reports the error on failure', async () => {
    const applied: LikeSnapshot[] = [];
    const onError = jest.fn();
    const result = await toggleLikeOptimistic({
      postId: 'like-p4',
      current: { liked: true, likes: 7 },
      request: async () => {
        throw new Error('like_failed');
      },
      apply: (s) => applied.push(s),
      onError,
    });
    expect(applied).toEqual([
      { liked: false, likes: 6 },
      { liked: true, likes: 7 },
    ]);
    expect(onError).toHaveBeenCalledWith(LIKE_ERROR_FALLBACK_AR);
    expect(result).toMatchObject({ ok: false, liked: true, likes: 7 });
    expect(isLikePending('like-p4')).toBe(false);
  });

  it('wires AppContext to the helper with the app toast and a pending set', () => {
    const ctx = src('contexts/AppContext.tsx');
    expect(ctx).toContain('toggleLikeOptimistic({');
    expect(ctx).toContain("showToast(message, 'error')");
    expect(ctx).toContain('setPendingLikes');
    expect(ctx).toContain('pendingLikes,');
    // Never derive the optimistic value inside a lazy setState updater again.
    expect(ctx).not.toContain('wasLiked = prev.has(postId)');
    expect(ctx).toContain('likedPostsRef.current.has(postId)');
  });

  it('feed rows call the latest toggle and show the pending state', () => {
    const actions = src('lib/usePostFeedActions.ts');
    expect(actions).toContain('likePending: pendingLikes.has(post.id)');
    expect(actions).toContain('latest.current');
    const item = src('components/feature/PostItem.tsx');
    expect(item).toContain('pending={likePending}');
    // Busy state lives in the shared interaction button the Feed renders.
    expect(src('components/ui/InteractionActions.tsx')).toContain(
      'accessibilityState={pending ? { busy: true } : undefined}',
    );
    expect(item).toContain('Boolean(prev.likePending) !== Boolean(next.likePending)');
  });
});
