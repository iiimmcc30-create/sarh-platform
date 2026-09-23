import {
  evaluatePersistedTokens,
  evaluateRefreshResult,
  isSessionStillTrusted,
  MAX_STALE_SESSION_MS,
} from '@/lib/sessionRefresh';

describe('evaluateRefreshResult (H7 zombie session)', () => {
  it('clears session on 401', () => {
    const out = evaluateRefreshResult({ status: 401, body: { error: 'invalid_refresh' } });
    expect(out.kind).toBe('definitive_failure');
  });

  it('clears session on 403', () => {
    expect(evaluateRefreshResult({ status: 403 }).kind).toBe('definitive_failure');
  });

  it('keeps credentials on 500', () => {
    expect(evaluateRefreshResult({ status: 500 }).kind).toBe('transient_failure');
  });

  it('keeps credentials on network error / timeout', () => {
    expect(evaluateRefreshResult({ networkError: true }).kind).toBe(
      'transient_failure',
    );
  });

  it('clears session on HTTP 200 without access token (malformed)', () => {
    const out = evaluateRefreshResult({ status: 200, body: { success: true, data: {} } });
    expect(out).toMatchObject({ kind: 'definitive_failure', reason: 'malformed_response' });
  });

  it('succeeds when access_token is present', () => {
    const out = evaluateRefreshResult({
      status: 200,
      body: {
        success: true,
        data: { access_token: 'a1', refresh_token: 'r1' },
      },
    });
    expect(out).toEqual({
      kind: 'success',
      accessToken: 'a1',
      refreshToken: 'r1',
    });
  });

  it('keeps credentials on 429 rate limit', () => {
    expect(evaluateRefreshResult({ status: 429 }).kind).toBe('transient_failure');
  });

  it('treats 400 as definitive (invalid refresh payload)', () => {
    expect(evaluateRefreshResult({ status: 400 }).kind).toBe('definitive_failure');
  });
});

describe('evaluatePersistedTokens / stale bound', () => {
  it('flags access without refresh as definitive missing_refresh', () => {
    expect(
      evaluatePersistedTokens({ accessToken: 'a', refreshToken: null }),
    ).toBe('missing_refresh');
  });

  it('treats fully empty storage as empty', () => {
    expect(
      evaluatePersistedTokens({ accessToken: null, refreshToken: null }),
    ).toBe('empty');
  });

  it('does not trust a session older than MAX_STALE_SESSION_MS', () => {
    const now = 1_700_000_000_000;
    expect(isSessionStillTrusted(now - MAX_STALE_SESSION_MS - 1, now)).toBe(
      false,
    );
    expect(isSessionStillTrusted(now - 60_000, now)).toBe(true);
    expect(isSessionStillTrusted(null, now)).toBe(false);
  });
});
