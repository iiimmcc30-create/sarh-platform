/**
 * OAuth state helpers retained for a future documented authorization_code flow.
 * Currently unused by start/callback (authorization_code is not in Daftra public docs).
 */
import { createHash, randomBytes } from 'crypto';
import { getSharedRedisClient } from '../../redis/redis-connection';

export const DAFTRA_OAUTH_STATE_TTL_SECONDS = 10 * 60;

export type DaftraOAuthStatePayload = {
  userId: string;
  butcherId: string;
  accountIdentifier: string;
  createdAt: number;
};

const memoryStore = new Map<string, { payload: string; expiresAt: number }>();

function stateRedisKey(stateHash: string): string {
  return `daftra:oauth:state:${stateHash}`;
}

function hashState(state: string): string {
  return createHash('sha256').update(state).digest('hex');
}

export function generateOAuthState(): string {
  return randomBytes(32).toString('base64url');
}

function redisEnabled(): boolean {
  return (
    process.env.REDIS_ENABLED === 'true' ||
    Boolean(process.env.REDIS_URL?.trim())
  );
}

async function redisSet(key: string, value: string, ttlSec: number) {
  if (!redisEnabled()) return false;
  try {
    const client = getSharedRedisClient(0);
    if (client.status !== 'ready' && client.status !== 'connecting') {
      return false;
    }
    await client.set(key, value, 'EX', ttlSec);
    return true;
  } catch {
    return false;
  }
}

async function redisGetDel(key: string): Promise<string | null> {
  if (!redisEnabled()) return null;
  try {
    const client = getSharedRedisClient(0);
    const value = await client.get(key);
    if (value != null) {
      await client.del(key);
    }
    return value;
  } catch {
    return null;
  }
}

export async function saveOAuthState(
  state: string,
  payload: DaftraOAuthStatePayload,
  ttlSeconds = DAFTRA_OAUTH_STATE_TTL_SECONDS,
): Promise<void> {
  const key = stateRedisKey(hashState(state));
  const serialized = JSON.stringify(payload);
  const stored = await redisSet(key, serialized, ttlSeconds);
  if (!stored) {
    memoryStore.set(key, {
      payload: serialized,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }
}

export async function consumeOAuthState(
  state: string,
): Promise<DaftraOAuthStatePayload | null> {
  if (!state?.trim()) return null;
  const key = stateRedisKey(hashState(state));

  const fromRedis = await redisGetDel(key);
  if (fromRedis) {
    try {
      return JSON.parse(fromRedis) as DaftraOAuthStatePayload;
    } catch {
      return null;
    }
  }

  const mem = memoryStore.get(key);
  memoryStore.delete(key);
  if (!mem) return null;
  if (mem.expiresAt < Date.now()) return null;
  try {
    return JSON.parse(mem.payload) as DaftraOAuthStatePayload;
  } catch {
    return null;
  }
}

export function clearOAuthStateMemoryForTests() {
  memoryStore.clear();
}
