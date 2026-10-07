/**
 * Public "verified since" date for the profile verification sheet.
 *
 * Source: the admin approval time (`reviewedAt`) of the user's account verification
 * request while it is VERIFIED. Null when the account is not verified, or the badge
 * has no approved request behind it (legacy / admin-toggled / subscription-only).
 * Read-only; nothing is written.
 */
export type VerificationRequestStamp =
  | { status: string; reviewedAt: Date | string | null }
  | null
  | undefined;

export function resolveVerifiedSince(
  verified: boolean | null | undefined,
  request: VerificationRequestStamp,
): string | null {
  if (verified !== true || !request || request.status !== 'VERIFIED' || !request.reviewedAt) {
    return null;
  }
  const at = request.reviewedAt instanceof Date ? request.reviewedAt : new Date(request.reviewedAt);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}
