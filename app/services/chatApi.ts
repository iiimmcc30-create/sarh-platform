// Messaging REST helpers (general 1:1 conversations — never tied to listings).
import { API_BASE } from '@/services/api';
import { authFetch } from '@/services/authFetch';

export type ChatPeer = {
  id: string;
  displayName: string;
  arabicName: string;
  avatar?: string | null;
  username?: string | null;
  verified: boolean;
};

export type ChatContact = ChatPeer & {
  source: 'recent' | 'following' | 'follower' | 'search';
};

export type PeerConversation = {
  threadId: string | null;
  participant: ChatPeer | null;
};

/** Existing 1:1 thread with a user (reused for every entry point), or null. */
export async function fetchPeerConversation(
  peerId: string,
): Promise<PeerConversation | null> {
  const res = await authFetch(
    `${API_BASE}/api/messages/peer/${encodeURIComponent(peerId)}`,
    {},
    20_000,
  );
  if (!res.ok) return null;
  const json = await res.json().catch(() => null);
  if (!json?.success || !json.data) return null;
  return {
    threadId: typeof json.data.threadId === 'string' ? json.data.threadId : null,
    participant: json.data.participant ?? null,
  };
}

/** People you can start a chat with (following/followers/past chats + search). */
export async function fetchMessageContacts(
  q = '',
  signal?: AbortSignal,
): Promise<ChatContact[]> {
  const query = q.trim();
  const url = `${API_BASE}/api/messages/contacts${query ? `?q=${encodeURIComponent(query)}` : ''}`;
  const res = await authFetch(url, signal ? { signal } : {}, 20_000);
  if (!res.ok) throw new Error('contacts_failed');
  const json = await res.json().catch(() => null);
  return Array.isArray(json?.data) ? (json.data as ChatContact[]) : [];
}

/** Local filter used while a remote search is in flight (instant results). */
export function filterContactsLocally(
  contacts: ChatContact[],
  q: string,
): ChatContact[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return contacts;
  return contacts.filter((c) =>
    [c.arabicName, c.displayName, c.username]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(needle)),
  );
}

/** Merge remote search results into the base list without duplicates. */
export function mergeContacts(
  base: ChatContact[],
  extra: ChatContact[],
): ChatContact[] {
  const seen = new Set(base.map((c) => c.id));
  const out = [...base];
  for (const c of extra) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    out.push(c);
  }
  return out;
}
