import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE } from '@/services/api';
import { authFetch } from '@/services/authFetch';
import { dedupeInflight, shouldReuseFreshResult } from '@/services/requestCoordination';

export type MessageThreadType = 'DIRECT' | 'BUTCHER';

export type MessageThreadFilter = 'all' | 'unread' | 'transactions' | 'requests';

/** Same window as Home — skip a focus refetch when the inbox is still fresh. */
export const MESSAGES_REFRESH_TTL_MS = 60_000;

export interface MessageThreadItem {
  id: string;
  type: MessageThreadType;
  butcherId?: string | null;
  butcher?: {
    id: string;
    nameAr: string;
    nameEn?: string;
    logo?: string | null;
  } | null;
  participant: {
    id: string;
    displayName: string;
    arabicName: string;
    avatar?: string;
    verified: boolean;
  } | null;
  lastMessage: string | null;
  lastMessageAt: string;
  unread: number;
  isMine?: boolean;
  isPinned?: boolean;
  pinnedAt?: string | null;
}

type InboxCacheEntry = {
  threads: MessageThreadItem[];
  at: number;
};

let inboxOwnerToken: string | null = null;
const inboxCache = new Map<string, InboxCacheEntry>();

function sortThreads(threads: MessageThreadItem[]): MessageThreadItem[] {
  return [...threads].sort((a, b) => {
    const pinA = a.isPinned ? 1 : 0;
    const pinB = b.isPinned ? 1 : 0;
    if (pinA !== pinB) return pinB - pinA;
    return (
      new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
    );
  });
}

function mapThread(t: any, fallbackType: MessageThreadType): MessageThreadItem {
  return {
    id: t.id,
    type: (t.type as MessageThreadType) || fallbackType,
    butcherId: t.butcherId ?? null,
    butcher: t.butcher
      ? {
          id: t.butcher.id,
          nameAr: t.butcher.nameAr,
          nameEn: t.butcher.nameEn,
          logo: t.butcher.logo,
        }
      : null,
    participant: t.participant
      ? {
          id: t.participant.id,
          displayName:
            t.participant.displayName || t.participant.username || '',
          arabicName:
            t.participant.arabicName || t.participant.displayName || '',
          avatar: t.participant.avatar || undefined,
          verified: t.participant.verified ?? false,
        }
      : null,
    lastMessage: t.lastMessage,
    lastMessageAt: t.lastMessageAt,
    unread: t.unread ?? 0,
    isMine: Boolean(t.isMine),
    isPinned: Boolean(t.isPinned),
    pinnedAt: t.pinnedAt ?? null,
  };
}

async function fetchType(
  accessToken: string,
  type: MessageThreadType,
): Promise<MessageThreadItem[]> {
  const res = await authFetch(
    `${API_BASE}/api/messages?type=${encodeURIComponent(type)}`,
  );
  if (res.status === 401) {
    throw new Error('unauthorized');
  }
  if (!res.ok) throw new Error('fetch_failed');
  const json = await res.json();
  if (!json.success || !Array.isArray(json.data)) throw new Error('fetch_failed');
  return json.data.map((t: any) => mapThread(t, type));
}

function ensureInboxOwner(accessToken: string) {
  if (inboxOwnerToken === accessToken) return;
  inboxOwnerToken = accessToken;
  inboxCache.clear();
}

/** Test-only reset of inbox TTL cache. */
export function resetMessageInboxCache(): void {
  inboxOwnerToken = null;
  inboxCache.clear();
}

export function getCachedMessageInbox(
  type: MessageThreadType | 'ALL' = 'ALL',
): MessageThreadItem[] | null {
  return inboxCache.get(type)?.threads ?? null;
}

export function peekMessageInboxCachedAt(
  type: MessageThreadType | 'ALL' = 'ALL',
): number | undefined {
  return inboxCache.get(type)?.at;
}

export function inboxPreviewText(message: {
  text?: string | null;
  image?: string | null;
  video?: string | null;
}): string | null {
  const text = message.text?.trim();
  if (text) return text;
  if (message.video) return '[فيديو]';
  if (message.image) return '[صورة]';
  return null;
}

export type InboxThreadPreviewPatch = {
  threadId: string;
  lastMessage?: string | null;
  lastMessageAt?: string;
  unread?: number;
  isMine?: boolean;
  type?: MessageThreadType;
  participant?: MessageThreadItem['participant'];
  butcherId?: string | null;
  butcher?: MessageThreadItem['butcher'];
};

