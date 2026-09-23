import type { AuthUser } from '@/contexts/AuthContext';
import type { User } from '@/services/types';

type IdCarrier = { id?: string | null; userId?: string | null } | null | undefined;

/** Normalize auth user payloads from API / AsyncStorage (id vs legacy userId). */
export function normalizeAuthUser<T extends Record<string, unknown>>(userData: T): T & { id: string } {
  const id = String(userData.id ?? userData.userId ?? '').trim();
  return { ...userData, id };
}

export function resolveCurrentUserId(authUser?: IdCarrier, me?: Pick<User, 'id'> | null): string {
  const candidates = [authUser?.id, authUser?.userId, me?.id];
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

export function isSameUser(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  return a.trim() === b.trim();
}

export function canManageAsOwner(
  authorId: string | undefined,
  authUser?: AuthUser | null,
  me?: Pick<User, 'id'> | null,
): boolean {
  const ownerId = resolveCurrentUserId(authUser, me);
  return Boolean(ownerId) && isSameUser(authorId, ownerId);
}

/** Comment author or resource owner (e.g. listing seller) may delete. */
export function canDeleteComment(
  commentAuthorId: string | undefined,
  resourceOwnerId: string | undefined,
  authUser?: AuthUser | null,
  me?: Pick<User, 'id'> | null,
): boolean {
  const currentId = resolveCurrentUserId(authUser, me);
  if (!currentId) return false;
  return (
    isSameUser(commentAuthorId, currentId) || isSameUser(resourceOwnerId, currentId)
  );
}
