import { authorizeCronCleanup, cronCleanupAuthHeader } from './cron-auth';

describe('authorizeCronCleanup (M16)', () => {
  it('denies production cleanup when CRON_SECRET is missing', () => {
    expect(
      authorizeCronCleanup({
        expectedSecret: undefined,
        providedSecret: 'anything',
        nodeEnv: 'production',
      }),
    ).toBe('unconfigured');
  });

  it('denies an empty expected secret in production', () => {
    expect(
      authorizeCronCleanup({
        expectedSecret: '   ',
        providedSecret: '',
        nodeEnv: 'production',
      }),
    ).toBe('unconfigured');
  });

  it('rejects the wrong secret (falls through to admin bearer)', () => {
    expect(
      authorizeCronCleanup({
        expectedSecret: 'correct-secret',
        providedSecret: 'wrong',
        nodeEnv: 'production',
      }),
    ).toBe('need_admin');
  });

  it('accepts the correct secret', () => {
    expect(
      authorizeCronCleanup({
        expectedSecret: 'correct-secret',
        providedSecret: 'correct-secret',
        nodeEnv: 'production',
      }),
    ).toBe('cron_ok');
  });

  it('allows admin-bearer fallback in non-production when secret is unset', () => {
    expect(
      authorizeCronCleanup({
        expectedSecret: undefined,
        providedSecret: undefined,
        nodeEnv: 'test',
      }),
    ).toBe('need_admin');
  });
});

describe('cronCleanupAuthHeader (M16 worker)', () => {
  it('does not send an empty header when the secret is missing', () => {
    expect(cronCleanupAuthHeader(undefined)).toBeNull();
    expect(cronCleanupAuthHeader('   ')).toBeNull();
  });

  it('sends the trimmed secret as x-cron-secret without logging it', () => {
    expect(cronCleanupAuthHeader('  secret-value  ')).toEqual({
      'x-cron-secret': 'secret-value',
    });
  });
});
