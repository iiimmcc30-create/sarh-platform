import { AuthService } from './auth.service';
import { ApiException } from '../../common/exceptions/api.exception';
import {
  REFRESH_REUSE_GRACE_MS,
  hashRefreshToken,
  openGracePair,
  sealGracePair,
} from '../lib/refresh-token-hash';

type Row = {
  id: string;
  userId: string;
  refreshToken: string;
  previousTokenHash: string | null;
  rotatedAt: Date | null;
  expiresAt: Date;
};

const USER = {
  id: 'u1',
  username: 'mutab',
  role: 'USER',
  isActive: true,
  passwordVersion: 0,
};

const tick = () => new Promise<void>((r) => setImmediate(r));

/** In-memory UserSession table with the repository's real semantics. */
function makeRepo(initial: Row[]) {
  const rows = new Map(initial.map((r) => [r.id, { ...r }]));
  const snapshot = (r: Row) => ({ ...r, user: { ...USER } });
  return {
    rows,
    findSessionForRefresh: jest.fn(async (token: string) => {
      await tick();
      const hash = hashRefreshToken(token);
      for (const r of rows.values()) {
        if (
          r.refreshToken === hash ||
          r.refreshToken === token ||
          r.previousTokenHash === hash
        )
          return snapshot(r);
      }
      return null;
    }),
    rotateSessionIfCurrent: jest.fn(
      async (a: {
        sessionId: string;
        expectedStored: string;
        newRefreshToken: string;
        previousTokenHash: string;
        expiresAt: Date;
      }) => {
        await tick();
        const r = rows.get(a.sessionId);
        if (!r || r.refreshToken !== a.expectedStored) return 0;
        r.refreshToken = hashRefreshToken(a.newRefreshToken);
        r.previousTokenHash = a.previousTokenHash;
        r.rotatedAt = new Date();
        r.expiresAt = a.expiresAt;
        return 1;
      },
    ),
    reissueSessionInGrace: jest.fn(
      async (a: {
        sessionId: string;
        expectedStored: string;
        newRefreshToken: string;
        expiresAt: Date;
      }) => {
        await tick();
        const r = rows.get(a.sessionId);
        if (!r || r.refreshToken !== a.expectedStored) return 0;
        r.refreshToken = hashRefreshToken(a.newRefreshToken);
        r.expiresAt = a.expiresAt;
        return 1;
      },
    ),
    deleteAllSessions: jest.fn(async (userId: string) => {
      for (const [id, r] of rows) if (r.userId === userId) rows.delete(id);
      return { count: 0 };
    }),
    deleteSession: jest.fn(async (id: string) => rows.delete(id)),
  };
}

function makeRedis() {
  const store = new Map<string, unknown>();
  return {
    store,
    set: jest.fn(async (k: string, v: unknown) => {
      store.set(k, v);
    }),
    get: jest.fn(async (k: string) => (store.get(k) ?? null) as never),
    del: jest.fn(),
  };
}

function makeService(initial: Row[]) {
  const repo = makeRepo(initial);
  const redis = makeRedis();
  let n = 0;
  const jwtService = {
    signAccessToken: jest.fn(() => `access.${++n}.sig`),
    signRefreshToken: jest.fn(() => `refresh.${++n}.sig`),
    verifyRefreshToken: jest.fn((t: string) => {
      if (!t.startsWith('refresh.')) throw new Error('bad');
      return { userId: 'u1', jti: t };
    }),
  };
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const service = new AuthService(
    repo as never,
    jwtService as never,
    redis as never,
    logger as never,
    { disconnectUser: jest.fn() } as never,
    { addEmail: jest.fn() } as never,
    { get: jest.fn(() => undefined) } as never,
  );
  return { service, repo, redis, logger };
}

const future = () => new Date(Date.now() + 86_400_000);
const T0 = 'refresh.0.sig';

function sessionRow(stored: string, extra: Partial<Row> = {}): Row {
  return {
    id: 's1',
    userId: 'u1',
    refreshToken: stored,
    previousTokenHash: null,
    rotatedAt: null,
    expiresAt: future(),
    ...extra,
  };
}

async function expectApiError(p: Promise<unknown>, code: string) {
  try {
    await p;
  } catch (err) {
    expect(err).toBeInstanceOf(ApiException);
    expect((err as ApiException).error).toBe(code);
    return;
  }
  throw new Error(`expected ${code}`);
}

