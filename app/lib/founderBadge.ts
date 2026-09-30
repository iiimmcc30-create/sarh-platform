import { FOUNDER_NAME } from '@/constants/brandCopy';

/**
 * Founder badge (small Sarh logo mark next to the name) - single source of truth.
 *
 * Identified by the account username: `User.username` is unique in the DB and
 * returned on every author/user payload, while display names are free text
 * and not unique. Display name is intentionally NOT used for matching.
 */
export const FOUNDER_USERNAME = 'sarh';

/** Hint shown on press (native) / hover (web). */
export const FOUNDER_BADGE_HINT = 'مؤسس سرح';

export const FOUNDER_BADGE_A11Y_LABEL = `${FOUNDER_BADGE_HINT} — ${FOUNDER_NAME}`;

/** Founder mark height relative to the verification badge it sits next to. */
export const FOUNDER_BADGE_SCALE = 0.65;

export function normalizeUsername(username: unknown): string {
  if (typeof username !== 'string') return '';
  return username.trim().replace(/^@+/, '').toLowerCase();
}

/** True only for the founder account (exact username match, case-insensitive, optional "@"). */
export function isFounderAccount(username: unknown): boolean {
  return normalizeUsername(username) === FOUNDER_USERNAME;
}

/** Founder mark height for a given verification badge size (≈65%, min 8pt). */
export function founderBadgeSize(verificationBadgeSize: number): number {
  return Math.max(8, Math.round(verificationBadgeSize * FOUNDER_BADGE_SCALE));
}
