import { API_BASE } from '@/services/api';
import { authFetch } from '@/services/authFetch';

const inflight = new Map<string, Promise<unknown>>();
const viewedThisSession = new Set<string>();

export function runExclusive<T>(key: string, task: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;
  const pending = task().finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, pending);
  return pending;
}

export function hasInflight(key: string): boolean {
  return inflight.has(key);
}

export async function recordPostView(postId: string): Promise<number | null> {
  if (!postId || viewedThisSession.has(postId)) return null;
  viewedThisSession.add(postId);
  try {
    const res = await authFetch(`${API_BASE}/api/posts/${postId}/view`, {
      method: 'POST',
    });
    if (!res.ok) {
      viewedThisSession.delete(postId);
      return null;
    }
    const json = await res.json().catch(() => ({}));
    const count = json?.data?.viewsCount;
    return typeof count === 'number' ? count : null;
  } catch {
    viewedThisSession.delete(postId);
    return null;
  }
}
