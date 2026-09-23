import { fetchListingComments } from '@/components/feature/listingCommentsUtils';
import type { PostComment } from '@/services/types';
import { useCallback, useEffect, useRef, useState } from 'react';

/** Loads listing comments once per listingId with shared in-flight dedupe + TTL cache. */
export function useListingComments(listingId: string) {
  const listingKey = listingId?.trim() ?? '';
  const [comments, setComments] = useState<PostComment[]>([]);
  const [loading, setLoading] = useState(!!listingKey);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rateLimited, setRateLimited] = useState(false);
  const requestSeq = useRef(0);

  const applyResult = useCallback(
    (seq: number, result: Awaited<ReturnType<typeof fetchListingComments>>) => {
      if (seq !== requestSeq.current) return;
      setComments((prev) =>
        result.error && result.comments.length === 0 && prev.length > 0
          ? prev
          : result.comments,
      );
      setLoadError(result.error);
      setRateLimited(!!result.rateLimited);
      setLoading(false);
    },
    [],
  );

  const reload = useCallback(
    async (force = false) => {
      if (!listingKey) {
        requestSeq.current += 1;
        setComments([]);
        setLoadError(null);
        setRateLimited(false);
        setLoading(false);
        return;
      }

      const seq = ++requestSeq.current;
      const result = await fetchListingComments(listingKey, { force });
      applyResult(seq, result);
    },
    [applyResult, listingKey],
  );

  useEffect(() => {
    requestSeq.current += 1;
    const seq = requestSeq.current;

    if (!listingKey) {
      setComments([]);
      setLoadError(null);
      setRateLimited(false);
      setLoading(false);
      return;
    }

    setComments([]);
    setLoadError(null);
    setRateLimited(false);
    setLoading(true);
    void fetchListingComments(listingKey).then((result) => {
      applyResult(seq, result);
    });
  }, [applyResult, listingKey]);

  return {
    comments,
    loading,
    loadError,
    rateLimited,
    reload,
  };
}
