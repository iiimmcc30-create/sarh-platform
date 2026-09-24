import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { shouldReuseFreshResult } from '@/services/requestCoordination';
import {
  fetchUserPostActivity,
  type ProfileActivityKind,
  type ProfileReply,
} from '@/services/posts';
import type { Post } from '@/services/types';

const ACTIVITY_TTL_MS = 60_000;

type ActivityBucket = {
  posts: Post[];
  replies: ProfileReply[];
  at: number;
  failed: boolean;
};

const emptyBucket = (): ActivityBucket => ({
  posts: [],
  replies: [],
  at: 0,
  failed: false,
});

export function useProfileActivity(userId: string | null | undefined) {
  const [replies, setReplies] = useState<ProfileReply[]>([]);
  const [reposts, setReposts] = useState<Post[]>([]);
  const [likes, setLikes] = useState<Post[]>([]);
  const [loading, setLoading] = useState<Partial<Record<ProfileActivityKind, boolean>>>({});
  const [failed, setFailed] = useState<Partial<Record<ProfileActivityKind, boolean>>>({});
  const cacheRef = useRef<Partial<Record<ProfileActivityKind, ActivityBucket>>>({});

  useEffect(() => {
    cacheRef.current = {};
    setReplies([]);
    setReposts([]);
    setLikes([]);
    setFailed({});
    setLoading({});
  }, [userId]);

  const load = useCallback(
    async (kind: ProfileActivityKind, force = false) => {
      if (!userId) return;
      const cached = cacheRef.current[kind];
      if (cached && shouldReuseFreshResult(cached.at, ACTIVITY_TTL_MS, force)) {
        if (kind === 'replies') setReplies(cached.replies);
        if (kind === 'reposts') setReposts(cached.posts);
        if (kind === 'likes') setLikes(cached.posts);
        setFailed((prev) => ({ ...prev, [kind]: cached.failed }));
        return;
      }

      setLoading((prev) => ({ ...prev, [kind]: true }));
      try {
        const result = await fetchUserPostActivity(userId, kind);
        const next: ActivityBucket = {
          posts: result.posts,
          replies: result.replies,
          at: Date.now(),
          failed: false,
        };
        cacheRef.current[kind] = next;
        if (kind === 'replies') setReplies(next.replies);
        if (kind === 'reposts') setReposts(next.posts);
        if (kind === 'likes') setLikes(next.posts);
        setFailed((prev) => ({ ...prev, [kind]: false }));
      } catch {
        cacheRef.current[kind] = {
          ...(cacheRef.current[kind] ?? emptyBucket()),
          at: Date.now(),
          failed: true,
        };
        setFailed((prev) => ({ ...prev, [kind]: true }));
      } finally {
        setLoading((prev) => ({ ...prev, [kind]: false }));
      }
    },
    [userId],
  );

  const reloadVisited = useCallback(async () => {
    const kinds = (Object.keys(cacheRef.current) as ProfileActivityKind[]).filter(
      (kind) => cacheRef.current[kind],
    );
    await Promise.all(kinds.map((kind) => load(kind, true)));
  }, [load]);

  const reset = useCallback(() => {
    cacheRef.current = {};
    setReplies([]);
    setReposts([]);
    setLikes([]);
    setFailed({});
    setLoading({});
  }, []);

  return useMemo(
    () => ({ replies, reposts, likes, loading, failed, load, reloadVisited, reset }),
    [replies, reposts, likes, loading, failed, load, reloadVisited, reset],
  );
}
