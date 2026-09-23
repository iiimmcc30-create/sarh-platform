export const ONLINE_FLAG_TTL_SEC = 3600;

export function onlineFlagKey(userId: string): string {
  return `online:${userId}`;
}

export function onlineSocketsKey(userId: string): string {
  return `online:sockets:${userId}`;
}

export type PresenceCache = {
  set(key: string, value: unknown, ttl?: number): Promise<void>;
  del(...keys: string[]): Promise<void>;
  sadd(key: string, member: string, ttl?: number): Promise<void>;
  srem(key: string, member: string): Promise<void>;
  scard(key: string): Promise<number>;
};

export async function markSocketOnline(
  cache: PresenceCache,
  userId: string,
  socketId: string,
): Promise<void> {
  await cache.sadd(onlineSocketsKey(userId), socketId, ONLINE_FLAG_TTL_SEC);
  await cache.set(
    onlineFlagKey(userId),
    { socketId, since: new Date() },
    ONLINE_FLAG_TTL_SEC,
  );
}

export async function markSocketOffline(
  cache: PresenceCache,
  userId: string,
  socketId: string,
): Promise<{ remaining: number; stillOnline: boolean }> {
  await cache.srem(onlineSocketsKey(userId), socketId);
  const remaining = await cache.scard(onlineSocketsKey(userId));
  if (remaining > 0) {
    return { remaining, stillOnline: true };
  }
  await cache.del(onlineFlagKey(userId), onlineSocketsKey(userId));
  return { remaining: 0, stillOnline: false };
}
