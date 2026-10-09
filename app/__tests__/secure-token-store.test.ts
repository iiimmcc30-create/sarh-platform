import { createTokenStore, TOKEN_KEYS, type KeyValueSecureStore } from '@/lib/secureTokenStore';
import { authFetch, registerAuthFetch } from '@/services/authFetch';

function memoryLegacy(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    multiGet: async (keys: readonly string[]) =>
      keys.map((k) => [k, data.get(k) ?? null] as const),
    multiSet: async (pairs: [string, string][]) => {
      for (const [k, v] of pairs) data.set(k, v);
    },
    multiRemove: async (keys: readonly string[]) => {
      for (const k of keys) data.delete(k);
    },
  };
}

function memorySecure(opts: { failWrites?: boolean } = {}) {
  const data = new Map<string, string>();
  const store: KeyValueSecureStore & { data: Map<string, string> } = {
    data,
    getItemAsync: async (k) => data.get(k) ?? null,
    setItemAsync: async (k, v) => {
      if (opts.failWrites) throw new Error('keychain unavailable');
      data.set(k, v);
    },
    deleteItemAsync: async (k) => {
      data.delete(k);
    },
  };
  return store;
}

const LEGACY = { [TOKEN_KEYS.ACCESS]: 'old-access', [TOKEN_KEYS.REFRESH]: 'old-refresh' };

describe('secure token store', () => {
  it('moves legacy AsyncStorage tokens into the secure store once (read old, write secure, delete old)', async () => {
    const legacy = memoryLegacy(LEGACY);
    const secure = memorySecure();
    const store = createTokenStore({ secure: () => secure, legacy: () => legacy });

    await expect(store.getTokens()).resolves.toEqual({
      accessToken: 'old-access',
      refreshToken: 'old-refresh',
    });
    expect(secure.data.get(TOKEN_KEYS.REFRESH)).toBe('old-refresh');
    expect(legacy.data.size).toBe(0);
    // Second launch reads the secure copy.
    await expect(store.getRefreshToken()).resolves.toBe('old-refresh');
  });

  it('keeps the user signed in when the secure store cannot be written', async () => {
    const legacy = memoryLegacy(LEGACY);
    const store = createTokenStore({
      secure: () => memorySecure({ failWrites: true }),
      legacy: () => legacy,
    });
    await expect(store.getRefreshToken()).resolves.toBe('old-refresh');
    expect(legacy.data.get(TOKEN_KEYS.REFRESH)).toBe('old-refresh');

    await store.setTokens('a2', 'r2');
    expect(legacy.data.get(TOKEN_KEYS.REFRESH)).toBe('r2');
  });

  it('writes new tokens only to the secure store on native', async () => {
    const legacy = memoryLegacy();
    const secure = memorySecure();
    const store = createTokenStore({ secure: () => secure, legacy: () => legacy });
    await store.setTokens('a1', 'r1');
    expect(secure.data.get(TOKEN_KEYS.ACCESS)).toBe('a1');
    expect(legacy.data.size).toBe(0);

    // An access-only refresh response keeps the stored refresh token.
    await store.setTokens('a2');
    await expect(store.getTokens()).resolves.toEqual({ accessToken: 'a2', refreshToken: 'r1' });

    await store.clearTokens();
    await expect(store.getTokens()).resolves.toEqual({ accessToken: null, refreshToken: null });
  });

  it('uses AsyncStorage (localStorage) on web', async () => {
    const legacy = memoryLegacy();
    const store = createTokenStore({ secure: () => null, legacy: () => legacy });
    await store.setTokens('a1', 'r1');
    expect(legacy.data.get(TOKEN_KEYS.REFRESH)).toBe('r1');
    await expect(store.getRefreshToken()).resolves.toBe('r1');
  });
});

/** Same shape as AuthContext.refreshSession: one shared in-flight promise. */
function singleFlight<T>(run: () => Promise<T>): () => Promise<T> {
  let inFlight: Promise<T> | null = null;
  return () => {
    if (!inFlight) inFlight = run().finally(() => { inFlight = null; });
    return inFlight;
  };
}

describe('authFetch on 401', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('three parallel 401s trigger a single refresh and all retry with the new token', async () => {
    let token = 'old';
    let refreshCalls = 0;
    const refresh = singleFlight(async () => {
      refreshCalls += 1;
      await new Promise((r) => setTimeout(r, 10));
      token = 'new';
      return true;
    });
    registerAuthFetch({ getToken: () => token, refresh });
    global.fetch = jest.fn(async (_url: unknown, init?: RequestInit) => {
      const auth = new Headers(init?.headers).get('Authorization');
      return new Response(null, { status: auth === 'Bearer new' ? 200 : 401 });
    }) as typeof fetch;

    const res = await Promise.all([authFetch('/a'), authFetch('/b'), authFetch('/c')]);
    expect(res.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(refreshCalls).toBe(1);
  });

  it('a 401 that lands after another request already rotated retries without refreshing again', async () => {
    let token = 'old';
    const refresh = jest.fn(async () => true);
    registerAuthFetch({ getToken: () => token, refresh });
    global.fetch = jest.fn(async (_url: unknown, init?: RequestInit) => {
      const auth = new Headers(init?.headers).get('Authorization');
      if (auth === 'Bearer old') {
        token = 'new'; // rotated by someone else while in flight
        return new Response(null, { status: 401 });
      }
      return new Response(null, { status: 200 });
    }) as typeof fetch;

    const res = await authFetch('/x');
    expect(res.status).toBe(200);
    expect(refresh).not.toHaveBeenCalled();
  });
});
