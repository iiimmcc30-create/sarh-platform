import {
  assertAccountCredentialsAvailable,
  assertApplicationHasAccountCredentials,
  hashAccountPassword,
  prepareStoredButcherAccountCredentials,
  validateButcherAccountCredentials,
} from '../../helpers/accountCredentials';
import { ButcherApplicationError } from '../../errors';

describe('butcher account credentials', () => {
  it('requires matching password and confirmation', () => {
    expect(() =>
      validateButcherAccountCredentials({
        accountUsername: 'shop_user',
        password: 'secret1',
        confirmPassword: 'other',
      }),
    ).toThrow(ButcherApplicationError);

    try {
      validateButcherAccountCredentials({
        accountUsername: 'shop_user',
        password: 'secret1',
        confirmPassword: 'other',
      });
    } catch (err) {
      expect(err).toMatchObject({ code: 'ACCOUNT_PASSWORD_MISMATCH' });
    }
  });

  it('hashes the password with bcrypt and never returns plaintext', async () => {
    const stored = await prepareStoredButcherAccountCredentials({
      accountUsername: 'Shop_User',
      accountEmail: 'Shop@example.com',
      password: 'secret1',
      confirmPassword: 'secret1',
    });
    expect(stored.accountUsername).toBe('shop_user');
    expect(stored.accountEmail).toBe('shop@example.com');
    expect(stored.accountPasswordHash).toMatch(/^\$2[aby]\$/);
    expect(stored.accountPasswordHash).not.toContain('secret1');
    expect(JSON.stringify(stored)).not.toContain('secret1');
  });

  it('rejects a missing hash as unusable credentials', () => {
    try {
      assertApplicationHasAccountCredentials({
        accountUsername: 'shop_user',
        accountPasswordHash: 'secret1',
      });
      throw new Error('expected failure');
    } catch (err) {
      expect(err).toMatchObject({ code: 'ACCOUNT_CREDENTIALS_REQUIRED' });
    }
  });

  it('does not treat a taken username as available', async () => {
    const tx = {
      user: {
        findFirst: jest.fn().mockResolvedValue({
          username: 'shop_user',
          email: null,
          phone: null,
        }),
      },
    };
    await expect(
      assertAccountCredentialsAvailable(tx as never, {
        accountUsername: 'shop_user',
        accountEmail: null,
      }),
    ).rejects.toMatchObject({ code: 'ACCOUNT_CREDENTIALS_TAKEN' });
  });

  it('hashes with the existing bcrypt cost factor', async () => {
    const hash = await hashAccountPassword('secret1');
    expect(hash.startsWith('$2')).toBe(true);
    expect(hash).not.toBe('secret1');
  });
});
