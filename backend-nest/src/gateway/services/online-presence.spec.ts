import {
  markSocketOffline,
  markSocketOnline,
  onlineFlagKey,
  type PresenceCache,
} from './online-presence';

function memoryPresence(): PresenceCache & {
  flags: Map<string, unknown>;
  sets: Map<string, Set<string>>;
} {
  const flags = new Map<string, unknown>();
  const sets = new Map<string, Set<string>>();
  return {
    flags,
    sets,
    async set(key, value) {
      flags.set(key, value);
    },
    async del(...keys) {
      for (const key of keys) {
        flags.delete(key);
        sets.delete(key);
      }
    },
    async sadd(key, member) {
      const set = sets.get(key) ?? new Set<string>();
      set.add(member);
      sets.set(key, set);
    },
    async srem(key, member) {
      sets.get(key)?.delete(member);
    },
    async scard(key) {
      return sets.get(key)?.size ?? 0;
    },
  };
}

describe('M9 multi-device online presence', () => {
  it('stays online when one of two devices disconnects', async () => {
    const cache = memoryPresence();
    await markSocketOnline(cache, 'u1', 'socket-a');
    await markSocketOnline(cache, 'u1', 'socket-b');

    const afterA = await markSocketOffline(cache, 'u1', 'socket-a');
    expect(afterA.stillOnline).toBe(true);
    expect(cache.flags.has(onlineFlagKey('u1'))).toBe(true);

    const afterB = await markSocketOffline(cache, 'u1', 'socket-b');
    expect(afterB.stillOnline).toBe(false);
    expect(cache.flags.has(onlineFlagKey('u1'))).toBe(false);
  });

  it('does not corrupt presence on duplicate disconnect', async () => {
    const cache = memoryPresence();
    await markSocketOnline(cache, 'u1', 'socket-a');
    await markSocketOnline(cache, 'u1', 'socket-b');

    await markSocketOffline(cache, 'u1', 'socket-a');
    const dup = await markSocketOffline(cache, 'u1', 'socket-a');
    expect(dup.stillOnline).toBe(true);
    expect(cache.flags.has(onlineFlagKey('u1'))).toBe(true);

    const last = await markSocketOffline(cache, 'u1', 'socket-b');
    expect(last.stillOnline).toBe(false);
  });
});
