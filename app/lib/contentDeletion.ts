/**
 * Successful post/listing deletions (pure, no RN imports).
 * AppContext emits only after the DELETE request succeeds; screens and hooks
 * that keep their own copies (profile listings pager, profile activity, a
 * visited profile) drop that one item. Nothing app-wide is invalidated.
 */
export type DeletedContent = {
  kind: 'post' | 'listing';
  id: string;
  /** Author / seller id when known. */
  ownerId?: string | null;
};

type Listener = (event: DeletedContent) => void;

const listeners = new Set<Listener>();

export function onContentDeleted(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitContentDeleted(event: DeletedContent): void {
  if (!event?.id) return;
  listeners.forEach((listener) => {
    try {
      listener(event);
    } catch {
      /* one bad listener must not block the rest */
    }
  });
}

/** Counter after one successful deletion, clamped at 0. */
export function decrementCount(value: number | null | undefined): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return Math.max(0, n - 1);
}

/** Same array when the id is absent (no extra render). */
export function withoutId<T extends { id: string }>(list: readonly T[], id: string): T[] {
  if (!list.some((item) => item.id === id)) return list as T[];
  return list.filter((item) => item.id !== id);
}

/** Own counters after a successful deletion. Only the owner's posts counter moves. */
export function applyDeletionToCounts<T extends { id: string; postsCount?: number }>(
  me: T,
  event: DeletedContent,
): T {
  if (event.kind !== 'post' || !event.ownerId || event.ownerId !== me.id) return me;
  return { ...me, postsCount: decrementCount(me.postsCount) };
}