import {
  StoreEntitlementsService,
  storeOrderId,
} from '../store-entitlements.service';
import { findStoreProduct } from '../store-products';
import type { VerifiedStorePurchase } from '../store-purchases.types';

const USER = '11111111-2222-4333-8444-555555555555';
const LISTING = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

function verified(
  over: Partial<VerifiedStorePurchase> = {},
): VerifiedStorePurchase {
  return {
    platform: 'app_store',
    productId: 'sa.sarh.gold.monthly',
    transactionId: 'T1',
    originalTransactionId: 'T1',
    purchaseToken: null,
    state: 'purchased',
    accountToken: USER,
    environment: 'Sandbox',
    purchasedAt: new Date(),
    expiresAt: new Date('2030-01-01T00:00:00Z'),
    autoRenew: true,
    storePrice: null,
    raw: {},
    ...over,
  };
}

function setup() {
  const repo = {
    ensureSubscription: jest.fn(async () => ({
      id: 'sub-1',
      planId: 'free',
      planAudience: 'USER',
    })),
    createPaidSubscriptionPayment: jest.fn(async () => ({ id: 'pay-sub' })),
    setSubscriptionAutoRenew: jest.fn(async () => ({ count: 1 })),
    findOwnedListing: jest.fn(async () => ({
      id: LISTING,
      arabicTitle: 'سيارة',
      views: 7,
    })),
    createPendingListingPurchase: jest.fn(
      async (p: { kind: string; boostType?: string }) => ({
        paymentId: 'pay-l',
        referenceId: 'ref-1',
        referenceType:
          p.kind === 'promotion'
            ? 'promoted_ad'
            : p.boostType === 'pinned'
              ? 'pinned_ad'
              : 'featured_ad',
        status: 'pending',
        metadata: { durationHours: 72 },
      }),
    ),
    findSubscription: jest.fn(async () => ({
      id: 'sub-1',
      planId: 'gold-badge',
      planAudience: 'USER',
    })),
  };
  const payments = {
    processSuccessfulPayment: jest.fn(async () => ({
      processed: true,
      boost: {
        id: 'ref-1',
        boostType: 'pinned',
        listingId: LISTING,
        expiresAt: new Date('2030-01-04'),
      },
    })),
    markPaymentRefunded: jest.fn(async () => ({ newlyRefunded: true })),
  };
  const lifecycle = {
    activateFromPayment: jest.fn(async () => undefined),
    downgradeUser: jest.fn(async () => undefined),
    expireIfNeededForUser: jest.fn(async () => undefined),
    cancelAutoRenew: jest.fn(async () => null),
  };
  const subscriptionCache = { invalidate: jest.fn(async () => undefined) };
  const notifications = { notifyUser: jest.fn(async () => undefined) };
  const cache = {
    delPattern: jest.fn(async () => 1),
    del: jest.fn(async () => undefined),
  };
  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  const service = new StoreEntitlementsService(
    repo as never,
    payments as never,
    lifecycle as never,
    subscriptionCache as never,
    notifications as never,
    cache as never,
    logger as never,
  );
  return {
    service,
    repo,
    payments,
    lifecycle,
    subscriptionCache,
    notifications,
    cache,
  };
}

