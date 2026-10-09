import { resolveVerifiedSince } from './verified-since';

describe('resolveVerifiedSince', () => {
  const at = new Date('2025-03-14T09:30:00.000Z');

  it('returns the approval time of a VERIFIED request for a verified user', () => {
    expect(
      resolveVerifiedSince(true, { status: 'VERIFIED', reviewedAt: at }),
    ).toBe('2025-03-14T09:30:00.000Z');
    expect(
      resolveVerifiedSince(true, {
        status: 'VERIFIED',
        reviewedAt: at.toISOString(),
      }),
    ).toBe('2025-03-14T09:30:00.000Z');
  });

  it('is null when not verified, no request, not approved, or no review time', () => {
    expect(
      resolveVerifiedSince(false, { status: 'VERIFIED', reviewedAt: at }),
    ).toBeNull();
    expect(resolveVerifiedSince(true, null)).toBeNull();
    expect(resolveVerifiedSince(true, undefined)).toBeNull();
    expect(
      resolveVerifiedSince(true, { status: 'UNDER_REVIEW', reviewedAt: at }),
    ).toBeNull();
    expect(
      resolveVerifiedSince(true, { status: 'VERIFIED', reviewedAt: null }),
    ).toBeNull();
    expect(
      resolveVerifiedSince(true, {
        status: 'VERIFIED',
        reviewedAt: 'not-a-date',
      }),
    ).toBeNull();
  });
});
