import type { Prisma } from '@prisma/client';
import { ButcherApplicationError } from '../errors';

export type TransactionClient = Prisma.TransactionClient;

export function assertNotModified(
  currentUpdatedAt: Date,
  expectedUpdatedAt?: Date | string,
): void {
  if (expectedUpdatedAt === undefined) return;

  const expected =
    expectedUpdatedAt instanceof Date
      ? expectedUpdatedAt.getTime()
      : new Date(expectedUpdatedAt).getTime();

  if (Number.isNaN(expected) || currentUpdatedAt.getTime() !== expected) {
    throw new ButcherApplicationError('APPLICATION_CONFLICT');
  }
}

export async function assertUserHasNoButcher(
  tx: TransactionClient,
  userId: string,
): Promise<void> {
  const existing = await tx.butcher.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (existing) {
    throw new ButcherApplicationError('BUTCHER_ALREADY_EXISTS');
  }
}

export function assertApplicationOwner(
  applicationUserId: string,
  requestUserId: string,
): void {
  if (applicationUserId !== requestUserId) {
    throw new ButcherApplicationError('APPLICATION_ACCESS_DENIED');
  }
}
