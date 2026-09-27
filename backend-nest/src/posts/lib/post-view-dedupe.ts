import { createHash } from 'crypto';
import type { Request } from 'express';

/** One counted view per viewer per post inside this window. */
export const POST_VIEW_DEDUPE_TTL_SECONDS = 24 * 60 * 60;

export function postViewDedupeKey(postId: string, viewerKey: string): string {
  return `posts:view:${postId}:${viewerKey}`;
}

/** Signed-in viewers dedupe by user id; guests by a hashed network fingerprint. */
export function resolvePostViewerKey(
  userId?: string | null,
  anonymousKey?: string | null,
): string | null {
  if (userId) return `u:${userId}`;
  if (anonymousKey) return `a:${anonymousKey}`;
  return null;
}

function firstHeader(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === 'string' ? raw.trim() : '';
}

/**
 * Best-effort guest fingerprint (proxy client IP + user agent), hashed so no raw
 * IP is stored in Redis keys.
 */
export function anonymousViewerKey(req: Request): string {
  const realIp = firstHeader(req.headers['x-real-ip']);
  const forwarded = firstHeader(req.headers['x-forwarded-for'])
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  const ip =
    realIp ||
    forwarded[forwarded.length - 1] ||
    req.socket?.remoteAddress ||
    req.ip ||
    'unknown';
  const agent = firstHeader(req.headers['user-agent']);
  return createHash('sha256')
    .update(`${ip}|${agent}`)
    .digest('hex')
    .slice(0, 32);
}