function applyPreviewToThreads(
  threads: MessageThreadItem[],
  patch: InboxThreadPreviewPatch,
): MessageThreadItem[] {
  const idx = threads.findIndex((t) => t.id === patch.threadId);
  if (idx >= 0) {
    const current = threads[idx];
    const nextRow: MessageThreadItem = {
      ...current,
      lastMessage:
        patch.lastMessage !== undefined ? patch.lastMessage : current.lastMessage,
      lastMessageAt: patch.lastMessageAt ?? current.lastMessageAt,
      unread: patch.unread !== undefined ? patch.unread : current.unread,
      isMine: patch.isMine !== undefined ? patch.isMine : current.isMine,
      isPinned: current.isPinned,
      pinnedAt: current.pinnedAt,
    };
    return sortThreads([
      ...threads.slice(0, idx),
      nextRow,
      ...threads.slice(idx + 1),
    ]);
  }

  if (!patch.participant && !patch.butcher) return threads;

  const created: MessageThreadItem = {
    id: patch.threadId,
    type: patch.type ?? 'DIRECT',
    butcherId: patch.butcherId ?? null,
    butcher: patch.butcher ?? null,
    participant: patch.participant ?? null,
    lastMessage: patch.lastMessage ?? null,
    lastMessageAt: patch.lastMessageAt ?? new Date().toISOString(),
    unread: patch.unread ?? 0,
    isMine: patch.isMine ?? false,
    isPinned: false,
    pinnedAt: null,
  };
  return sortThreads([created, ...threads]);
}

/** Patch the cached inbox from chat send / socket / read without a list GET. */
export function applyInboxThreadPreview(
  patch: InboxThreadPreviewPatch,
): MessageThreadItem[] | null {
  if (inboxCache.size === 0) {
    if (!patch.participant && !patch.butcher) return null;
    inboxCache.set('ALL', {
      threads: applyPreviewToThreads([], patch),
      at: 0,
    });
    return inboxCache.get('ALL')?.threads ?? null;
  }

  for (const [key, entry] of inboxCache) {
    inboxCache.set(key, {
      threads: applyPreviewToThreads(entry.threads, patch),
      at: entry.at,
    });
  }
  return inboxCache.get('ALL')?.threads ?? [...inboxCache.values()][0]?.threads ?? null;
}

export function markInboxThreadRead(threadId: string): void {
  if (!threadId) return;
  applyInboxThreadPreview({ threadId, unread: 0 });
}

function publishInbox(type: MessageThreadType | 'ALL' = 'ALL'): MessageThreadItem[] | null {
  return inboxCache.get(type)?.threads ?? [...inboxCache.values()][0]?.threads ?? null;
}

export function removeInboxThread(threadId: string): MessageThreadItem[] | null {
  if (!threadId || inboxCache.size === 0) return null;
  for (const [key, entry] of inboxCache) {
    inboxCache.set(key, {
      threads: entry.threads.filter((t) => t.id !== threadId),
      at: entry.at,
    });
  }
  return publishInbox();
}

export function setInboxThreadPinned(
  threadId: string,
  pinned: boolean,
): MessageThreadItem[] | null {
  if (!threadId || inboxCache.size === 0) return null;
  const pinnedAt = pinned ? new Date().toISOString() : null;
  for (const [key, entry] of inboxCache) {
    inboxCache.set(key, {
      threads: sortThreads(
        entry.threads.map((t) =>
          t.id === threadId ? { ...t, isPinned: pinned, pinnedAt } : t,
        ),
      ),
      at: entry.at,
    });
  }
  return publishInbox();
}

export async function hideMessageThread(threadId: string): Promise<boolean> {
  const res = await authFetch(
    `${API_BASE}/api/messages/${encodeURIComponent(threadId)}`,
    { method: 'DELETE' },
  );
  return res.ok;
}

export async function pinMessageThread(
  threadId: string,
  pinned: boolean,
): Promise<boolean> {
  const res = await authFetch(
    `${API_BASE}/api/messages/${encodeURIComponent(threadId)}/pin`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pinned }),
    },
  );
  return res.ok;
}

async function loadInbox(
  accessToken: string,
  type: MessageThreadType | 'ALL',
): Promise<MessageThreadItem[]> {
  const next =
    type === 'ALL'
      ? sortThreads(
          (
            await Promise.all([
              fetchType(accessToken, 'DIRECT'),
              fetchType(accessToken, 'BUTCHER'),
            ])
          ).flat(),
        )
      : await fetchType(accessToken, type);
  if (inboxOwnerToken === accessToken) {
    inboxCache.set(type, { threads: next, at: Date.now() });
  }
  return next;
}

