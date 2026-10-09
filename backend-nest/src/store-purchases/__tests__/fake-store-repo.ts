import type { StorePurchaseRow } from '../store-purchases.repository';
import type { VerifiedStorePurchase } from '../store-purchases.types';

/** In-memory StorePurchasesRepository with the same claim semantics. */
export class FakeStoreRepo {
  rows: StorePurchaseRow[] = [];
  notifications = new Set<string>();
  autoRenew = new Map<string, boolean>();
  private seq = 0;

  findByTransaction = jest.fn(
    async (platform: string, transactionId: string) =>
      this.rows.find(
        (r) => r.platform === platform && r.transactionId === transactionId,
      ) ?? null,
  );

  findLatestInChain = jest.fn(
    async (p: {
      platform: string;
      originalTransactionId?: string | null;
      purchaseTokens?: string[];
    }) => {
      const matches = this.rows.filter(
        (r) =>
          r.platform === p.platform &&
          ((p.originalTransactionId &&
            (r.originalTransactionId === p.originalTransactionId ||
              r.transactionId === p.originalTransactionId)) ||
            (p.purchaseTokens ?? []).some((t) => t && r.purchaseToken === t)),
      );
      return matches[matches.length - 1] ?? null;
    },
  );

  findActiveInChain = jest.fn(
    async (p: {
      platform: string;
      originalTransactionId?: string | null;
      purchaseToken?: string | null;
    }) =>
      this.rows.filter(
        (r) =>
          r.platform === p.platform &&
          r.status === 'active' &&
          ((p.originalTransactionId &&
            (r.originalTransactionId === p.originalTransactionId ||
              r.transactionId === p.originalTransactionId)) ||
            (p.purchaseToken && r.purchaseToken === p.purchaseToken)),
      ),
  );

  findByPurchaseToken = jest.fn(
    async (platform: string, token: string) =>
      [...this.rows]
        .reverse()
        .find((r) => r.platform === platform && r.purchaseToken === token) ??
      null,
  );

  claim = jest.fn(
    async (p: {
      verified: VerifiedStorePurchase;
      productKind: string;
      userId: string;
      listingId: string | null;
    }) => {
      const existing = await this.findByTransaction(
        p.verified.platform,
        p.verified.transactionId,
      );
      if (existing) {
        if (existing.status === 'failed' && existing.userId === p.userId) {
          existing.status = 'processing';
          return { claimed: true, row: existing };
        }
        return { claimed: false, row: existing };
      }
      const row: StorePurchaseRow = {
        id: `sp-${++this.seq}`,
        platform: p.verified.platform,
        productId: p.verified.productId,
        productKind: p.productKind,
        transactionId: p.verified.transactionId,
        originalTransactionId: p.verified.originalTransactionId,
        purchaseToken: p.verified.purchaseToken,
        userId: p.userId,
        status: 'processing',
        listingId: p.listingId,
        paymentId: null,
        expiresAt: p.verified.expiresAt,
        updatedAt: new Date(),
      };
      this.rows.push(row);
      return { claimed: true, row };
    },
  );

  markActive = jest.fn(async (id: string, paymentId: string | null) => {
    const r = this.rows.find((x) => x.id === id)!;
    r.status = 'active';
    r.paymentId = paymentId;
  });

  markFailed = jest.fn(async (id: string) => {
    this.rows.find((x) => x.id === id)!.status = 'failed';
  });

  markExpired = jest.fn(async (ids: string[]) => {
    for (const r of this.rows)
      if (ids.includes(r.id) && r.status === 'active') r.status = 'expired';
    return { count: ids.length };
  });

  markRevoked = jest.fn(async (id: string) => {
    const r = this.rows.find((x) => x.id === id)!;
    if (r.status === 'revoked') return { count: 0 };
    r.status = 'revoked';
    return { count: 1 };
  });

  setAutoRenew = jest.fn(async (ids: string[], value: boolean) => {
    for (const id of ids) this.autoRenew.set(id, value);
    return { count: ids.length };
  });

  notificationSeen = jest.fn(async (platform: string, id: string) =>
    this.notifications.has(`${platform}:${id}`),
  );

  recordNotification = jest.fn(
    async (p: { platform: string; notificationId: string }) => {
      this.notifications.add(`${p.platform}:${p.notificationId}`);
    },
  );
}
