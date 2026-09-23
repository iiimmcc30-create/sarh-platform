import { readFileSync } from 'fs';
import path from 'path';
import { applyChatSocketEvent } from '@/lib/chatRealtime';
import {
  applyInboxThreadPreview,
  fetchMessageInbox,
  getCachedMessageInbox,
  inboxPreviewText,
  markInboxThreadRead,
  MESSAGES_REFRESH_TTL_MS,
  resetMessageInboxCache,
} from '@/hooks/useMessageThreads';
import { resetRequestCoordination } from '@/services/requestCoordination';
import {
  fetchUserProfile,
  getCachedUserProfile,
  PUBLIC_PROFILE_TTL_MS,
  resetPublicProfileCache,
} from '@/services/users';

const root = path.join(__dirname, '..');

function src(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8');
}

const fetchWithTimeout = jest.fn();
jest.mock('@/services/fetchWithTimeout', () => ({
  fetchWithTimeout: (...args: unknown[]) => fetchWithTimeout(...args),
}));

jest.mock('@/services/api', () => ({
  API_BASE: 'https://api.test',
}));

function jsonResponse(body: unknown, status = 200): Response {
  const text = JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: { get: () => null },
    json: async () => JSON.parse(text),
    text: async () => text,
  } as unknown as Response;
}

function profilePayload(id: string, extra: Record<string, unknown> = {}) {
  return {
    success: true,
    data: {
      id,
      username: id,
      displayName: id,
      arabicName: id,
      verified: false,
      rating: null,
      reviewCount: 0,
      followersCount: 1,
      followingCount: 0,
      listingsCount: 0,
      postsCount: 0,
      isFollowing: false,
      ...extra,
    },
  };
}

function threadRow(
  id: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    type: 'DIRECT',
    lastMessage: 'مرحبا',
    lastMessageAt: '2026-09-16T10:00:00.000Z',
    unread: 2,
    isMine: false,
    participant: {
      id: `peer-${id}`,
      displayName: id,
      arabicName: id,
      verified: false,
    },
    ...extra,
  };
}

function profileGets(userId?: string) {
  return fetchWithTimeout.mock.calls.filter(([url]) => {
    const href = String(url);
    if (userId) return href === `https://api.test/api/users/${userId}`;
    return href.startsWith('https://api.test/api/users/') && !href.includes('/connections');
  }).length;
}

function inboxGets() {
  return fetchWithTimeout.mock.calls.filter(([url]) =>
    String(url).startsWith('https://api.test/api/messages?type='),
  ).length;
}

