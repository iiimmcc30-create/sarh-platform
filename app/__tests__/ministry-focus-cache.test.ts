import { readFileSync } from 'fs';
import path from 'path';
import {
  fetchMinistryAccount,
  fetchMinistryPosts,
  fetchOfficialServices,
  MINISTRY_PROFILE_TTL_MS,
  resetMinistryProfileCache,
} from '@/services/officialServices';

const root = path.join(__dirname, '..');

function src(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8');
}

let accessToken: string | null = null;

jest.mock('@/services/api', () => ({
  API_BASE: 'https://api.test',
}));

jest.mock('@/services/authFetch', () => ({
  authFetch: (input: string, init?: RequestInit) => global.fetch(input, init as RequestInit),
  getAccessToken: () => accessToken,
}));

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

const accountPayload = {
  success: true,
  data: {
    account: {
      id: 'mewa-1',
      username: 'mewa',
      arabicName: 'وزارة البيئة',
      displayName: 'MEWA',
      verified: true,
      followersCount: 10,
      servicesCount: 6,
      isFollowing: false,
    },
  },
};

const servicesPayload = {
  success: true,
  data: {
    services: [
      {
        id: 'svc-1',
        title: 'خدمة',
        description: 'وصف',
        category: 'veterinary',
        icon: 'medical-outline',
        externalUrl: 'https://naama.sa/x',
        active: true,
        createdAt: '',
        updatedAt: '',
      },
    ],
  },
};

const postsPayload = {
  success: true,
  data: {
    posts: [
      {
        id: 'post-1',
        content: 'hello',
        arabicContent: 'مرحبا',
        likesCount: 1,
        repostsCount: 0,
        commentsCount: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
        author: {
          id: 'mewa-1',
          username: 'mewa',
          displayName: 'MEWA',
          arabicName: 'وزارة البيئة',
        },
      },
    ],
  },
};

