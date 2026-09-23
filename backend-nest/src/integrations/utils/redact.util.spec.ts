import { redactSensitive, maskEmail } from './redact.util';

describe('redact.util', () => {
  it('masks authorization and secrets', () => {
    const out = redactSensitive({
      Authorization: 'Bearer secret-token',
      access_token: 'abcd1234xyz',
      nested: { NI_API_KEY: 'super-secret-key' },
    }) as Record<string, unknown>;
    expect(String(out.Authorization)).not.toBe('Bearer secret-token');
    expect(out.access_token).not.toBe('abcd1234xyz');
    expect((out.nested as Record<string, unknown>).NI_API_KEY).not.toBe(
      'super-secret-key',
    );
  });

  it('masks emails', () => {
    expect(maskEmail('user@sarh.app')).toBe('u***@sarh.app');
  });
});