describe('P1-02 public profile focus cache', () => {
  let now = 1_000_000;

  beforeEach(() => {
    resetPublicProfileCache();
    resetRequestCoordination();
    now = 1_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    fetchWithTimeout.mockReset();
  });

  afterEach(() => {
    resetPublicProfileCache();
    resetRequestCoordination();
    jest.restoreAllMocks();
  });

  it('keeps a 60s per-userId TTL and hydrates /users/[id] without a spinner wipe', () => {
    const users = src('services/users.ts');
    const screen = src('app/users/[id].tsx');
    expect(users).toContain('PUBLIC_PROFILE_TTL_MS');
    expect(users).toContain('60_000');
    expect(users).toContain('shouldReuseFreshResult');
    expect(users).toContain('dedupeInflight(`GET:/api/users/${id}`');
    expect(screen).toContain('getCachedUserProfile');
    expect(screen).toContain('void loadProfile()');
    expect(screen).toContain('loadProfile(true)');
    expect(screen).toContain('fetchAuthoritativeProfile(true)');
    expect(screen).toContain('fetchAuthoritativeProfile(false)');
    expect(screen).toContain('listingsLoadGen');
    expect(screen).toContain('loadedExtrasForRef');
    expect(src('app/_layout.tsx')).toContain('enableFreeze(true)');
    expect(src('app/_layout.tsx')).toContain('freezeOnBlur: true');
  });

  it('first open without cache issues one GET', async () => {
    fetchWithTimeout.mockResolvedValue(jsonResponse(profilePayload('user-a')));
    const profile = await fetchUserProfile('user-a');
    expect(profile?.id).toBe('user-a');
    expect(profileGets('user-a')).toBe(1);
  });

  it('return within TTL issues 0 GET', async () => {
    fetchWithTimeout.mockResolvedValue(jsonResponse(profilePayload('user-a')));
    await fetchUserProfile('user-a');
    fetchWithTimeout.mockClear();
    now += PUBLIC_PROFILE_TTL_MS - 1;
    const again = await fetchUserProfile('user-a');
    expect(again?.id).toBe('user-a');
    expect(profileGets()).toBe(0);
  });

  it('after TTL revalidates once and keeps the previous profile during the GET', async () => {
    fetchWithTimeout.mockResolvedValue(
      jsonResponse(profilePayload('user-a', { displayName: 'old' })),
    );
    await fetchUserProfile('user-a');
    expect(getCachedUserProfile('user-a')?.displayName).toBe('old');
    fetchWithTimeout.mockClear();

    now += PUBLIC_PROFILE_TTL_MS + 1;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    fetchWithTimeout.mockImplementation(async () => {
      await gate;
      return jsonResponse(profilePayload('user-a', { displayName: 'new' }));
    });

    const pending = fetchUserProfile('user-a');
    expect(getCachedUserProfile('user-a')?.displayName).toBe('old');
    release();
    const next = await pending;
    expect(next?.displayName).toBe('new');
    expect(profileGets('user-a')).toBe(1);
  });

  it('force refresh bypasses TTL', async () => {
    fetchWithTimeout.mockResolvedValue(
      jsonResponse(profilePayload('user-a', { isFollowing: false })),
    );
    await fetchUserProfile('user-a');
    fetchWithTimeout.mockReset();
    fetchWithTimeout.mockResolvedValue(
      jsonResponse(profilePayload('user-a', { isFollowing: true })),
    );
    const refreshed = await fetchUserProfile('user-a', { force: true });
    expect(refreshed?.isFollowing).toBe(true);
    expect(profileGets('user-a')).toBe(1);
  });

  it('concurrent profile requests for the same userId share one GET', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    fetchWithTimeout.mockImplementation(async () => {
      await gate;
      return jsonResponse(profilePayload('user-a'));
    });
    const first = fetchUserProfile('user-a');
    const second = fetchUserProfile('user-a', { force: true });
    expect(first).toBe(second);
    release();
    await Promise.all([first, second]);
    expect(profileGets('user-a')).toBe(1);
  });

  it('does not share profile cache between user A and user B', async () => {
    fetchWithTimeout.mockImplementation(async (url: string) => {
      const id = String(url).split('/').pop() as string;
      return jsonResponse(profilePayload(id, { displayName: id }));
    });
    const a = await fetchUserProfile('user-a');
    const b = await fetchUserProfile('user-b');
    expect(a?.id).toBe('user-a');
    expect(b?.id).toBe('user-b');
    expect(getCachedUserProfile('user-a')?.id).toBe('user-a');
    expect(getCachedUserProfile('user-b')?.id).toBe('user-b');
    expect(profileGets('user-a')).toBe(1);
    expect(profileGets('user-b')).toBe(1);
    fetchWithTimeout.mockClear();
    await fetchUserProfile('user-a');
    expect(profileGets()).toBe(0);
  });

  it('background error does not wipe the current profile', async () => {
    fetchWithTimeout.mockResolvedValue(
      jsonResponse(profilePayload('user-a', { bio: 'kept' })),
    );
    await fetchUserProfile('user-a');
    now += PUBLIC_PROFILE_TTL_MS + 1;
    fetchWithTimeout.mockResolvedValue(jsonResponse({ success: false }, 500));
    const afterError = await fetchUserProfile('user-a');
    expect(afterError?.bio).toBe('kept');
    expect(getCachedUserProfile('user-a')?.bio).toBe('kept');
  });

  it('listing follow still force-refreshes seller isFollowing', () => {
    const listing = src('app/listing/[id].tsx');
    expect(listing).toContain('fetchUserProfile(sellerId, { force })');
    expect(listing).toContain('refreshSellerFollowState(true)');
  });
});

