import bcrypt from 'bcryptjs';
import type { TransactionClient } from './transaction';
import { ButcherApplicationError } from '../errors';

export const ACCOUNT_USERNAME_REGEX = /^[a-z0-9_]+$/;
export const PASSWORD_BCRYPT_ROUNDS = 12;

export type ButcherAccountCredentialsInput = {
  accountUsername: string;
  accountEmail?: string;
  password: string;
  confirmPassword: string;
};

export type StoredButcherAccountCredentials = {
  accountUsername: string;
  accountEmail: string | null;
  accountPasswordHash: string;
};

export function normalizeAccountUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeAccountEmail(
  value: string | undefined,
): string | null {
  const trimmed = value?.trim().toLowerCase() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

export function validateButcherAccountCredentials(
  input: ButcherAccountCredentialsInput,
): StoredButcherAccountCredentials & { password: string } {
  const accountUsername = normalizeAccountUsername(input.accountUsername);
  const accountEmail = normalizeAccountEmail(input.accountEmail);
  const password = input.password;
  const confirmPassword = input.confirmPassword;

  if (!accountUsername) {
    throw new ButcherApplicationError('ACCOUNT_CREDENTIALS_REQUIRED', {
      missing: ['accountUsername'],
    });
  }
  if (
    accountUsername.length < 3 ||
    accountUsername.length > 30 ||
    !ACCOUNT_USERNAME_REGEX.test(accountUsername)
  ) {
    throw new ButcherApplicationError('ACCOUNT_CREDENTIALS_INVALID', {
      invalid: ['accountUsername'],
    });
  }
  if (
    accountEmail &&
    (accountEmail.length > 254 || !accountEmail.includes('@'))
  ) {
    throw new ButcherApplicationError('ACCOUNT_CREDENTIALS_INVALID', {
      invalid: ['accountEmail'],
    });
  }
  if (!password || !confirmPassword) {
    throw new ButcherApplicationError('ACCOUNT_CREDENTIALS_REQUIRED', {
      missing: ['password', 'confirmPassword'],
    });
  }
  if (password.length < 6 || password.length > 128) {
    throw new ButcherApplicationError('ACCOUNT_CREDENTIALS_INVALID', {
      invalid: ['password'],
    });
  }
  if (password !== confirmPassword) {
    throw new ButcherApplicationError('ACCOUNT_PASSWORD_MISMATCH');
  }

  return { accountUsername, accountEmail, password, accountPasswordHash: '' };
}

export async function hashAccountPassword(password: string): Promise<string> {
  return bcrypt.hash(password, PASSWORD_BCRYPT_ROUNDS);
}

export async function prepareStoredButcherAccountCredentials(
  input: ButcherAccountCredentialsInput,
): Promise<StoredButcherAccountCredentials> {
  const validated = validateButcherAccountCredentials(input);
  const accountPasswordHash = await hashAccountPassword(validated.password);
  return {
    accountUsername: validated.accountUsername,
    accountEmail: validated.accountEmail,
    accountPasswordHash,
  };
}

export function assertApplicationHasAccountCredentials(application: {
  accountUsername?: string | null;
  accountEmail?: string | null;
  accountPasswordHash?: string | null;
}): asserts application is {
  accountUsername: string;
  accountEmail: string | null;
  accountPasswordHash: string;
} {
  if (
    !application.accountUsername ||
    !application.accountPasswordHash ||
    !application.accountPasswordHash.startsWith('$2')
  ) {
    throw new ButcherApplicationError('ACCOUNT_CREDENTIALS_REQUIRED');
  }
}

type UserLookupClient = {
  user: {
    findFirst: TransactionClient['user']['findFirst'];
  };
};

export async function assertAccountCredentialsAvailable(
  tx: UserLookupClient,
  credentials: {
    accountUsername: string;
    accountEmail: string | null;
    shopPhone?: string | null;
  },
): Promise<{ phone: string | null }> {
  const or: Array<{ username?: string; email?: string; phone?: string }> = [
    { username: credentials.accountUsername },
  ];
  if (credentials.accountEmail) {
    or.push({ email: credentials.accountEmail });
  }

  const taken = await tx.user.findFirst({
    where: { OR: or, deletedAt: null },
    select: { username: true, email: true, phone: true },
  });

  if (taken) {
    const field =
      taken.username === credentials.accountUsername
        ? 'accountUsername'
        : 'accountEmail';
    throw new ButcherApplicationError('ACCOUNT_CREDENTIALS_TAKEN', { field });
  }

  const shopPhone = credentials.shopPhone?.trim() || null;
  if (!shopPhone) return { phone: null };

  const phoneTaken = await tx.user.findFirst({
    where: { phone: shopPhone, deletedAt: null },
    select: { id: true },
  });
  return { phone: phoneTaken ? null : shopPhone };
}
