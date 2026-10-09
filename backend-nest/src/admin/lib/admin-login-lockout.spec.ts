import {
  ADMIN_LOGIN_MAX_FAILURES,
  ADMIN_LOGIN_WINDOW_SEC,
  clearLoginFailures,
  lockedForSeconds,
  lockoutKey,
  recordLoginFailure,
  type LockoutRedis,
} from './admin-login-lockout';

function memoryRedis(): LockoutRedis & { store: Map<string, number> } {
  const store = new Map<string, number>();
  const ttls = new Map<string, number>();
  return {
    store,
    get: async (k) => (store.has(k) ? String(store.get(k)) : null),
    incr: async (k) => {
      const n = (store.get(k) ?? 0) + 1;
      store.set(k, n);
      return n;
    },
    expire: async (k, s) => {
      ttls.set(k, s);
      return 1;
    },
    ttl: async (k) => ttls.get(k) ?? -1,
    del: async (...keys) => {
      keys.forEach((k) => store.delete(k));
      return keys.length;
    },
  };
}

describe('admin login lockout', () => {
  it('keys by normalized login without leaking it', () => {
    expect(lockoutKey(' Admin ')).toBe(lockoutKey('admin'));
    expect(lockoutKey('admin')).not.toContain('admin@');
    expect(lockoutKey('admin').startsWith('admin:login:fail:')).toBe(true);
  });

  it('locks after the max failures and unlocks on clear', async () => {
    const redis = memoryRedis();
    for (let i = 0; i < ADMIN_LOGIN_MAX_FAILURES - 1; i += 1) {
      await recordLoginFailure(redis, 'admin');
    }
    expect(await lockedForSeconds(redis, 'admin')).toBe(0);
    await recordLoginFailure(redis, 'admin');
    expect(await lockedForSeconds(redis, 'admin')).toBe(ADMIN_LOGIN_WINDOW_SEC);
    await clearLoginFailures(redis, 'admin');
    expect(await lockedForSeconds(redis, 'admin')).toBe(0);
  });

  it('fails open without Redis or on Redis errors', async () => {
    expect(await lockedForSeconds(null, 'admin')).toBe(0);
    const broken = {
      get: () => Promise.reject(new Error('down')),
      incr: () => Promise.reject(new Error('down')),
      expire: () => Promise.reject(new Error('down')),
      ttl: () => Promise.reject(new Error('down')),
      del: () => Promise.reject(new Error('down')),
    } as LockoutRedis;
    expect(await lockedForSeconds(broken, 'admin')).toBe(0);
    expect(await recordLoginFailure(broken, 'admin')).toBe(0);
    await expect(clearLoginFailures(broken, 'admin')).resolves.toBeUndefined();
  });
});