function mockMinistryNetwork() {
  const fetchMock = jest.fn(async (input: RequestInfo) => {
    const url = String(input);
    if (url.includes('/api/services/account')) return jsonResponse(accountPayload);
    if (url.includes('/api/posts?userId=')) return jsonResponse(postsPayload);
    if (url.endsWith('/api/services') || url.includes('/api/services?')) {
      return jsonResponse(servicesPayload);
    }
    return jsonResponse({ success: false }, 404);
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function countUrl(fetchMock: jest.Mock, fragment: string): number {
  return fetchMock.mock.calls.filter((call) => String(call[0]).includes(fragment)).length;
}

describe('P1-01 ministry focus refetch', () => {
  const originalFetch = global.fetch;
  let now = 1_000_000;

  beforeEach(() => {
    resetMinistryProfileCache();
    accessToken = null;
    now = 1_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('keeps existing UI wiring and skips full-screen loading when account is present', () => {
    const profile = src('app/ministry/index.tsx');
    expect(profile).toContain('await load(false)');
    expect(profile).toContain('await load(true)');
    expect(profile).toContain('fetchMinistryAccount({ force: true })');
    expect(profile).toContain('loading && !account');
    expect(profile).not.toContain('setPosts([])');
    expect(profile).toContain('setPostsLoadFailed(true)');
    expect(profile).toContain('keep previous ministry data');
    expect(src('services/officialServices.ts')).toContain('MINISTRY_PROFILE_TTL_MS');
    expect(src('services/officialServices.ts')).toContain('60_000');
  });

  it('first visit fetches account, services, and posts once each', async () => {
    const fetchMock = mockMinistryNetwork();
    const [account, services, posts] = await Promise.all([
      fetchMinistryAccount(),
      fetchOfficialServices(),
      fetchMinistryPosts('mewa-1'),
    ]);
    expect(account?.id).toBe('mewa-1');
    expect(services.services).toHaveLength(1);
    expect(posts[0].id).toBe('post-1');
    expect(countUrl(fetchMock, '/api/services/account')).toBe(1);
    expect(countUrl(fetchMock, '/api/posts?userId=')).toBe(1);
    expect(
      fetchMock.mock.calls.filter((call) => String(call[0]).endsWith('/api/services')).length,
    ).toBe(1);
  });

  it('focus within TTL does not issue another GET', async () => {
    const fetchMock = mockMinistryNetwork();
    await fetchMinistryAccount();
    await fetchOfficialServices();
    await fetchMinistryPosts('mewa-1');
    fetchMock.mockClear();

    now += MINISTRY_PROFILE_TTL_MS - 1;
    await fetchMinistryAccount();
    await fetchOfficialServices();
    await fetchMinistryPosts('mewa-1');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('focus after TTL revalidates once and keeps previous data if the GET fails', async () => {
    const fetchMock = mockMinistryNetwork();
    const firstAccount = await fetchMinistryAccount();
    const firstServices = await fetchOfficialServices();
    const firstPosts = await fetchMinistryPosts('mewa-1');
    expect(firstAccount?.arabicName).toBe('وزارة البيئة');

    now += MINISTRY_PROFILE_TTL_MS + 1;
    fetchMock.mockImplementation(async () => {
      throw new Error('network');
    });

    const account = await fetchMinistryAccount();
    const services = await fetchOfficialServices();
    const posts = await fetchMinistryPosts('mewa-1');
    expect(account).toEqual(firstAccount);
    expect(services).toEqual(firstServices);
    expect(posts).toEqual(firstPosts);
    expect(fetchMock).toHaveBeenCalled();
  });

  it('pull-to-refresh force bypasses a fresh cache', async () => {
    const fetchMock = mockMinistryNetwork();
    await fetchMinistryAccount();
    await fetchOfficialServices();
    await fetchMinistryPosts('mewa-1');
    fetchMock.mockClear();

    await fetchMinistryAccount({ force: true });
    await fetchOfficialServices({ force: true });
    await fetchMinistryPosts('mewa-1', { force: true });
    expect(countUrl(fetchMock, '/api/services/account')).toBe(1);
    expect(countUrl(fetchMock, '/api/posts?userId=')).toBe(1);
    expect(
      fetchMock.mock.calls.filter((call) => String(call[0]).endsWith('/api/services')).length,
    ).toBe(1);
  });

  it('concurrent callers share one in-flight GET even with force', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fetchMock = jest.fn(async (input: RequestInfo) => {
      await gate;
      const url = String(input);
      if (url.includes('/api/services/account')) return jsonResponse(accountPayload);
      if (url.includes('/api/posts?userId=')) return jsonResponse(postsPayload);
      return jsonResponse(servicesPayload);
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const a1 = fetchMinistryAccount();
    const a2 = fetchMinistryAccount({ force: true });
    const s1 = fetchOfficialServices();
    const s2 = fetchOfficialServices({ force: true });
    const p1 = fetchMinistryPosts('mewa-1');
    const p2 = fetchMinistryPosts('mewa-1', { force: true });
    expect(a1).toBe(a2);
    expect(s1).toBe(s2);
    expect(p1).toBe(p2);

    release();
    await Promise.all([a1, a2, s1, s2, p1, p2]);
    expect(countUrl(fetchMock, '/api/services/account')).toBe(1);
    expect(countUrl(fetchMock, '/api/posts?userId=')).toBe(1);
    expect(
      fetchMock.mock.calls.filter((call) => String(call[0]).endsWith('/api/services')).length,
    ).toBe(1);
  });

  it('replaces cached rows when a later revalidation succeeds', async () => {
    const fetchMock = mockMinistryNetwork();
    await fetchMinistryAccount();
    now += MINISTRY_PROFILE_TTL_MS + 1;
    fetchMock.mockImplementation(async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes('/api/services/account')) {
        return jsonResponse({
          success: true,
          data: {
            account: { ...accountPayload.data.account, arabicName: 'وزارة محدّثة' },
          },
        });
      }
      if (url.includes('/api/posts?userId=')) return jsonResponse(postsPayload);
      return jsonResponse(servicesPayload);
    });
    const next = await fetchMinistryAccount();
    expect(next?.arabicName).toBe('وزارة محدّثة');
  });
});