describe('StoreEntitlementsService', () => {
  it('activates the verification subscription until the store expiry (existing lifecycle)', async () => {
    const { service, repo, lifecycle } = setup();
    const v = verified();
    const res = await service.grant({
      userId: USER,
      product: findStoreProduct('sa.sarh.gold.monthly')!,
      verified: v,
      listingId: null,
      isRenewal: false,
    });
    expect(res).toMatchObject({
      kind: 'subscription',
      planSlug: 'gold-badge',
      paymentId: 'pay-sub',
    });
    expect(repo.createPaidSubscriptionPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'IAP-A-T1',
        method: 'app_store',
        amount: 99,
        subscriptionId: 'sub-1',
      }),
    );
    expect(lifecycle.activateFromPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER,
        targetPlanId: 'gold-badge',
        renewDate: v.expiresAt,
        planAudience: 'USER',
        isRenewal: false,
      }),
    );
    expect(repo.setSubscriptionAutoRenew).not.toHaveBeenCalled();
  });

  it('keeps autoRenew off when the store says it will not renew', async () => {
    const { service, repo } = setup();
    await service.grant({
      userId: USER,
      product: findStoreProduct('sa.sarh.verification.blue.monthly')!,
      verified: verified({
        productId: 'sa.sarh.verification.blue.monthly',
        autoRenew: false,
      }),
      listingId: null,
      isRenewal: true,
    });
    expect(repo.setSubscriptionAutoRenew).toHaveBeenCalledWith(
      USER,
      'blue-badge',
      false,
    );
  });

  it('fulfils a pin boost through processSuccessfulPayment and refreshes listing caches', async () => {
    const { service, repo, payments, cache, notifications } = setup();
    const res = await service.grant({
      userId: USER,
      product: findStoreProduct('sa.sarh.boost.pinned.3d')!,
      verified: verified({
        platform: 'google_play',
        productId: 'sa.sarh.boost.pinned.3d',
        transactionId: 'GPA.1',
        expiresAt: null,
      }),
      listingId: LISTING,
      isRenewal: false,
    });
    expect(repo.createPendingListingPurchase).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'boost',
        boostType: 'pinned',
        durationHours: 72,
        durationDays: 3,
        amount: 29,
        method: 'google_play',
        orderId: 'IAP-G-GPA.1',
        listingId: LISTING,
      }),
    );
    expect(payments.processSuccessfulPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentId: 'pay-l',
        type: 'pinned_ad',
        referenceId: 'ref-1',
        niTransactionId: 'GPA.1',
      }),
    );
    expect(cache.del).toHaveBeenCalledWith(`listing:${LISTING}`);
    expect(notifications.notifyUser).toHaveBeenCalled();
    expect(res).toMatchObject({
      kind: 'boost',
      listingId: LISTING,
      boostType: 'pinned',
    });
  });

  it('fulfils visibility promotion as promoted_ad', async () => {
    const { service, repo, payments } = setup();
    await service.grant({
      userId: USER,
      product: findStoreProduct('sa.sarh.boost.promote.2d')!,
      verified: verified({
        productId: 'sa.sarh.boost.promote.2d',
        transactionId: 'T9',
      }),
      listingId: LISTING,
      isRenewal: false,
    });
    expect(repo.createPendingListingPurchase).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'promotion',
        amount: 35,
        durationHours: 48,
        baselineViews: 7,
      }),
    );
    expect(payments.processSuccessfulPayment).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'promoted_ad' }),
    );
  });

  it('refuses consumables without an owned listing', async () => {
    const { service, repo } = setup();
    const product = findStoreProduct('sa.sarh.boost.featured.1d')!;
    await expect(
      service.grant({
        userId: USER,
        product,
        verified: verified(),
        listingId: null,
        isRenewal: false,
      }),
    ).rejects.toMatchObject({ code: 'listing_required' });
    repo.findOwnedListing.mockResolvedValueOnce(null as never);
    await expect(
      service.grant({
        userId: USER,
        product,
        verified: verified(),
        listingId: LISTING,
        isRenewal: false,
      }),
    ).rejects.toMatchObject({ code: 'listing_not_found' });
  });

  it('refund: marks the payment refunded and downgrades the active plan', async () => {
    const { service, payments, lifecycle } = setup();
    await service.revoke({
      userId: USER,
      paymentId: 'p1',
      productKind: 'subscription',
      planSlug: 'gold-badge',
      reason: 'refund',
    });
    expect(payments.markPaymentRefunded).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({ source: 'store_iap' }),
    );
    expect(lifecycle.downgradeUser).toHaveBeenCalledWith(
      USER,
      'gold-badge',
      'USER',
      'refund',
    );

    lifecycle.downgradeUser.mockClear();
    await service.revoke({
      userId: USER,
      paymentId: 'p2',
      productKind: 'subscription',
      planSlug: 'blue-badge',
      reason: 'refund',
    });
    expect(lifecycle.downgradeUser).not.toHaveBeenCalled();
  });

  it('order ids are deterministic per store transaction', () => {
    expect(storeOrderId('app_store', '123')).toBe('IAP-A-123');
    expect(storeOrderId('google_play', 'GPA.1..0')).toBe('IAP-G-GPA.1..0');
  });
});
