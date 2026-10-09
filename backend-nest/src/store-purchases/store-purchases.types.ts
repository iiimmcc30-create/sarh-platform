import type { StoreProduct } from './store-products';

export type StorePlatformKey = 'app_store' | 'google_play';

/** Normalized result of a store verification (Apple or Google). */
export type VerifiedStorePurchase = {
  platform: StorePlatformKey;
  productId: string;
  /** Idempotency key: Apple transactionId / Google orderId. */
  transactionId: string;
  originalTransactionId: string | null;
  /** Google purchase token (null for Apple). */
  purchaseToken: string | null;
  /** purchased = entitlement may be granted now. */
  state: 'purchased' | 'pending' | 'expired' | 'revoked';
  /** Apple appAccountToken / Google obfuscatedExternalAccountId (= Sarh userId). */
  accountToken: string | null;
  environment: string | null;
  purchasedAt: Date | null;
  expiresAt: Date | null;
  autoRenew: boolean | null;
  /** Price actually charged by the store, when the store reports it. */
  storePrice: { amount: number; currency: string } | null;
  raw: Record<string, unknown>;
};

export type GrantResult =
  | {
      kind: 'subscription';
      planSlug: string;
      renewDate: Date;
      paymentId: string;
    }
  | {
      kind: 'boost';
      listingId: string;
      boostType: string;
      expiresAt: Date | null;
      paymentId: string;
    }
  | {
      kind: 'promotion';
      listingId: string;
      expiresAt: Date | null;
      paymentId: string;
    };

export type VerifyOutcome =
  | { status: 'granted'; transactionId: string; entitlement: GrantResult }
  | { status: 'already_granted'; transactionId: string }
  | { status: 'processing'; transactionId: string }
  | { status: 'pending' }
  | { status: 'expired'; transactionId: string }
  | { status: 'revoked'; transactionId: string };

export type GrantContext = {
  userId: string;
  product: StoreProduct;
  verified: VerifiedStorePurchase;
  listingId: string | null;
  isRenewal: boolean;
};

export class StorePurchaseError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly messageAr: string,
  ) {
    super(code);
    this.name = 'StorePurchaseError';
  }
}