describe('P1-07 chat inbox focus cache', () => {
  let now = 1_000_000;

  beforeEach(() => {
    resetMessageInboxCache();
    resetRequestCoordination();
    now = 1_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    fetchWithTimeout.mockReset();
    fetchWithTimeout.mockImplementation(async (url: string) => {
      const href = String(url);
      if (href.includes('type=DIRECT')) {
        return jsonResponse({ success: true, data: [threadRow('t-direct')] });
      }
      if (href.includes('type=BUTCHER')) {
        return jsonResponse({
          success: true,
          data: [
            threadRow('t-butcher', {
              type: 'BUTCHER',
              lastMessageAt: '2026-09-16T09:00:00.000Z',
              unread: 0,
            }),
          ],
        });
      }
      return jsonResponse({ success: false }, 500);
    });
  });

  afterEach(() => {
    resetMessageInboxCache();
    resetRequestCoordination();
    jest.restoreAllMocks();
  });

  it('keeps inbox TTL, empty-recovery force, and conversation cache patches', () => {
    const hook = src('hooks/useMessageThreads.ts');
    const panel = src('components/feature/MessagesPanel.tsx');
    const chat = src('app/chat.tsx');
    expect(hook).toContain('MESSAGES_REFRESH_TTL_MS');
    expect(hook).toContain('60_000');
    expect(hook).toContain('fetchMessageInbox');
    expect(hook).toContain('applyInboxThreadPreview');
    expect(hook).toContain('if (showSpinner) setLoading(true)');
    expect(panel).toContain('const forceEmpty = threadsLenRef.current === 0 && !loadingRef.current');
    expect(panel).toContain('void refetch(forceEmpty)');
    expect(panel).toContain('await refetch(true)');
    expect(panel).toContain('RefreshControl');
    expect(chat).toContain('applyChatSocketEvent');
    expect(chat).toContain('applyInboxThreadPreview');
    expect(chat).toContain('markInboxThreadRead');
    expect(src('app/(tabs)/_layout.tsx')).toContain('freezeOnBlur: true');
  });

  it('first inbox open issues one DIRECT+BUTCHER fetch round', async () => {
    const threads = await fetchMessageInbox('token-a');
    expect(threads.map((t) => t.id)).toEqual(['t-direct', 't-butcher']);
    expect(inboxGets()).toBe(2);
  });

  it('returning from a conversation within TTL issues 0 GET', async () => {
    await fetchMessageInbox('token-a');
    fetchWithTimeout.mockClear();
    now += MESSAGES_REFRESH_TTL_MS - 1;
    const again = await fetchMessageInbox('token-a');
    expect(again).toHaveLength(2);
    expect(inboxGets()).toBe(0);
  });

  it('returning from another tab within TTL issues 0 GET', async () => {
    await fetchMessageInbox('token-a');
    fetchWithTimeout.mockClear();
    now += 10_000;
    await fetchMessageInbox('token-a');
    await fetchMessageInbox('token-a');
    expect(inboxGets()).toBe(0);
  });

  it('after TTL background-revalidates once without wiping the list', async () => {
    await fetchMessageInbox('token-a');
    expect(getCachedMessageInbox('ALL')?.map((t) => t.id)).toEqual([
      't-direct',
      't-butcher',
    ]);
    fetchWithTimeout.mockClear();

    now += MESSAGES_REFRESH_TTL_MS + 1;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    fetchWithTimeout.mockImplementation(async (url: string) => {
      await gate;
      const href = String(url);
      if (href.includes('type=DIRECT')) {
        return jsonResponse({
          success: true,
          data: [threadRow('t-direct', { lastMessage: 'updated' })],
        });
      }
      return jsonResponse({ success: true, data: [] });
    });

    const pending = fetchMessageInbox('token-a');
    expect(getCachedMessageInbox('ALL')?.map((t) => t.id)).toEqual([
      't-direct',
      't-butcher',
    ]);
    release();
    const next = await pending;
    expect(next[0]?.lastMessage).toBe('updated');
    expect(inboxGets()).toBe(2);
  });

  it('pull-to-refresh force bypasses TTL', async () => {
    await fetchMessageInbox('token-a');
    fetchWithTimeout.mockClear();
    await fetchMessageInbox('token-a', 'ALL', { force: true });
    expect(inboxGets()).toBe(2);
  });

  it('concurrent inbox requests share one GET round', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    fetchWithTimeout.mockImplementation(async (url: string) => {
      await gate;
      return jsonResponse({
        success: true,
        data: String(url).includes('DIRECT') ? [threadRow('t-direct')] : [],
      });
    });
    const first = fetchMessageInbox('token-a');
    const second = fetchMessageInbox('token-a', 'ALL', { force: true });
    expect(first).toBe(second);
    release();
    await Promise.all([first, second]);
    expect(inboxGets()).toBe(2);
  });

  it('socket message updates lastMessage, unread, and ordering without a list GET', async () => {
    await fetchMessageInbox('token-a');
    fetchWithTimeout.mockClear();

    const conversation = applyChatSocketEvent(
      [],
      {
        id: 'm-1',
        threadId: 't-butcher',
        senderId: 'peer-t-butcher',
        receiverId: 'me',
        text: 'رسالة جديدة',
        createdAt: '2026-09-16T12:00:00.000Z',
      },
      't-butcher',
    );
    expect(conversation.map((m) => m.id)).toEqual(['m-1']);

    applyInboxThreadPreview({
      threadId: 't-butcher',
      lastMessage: inboxPreviewText({ text: 'رسالة جديدة' }),
      lastMessageAt: '2026-09-16T12:00:00.000Z',
      unread: 3,
      isMine: false,
    });
    const cached = getCachedMessageInbox('ALL');
    expect(cached?.map((t) => t.id)).toEqual(['t-butcher', 't-direct']);
    expect(cached?.[0]?.lastMessage).toBe('رسالة جديدة');
    expect(cached?.[0]?.unread).toBe(3);
    expect(inboxGets()).toBe(0);

    markInboxThreadRead('t-butcher');
    expect(getCachedMessageInbox('ALL')?.[0]?.unread).toBe(0);
    expect(inboxGets()).toBe(0);
  });

  it('keeps the inbox list when a background revalidate fails', async () => {
    await fetchMessageInbox('token-a');
    now += MESSAGES_REFRESH_TTL_MS + 1;
    fetchWithTimeout.mockResolvedValue(jsonResponse({ success: false }, 500));
    const afterError = await fetchMessageInbox('token-a');
    expect(afterError.map((t) => t.id)).toEqual(['t-direct', 't-butcher']);
    expect(getCachedMessageInbox('ALL')?.map((t) => t.id)).toEqual([
      't-direct',
      't-butcher',
    ]);
  });
});