describe('AuthService.refresh — hashed, atomic rotation with a 30s grace', () => {
  it('rotates a hashed session and never stores the token in clear', async () => {
    const { service, repo } = makeService([sessionRow(hashRefreshToken(T0))]);
    const pair = await service.refresh({ refreshToken: T0 });

    const row = repo.rows.get('s1')!;
    expect(row.refreshToken).toBe(hashRefreshToken(pair.refreshToken));
    expect(row.refreshToken).not.toContain('.');
    expect(row.previousTokenHash).toBe(hashRefreshToken(T0));
    expect(row.rotatedAt).toBeInstanceOf(Date);

    // The new token works for the next rotation.
    const next = await service.refresh({ refreshToken: pair.refreshToken });
    expect(next.refreshToken).not.toBe(pair.refreshToken);
    expect(repo.deleteAllSessions).not.toHaveBeenCalled();
  });

  it('accepts a legacy plaintext session and re-hashes it (no logout on deploy)', async () => {
    const { service, repo } = makeService([sessionRow(T0)]);
    const pair = await service.refresh({ refreshToken: T0 });

    const row = repo.rows.get('s1')!;
    expect(row.refreshToken).toMatch(/^[0-9a-f]{64}$/);
    expect(row.refreshToken).toBe(hashRefreshToken(pair.refreshToken));
    expect(repo.rotateSessionIfCurrent).toHaveBeenCalledWith(
      expect.objectContaining({ expectedStored: T0 }),
    );
    expect(repo.deleteAllSessions).not.toHaveBeenCalled();
  });

  it('two concurrent refreshes with the same token share one rotation', async () => {
    const { service, repo } = makeService([sessionRow(hashRefreshToken(T0))]);
    const [a, b] = await Promise.all([
      service.refresh({ refreshToken: T0 }),
      service.refresh({ refreshToken: T0 }),
    ]);

    expect(a).toEqual(b);
    expect(repo.deleteAllSessions).not.toHaveBeenCalled();
    expect(repo.rows.get('s1')!.refreshToken).toBe(
      hashRefreshToken(a.refreshToken),
    );
    // Whichever response the app kept still refreshes.
    await expect(
      service.refresh({ refreshToken: a.refreshToken }),
    ).resolves.toBeDefined();
  });

  it('a replay of the previous token inside the grace returns the same pair', async () => {
    const { service, repo } = makeService([sessionRow(hashRefreshToken(T0))]);
    const first = await service.refresh({ refreshToken: T0 }); // response "lost"
    const replay = await service.refresh({ refreshToken: T0 });

    expect(replay).toEqual(first);
    expect(repo.deleteAllSessions).not.toHaveBeenCalled();
  });

  it('without the Redis copy, a grace replay gets a fresh working pair and does not extend the window', async () => {
    const { service, repo, redis } = makeService([
      sessionRow(hashRefreshToken(T0)),
    ]);
    await service.refresh({ refreshToken: T0 });
    const rotatedAt = repo.rows.get('s1')!.rotatedAt;
    redis.store.clear();

    const replay = await service.refresh({ refreshToken: T0 });
    const row = repo.rows.get('s1')!;
    expect(row.refreshToken).toBe(hashRefreshToken(replay.refreshToken));
    expect(row.previousTokenHash).toBe(hashRefreshToken(T0));
    expect(row.rotatedAt).toBe(rotatedAt);
    expect(repo.deleteAllSessions).not.toHaveBeenCalled();
    await expect(
      service.refresh({ refreshToken: replay.refreshToken }),
    ).resolves.toBeDefined();
  });

  it('a replay of the previous token after the grace still revokes every session', async () => {
    const { service, repo } = makeService([
      sessionRow(hashRefreshToken('refresh.9.sig'), {
        previousTokenHash: hashRefreshToken(T0),
        rotatedAt: new Date(Date.now() - REFRESH_REUSE_GRACE_MS - 1000),
      }),
    ]);
    await expectApiError(service.refresh({ refreshToken: T0 }), 'token_reuse');
    expect(repo.deleteAllSessions).toHaveBeenCalledWith('u1');
    expect(repo.rows.size).toBe(0);
  });

  it('an unknown (older) token still revokes every session', async () => {
    const { service, repo } = makeService([sessionRow(hashRefreshToken(T0))]);
    await expectApiError(
      service.refresh({ refreshToken: 'refresh.old.sig' }),
      'token_reuse',
    );
    expect(repo.deleteAllSessions).toHaveBeenCalledWith('u1');
  });

  it('rejects an expired session without revoking the others', async () => {
    const { service, repo } = makeService([
      sessionRow(hashRefreshToken(T0), { expiresAt: new Date(Date.now() - 1) }),
    ]);
    await expectApiError(
      service.refresh({ refreshToken: T0 }),
      'session_expired',
    );
    expect(repo.deleteAllSessions).not.toHaveBeenCalled();
  });
});

describe('grace pair sealing', () => {
  it('only the previous token can open the cached pair', () => {
    const pair = { accessToken: 'a.b.c', refreshToken: 'd.e.f' };
    const sealed = sealGracePair(T0, pair);
    expect(sealed).not.toContain('d.e.f');
    expect(openGracePair(T0, sealed)).toEqual(pair);
    expect(openGracePair('refresh.other.sig', sealed)).toBeNull();
    expect(openGracePair(T0, 'garbage')).toBeNull();
  });
});