export function fetchMessageInbox(
  accessToken: string,
  type: MessageThreadType | 'ALL' = 'ALL',
  options?: { force?: boolean },
): Promise<MessageThreadItem[]> {
  ensureInboxOwner(accessToken);
  const force = options?.force === true;
  const cached = inboxCache.get(type);
  if (cached && shouldReuseFreshResult(cached.at, MESSAGES_REFRESH_TTL_MS, force)) {
    return Promise.resolve(cached.threads);
  }

  return dedupeInflight(`messages:inbox:${accessToken}:${type}`, async () => {
    try {
      return await loadInbox(accessToken, type);
    } catch (err) {
      const code = err instanceof Error ? err.message : 'fetch_failed';
      if (code === 'unauthorized') {
        if (inboxOwnerToken === accessToken) inboxCache.delete(type);
        throw err;
      }
      const stale = inboxCache.get(type)?.threads;
      if (stale) return stale;
      throw err;
    }
  });
}

export function useMessageThreads(
  accessToken: string | null,
  type: MessageThreadType | 'ALL' = 'ALL',
) {
  const [threads, setThreads] = useState<MessageThreadItem[]>(
    () => (accessToken ? getCachedMessageInbox(type) ?? [] : []),
  );
  const [loading, setLoading] = useState(() => {
    if (!accessToken) return false;
    return getCachedMessageInbox(type) == null;
  });
  const [error, setError] = useState<string | null>(null);
  const hasDataRef = useRef(getCachedMessageInbox(type) != null);
  const threadsRef = useRef(threads);
  threadsRef.current = threads;

  const fetchThreads = useCallback(async (force = false) => {
    if (!accessToken) {
      resetMessageInboxCache();
      setThreads([]);
      setLoading(false);
      setError(null);
      hasDataRef.current = false;
      return;
    }

    const cachedNow = getCachedMessageInbox(type);
    if (cachedNow) {
      setThreads(cachedNow);
      hasDataRef.current = true;
    }

    if (
      shouldReuseFreshResult(
        peekMessageInboxCachedAt(type),
        MESSAGES_REFRESH_TTL_MS,
        force,
      )
    ) {
      return;
    }

    const showSpinner = !hasDataRef.current;
    if (showSpinner) setLoading(true);
    setError(null);

    try {
      const next = await fetchMessageInbox(accessToken, type, { force });
      setThreads(next);
      hasDataRef.current = true;
    } catch (err) {
      const code = err instanceof Error ? err.message : 'fetch_failed';
      setError(code === 'unauthorized' ? 'unauthorized' : 'fetch_failed');
      if (code === 'unauthorized') {
        setThreads([]);
        hasDataRef.current = false;
      }
    } finally {
      setLoading(false);
    }
  }, [accessToken, type]);

  useEffect(() => {
    void fetchThreads();
  }, [fetchThreads]);

  const hideThread = useCallback(
    async (threadId: string) => {
      if (!threadId) return false;
      const snapshot = threadsRef.current;
      const next = snapshot.filter((t) => t.id !== threadId);
      setThreads(next);
      removeInboxThread(threadId);
      const ok = await hideMessageThread(threadId);
      if (ok) return true;
      setThreads(snapshot);
      void fetchThreads(true);
      return false;
    },
    [fetchThreads],
  );

  const pinThread = useCallback(
    async (threadId: string, pinned: boolean) => {
      if (!threadId) return false;
      const snapshot = threadsRef.current;
      const fromCache = setInboxThreadPinned(threadId, pinned);
      const next =
        fromCache ??
        sortThreads(
          snapshot.map((t) =>
            t.id === threadId
              ? {
                  ...t,
                  isPinned: pinned,
                  pinnedAt: pinned ? new Date().toISOString() : null,
                }
              : t,
          ),
        );
      setThreads(next);
      const ok = await pinMessageThread(threadId, pinned);
      if (ok) return true;
      setThreads(snapshot);
      void fetchThreads(true);
      return false;
    },
    [fetchThreads],
  );

  return {
    threads,
    loading,
    error,
    refetch: fetchThreads,
    hideThread,
    pinThread,
  };
}

export function filterMessageThreads(
  threads: MessageThreadItem[],
  filter: MessageThreadFilter,
  search: string,
  listingTitlesByPeer: Record<string, string | undefined>,
): MessageThreadItem[] {
  const q = search.trim().toLowerCase();

  return threads.filter((t) => {
    if (filter === 'unread' && t.unread <= 0) return false;
    if (filter === 'transactions' && t.type !== 'BUTCHER') return false;
    if (filter === 'requests' && t.type !== 'DIRECT') return false;

    if (!q) return true;

    const p = t.participant;
    const butcherName = t.butcher?.nameAr ?? '';
    const listingTitle = p?.id ? listingTitlesByPeer[p.id] ?? '' : '';
    const haystack = [
      p?.displayName ?? '',
      p?.arabicName ?? '',
      butcherName,
      t.lastMessage ?? '',
      listingTitle,
    ]
      .join(' ')
      .toLowerCase();

    return haystack.includes(q);
  });
}
