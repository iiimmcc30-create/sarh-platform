import { StorePurchasesService } from '../store-purchases.service';
import { StorePurchaseVerifierService } from '../store-purchase-verifier.service';
import { StorePurchaseError } from '../store-purchases.types';
import { TEST_ROOT_PEM } from './apple-test-chain.fixture';
import { signTestJws } from './apple-test-helpers';
import { FakeStoreRepo } from './fake-store-repo';

const USER = '11111111-2222-4333-8444-555555555555';
const OTHER = '99999999-2222-4333-8444-555555555555';
const LISTING = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const DAY = 24 * 3600 * 1000;

function appleTx(over: Record<string, unknown> = {}) {
  return {
    transactionId: '2000000001',
    originalTransactionId: '2000000001',
    bundleId: 'com.sarh.app',
    productId: 'sa.sarh.gold.monthly',
    purchaseDate: Date.now(),
    expiresDate: Date.now() + 30 * DAY,
    type: 'Auto-Renewable Subscription',
    appAccountToken: USER,
    environment: 'Sandbox',
    price: 99990,
    currency: 'SAR',
    ...over,
  };
}

function setup() {
  delete process.env.APPLE_IAP_ISSUER_ID;
  delete process.env.APPLE_IAP_KEY_ID;
  delete process.env.APPLE_IAP_PRIVATE_KEY;
  delete process.env.APPLE_IAP_BUNDLE_ID;
  const repo = new FakeStoreRepo();
  const verifier = new StorePurchaseVerifierService({
    trustedRootsPem: [TEST_ROOT_PEM],
  });
  const google = {
    configured: true,
    getProductPurchase: jest.fn(),
    getSubscriptionV2: jest.fn(),
    verifyPubSubPushToken: jest.fn(
      async (auth?: string) => auth === 'Bearer good',
    ),
  };
  jest.spyOn(verifier, 'getGoogleApi').mockReturnValue(google as never);
  const entitlements = {
    grant: jest.fn(async (ctx: { product: { kind: string } }) => ({
      kind: ctx.product.kind,
      paymentId: `pay-${entitlementsCalls++}`,
    })),
    revoke: jest.fn(async () => undefined),
    expire: jest.fn(async () => undefined),
    setAutoRenew: jest.fn(async () => undefined),
  };
  let entitlementsCalls = 0;
  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  const service = new StorePurchasesService(
    repo as never,
    verifier,
    entitlements as never,
    logger as never,
  );
  return { repo, verifier, google, entitlements, service };
}

describe('StorePurchasesService.verifyFromClient (Apple)', () => {
  it('verifies the StoreKit JWS, grants once and is idempotent by transactionId', async () => {
    const { service, entitlements, repo } = setup();
    const req = {
      platform: 'app_store' as const,
      productId: 'sa.sarh.gold.monthly',
      purchaseToken: signTestJws(appleTx()),
      transactionId: '2000000001',
    };
    const first = await service.verifyFromClient(USER, req);
    expect(first.status).toBe('granted');
    expect(entitlements.grant).toHaveBeenCalledTimes(1);
    const ctx = entitlements.grant.mock.calls[0][0] as unknown as {
      userId: string;
      verified: { expiresAt: Date; storePrice: unknown; environment: string };
      isRenewal: boolean;
    };
    expect(ctx.userId).toBe(USER);
    expect(ctx.isRenewal).toBe(false);
    expect(ctx.verified.storePrice).toEqual({ amount: 99.99, currency: 'SAR' });
    expect(repo.rows[0].status).toBe('active');

    const second = await service.verifyFromClient(USER, req);
    expect(second).toEqual({
      status: 'already_granted',
      transactionId: '2000000001',
    });
    expect(entitlements.grant).toHaveBeenCalledTimes(1);
  });

  it('rejects a transaction bound to another Sarh account (appAccountToken)', async () => {
    const { service, entitlements } = setup();
    await expect(
      service.verifyFromClient(OTHER, {
        platform: 'app_store',
        productId: 'sa.sarh.gold.monthly',
        purchaseToken: signTestJws(appleTx()),
      }),
    ).rejects.toMatchObject({ status: 403, code: 'purchase_other_account' });
    expect(entitlements.grant).not.toHaveBeenCalled();
  });

  it('rejects forged / foreign-bundle / mismatching transactions', async () => {
    const { service } = setup();
    const good = signTestJws(appleTx());
    const forged = good.slice(0, -4) + 'AAAA';
    await expect(
      service.verifyFromClient(USER, {
        platform: 'app_store',
        productId: 'sa.sarh.gold.monthly',
        purchaseToken: forged,
      }),
    ).rejects.toMatchObject({ code: 'invalid_store_signature' });
    await expect(
      service.verifyFromClient(USER, {
        platform: 'app_store',
        productId: 'sa.sarh.gold.monthly',
        purchaseToken: signTestJws(appleTx({ bundleId: 'com.other.app' })),
      }),
    ).rejects.toMatchObject({ code: 'bundle_mismatch' });
    await expect(
      service.verifyFromClient(USER, {
        platform: 'app_store',
        productId: 'sa.sarh.verification.blue.monthly',
        purchaseToken: good,
      }),
    ).rejects.toMatchObject({ code: 'product_mismatch' });
    await expect(
      service.verifyFromClient(USER, {
        platform: 'app_store',
        productId: 'sa.sarh.nope',
        purchaseToken: good,
      }),
    ).rejects.toBeInstanceOf(StorePurchaseError);
  });

  it('does not grant revoked or expired transactions', async () => {
    const { service, entitlements } = setup();
    const revoked = await service.verifyFromClient(USER, {
      platform: 'app_store',
      productId: 'sa.sarh.gold.monthly',
      purchaseToken: signTestJws(appleTx({ revocationDate: Date.now() })),
    });
    expect(revoked.status).toBe('revoked');
    const expired = await service.verifyFromClient(USER, {
      platform: 'app_store',
      productId: 'sa.sarh.gold.monthly',
      purchaseToken: signTestJws(
        appleTx({ transactionId: '3', expiresDate: Date.now() - DAY }),
      ),
    });
    expect(expired.status).toBe('expired');
    expect(entitlements.grant).not.toHaveBeenCalled();
  });

  it('marks the row failed when granting throws, and a retry succeeds', async () => {
    const { service, entitlements, repo } = setup();
    entitlements.grant.mockRejectedValueOnce(new Error('db down'));
    const req = {
      platform: 'app_store' as const,
      productId: 'sa.sarh.boost.featured.1d',
      purchaseToken: signTestJws(
        appleTx({
          productId: 'sa.sarh.boost.featured.1d',
          type: 'Consumable',
          expiresDate: undefined,
        }),
      ),
      listingId: LISTING,
    };
    await expect(service.verifyFromClient(USER, req)).rejects.toThrow(
      'db down',
    );
    expect(repo.rows[0].status).toBe('failed');
    const retry = await service.verifyFromClient(USER, req);
    expect(retry.status).toBe('granted');
    expect(entitlements.grant).toHaveBeenCalledTimes(2);
    expect(
      (entitlements.grant.mock.calls[1][0] as unknown as { listingId: string })
        .listingId,
    ).toBe(LISTING);
  });

  it('reports 503 when neither a JWS nor the App Store API is available', async () => {
    const { service } = setup();
    await expect(
      service.verifyFromClient(USER, {
        platform: 'app_store',
        productId: 'sa.sarh.gold.monthly',
        transactionId: '1',
      }),
    ).rejects.toMatchObject({ status: 503, code: 'store_not_configured' });
  });
});

describe('StorePurchasesService.verifyFromClient (Google)', () => {
  it('grants a consumable using orderId as the idempotency key; pending is not granted', async () => {
    const { service, google, entitlements } = setup();
    google.getProductPurchase.mockResolvedValueOnce({
      purchaseState: 2,
      orderId: 'GPA.1',
    });
    const pending = await service.verifyFromClient(USER, {
      platform: 'google_play',
      productId: 'sa.sarh.boost.pinned.3d',
      purchaseToken: 'tok-1',
      listingId: LISTING,
    });
    expect(pending).toEqual({ status: 'pending' });
    expect(entitlements.grant).not.toHaveBeenCalled();

    google.getProductPurchase.mockResolvedValue({
      purchaseState: 0,
      orderId: 'GPA.1',
      obfuscatedExternalAccountId: USER,
      purchaseType: 0,
    });
    const res = await service.verifyFromClient(USER, {
      platform: 'google_play',
      productId: 'sa.sarh.boost.pinned.3d',
      purchaseToken: 'tok-1',
      listingId: LISTING,
    });
    expect(res).toMatchObject({ status: 'granted', transactionId: 'GPA.1' });
    expect(google.getProductPurchase).toHaveBeenCalledWith(
      'sa.sarh.boost.pinned.3d',
      'tok-1',
    );
    const again = await service.verifyFromClient(USER, {
      platform: 'google_play',
      productId: 'sa.sarh.boost.pinned.3d',
      purchaseToken: 'tok-1',
      listingId: LISTING,
    });
    expect(again.status).toBe('already_granted');
    expect(entitlements.grant).toHaveBeenCalledTimes(1);
  });

  it('treats each subscription renewal orderId as a new period of the same chain', async () => {
    const { service, google, entitlements } = setup();
    const sub = (orderId: string) => ({
      subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
      latestOrderId: orderId,
      externalAccountIdentifiers: { obfuscatedExternalAccountId: USER },
      lineItems: [
        {
          productId: 'sa.sarh.verification.blue.monthly',
          expiryTime: new Date(Date.now() + 30 * DAY).toISOString(),
          autoRenewingPlan: { autoRenewEnabled: true },
        },
      ],
    });
    google.getSubscriptionV2.mockResolvedValueOnce(sub('GPA.9'));
    await service.verifyFromClient(USER, {
      platform: 'google_play',
      productId: 'sa.sarh.verification.blue.monthly',
      purchaseToken: 'sub-tok',
    });
    google.getSubscriptionV2.mockResolvedValueOnce(sub('GPA.9..0'));
    const renewal = await service.verifyFromClient(USER, {
      platform: 'google_play',
      productId: 'sa.sarh.verification.blue.monthly',
      purchaseToken: 'sub-tok',
    });
    expect(renewal.status).toBe('granted');
    expect(
      (entitlements.grant.mock.calls[1][0] as unknown as { isRenewal: boolean })
        .isRenewal,
    ).toBe(true);
  });
});

describe('App Store Server Notifications V2', () => {
  function notification(
    type: string,
    tx: Record<string, unknown>,
    extra: Record<string, unknown> = {},
  ) {
    return signTestJws({
      notificationType: type,
      notificationUUID: `uuid-${type}-${String(tx.transactionId)}`,
      data: {
        bundleId: 'com.sarh.app',
        environment: 'Sandbox',
        signedTransactionInfo: signTestJws(tx),
      },
      ...extra,
    });
  }

  it('grants renewals for the chain owner and dedupes by notificationUUID', async () => {
    const { service, entitlements } = setup();
    await service.verifyFromClient(USER, {
      platform: 'app_store',
      productId: 'sa.sarh.gold.monthly',
      purchaseToken: signTestJws(appleTx({ appAccountToken: undefined })),
    });
    const renewalTx = appleTx({
      transactionId: '2000000002',
      appAccountToken: undefined,
    });
    const payload = notification('DID_RENEW', renewalTx);
    expect(await service.handleAppleNotification(payload)).toEqual({
      outcome: 'granted',
    });
    const ctx = entitlements.grant.mock.calls[1][0] as unknown as {
      userId: string;
      isRenewal: boolean;
    };
    expect(ctx).toMatchObject({ userId: USER, isRenewal: true });
    expect(await service.handleAppleNotification(payload)).toEqual({
      outcome: 'duplicate',
    });
    expect(entitlements.grant).toHaveBeenCalledTimes(2);
  });

  it('handles auto-renew off, expiry and refunds', async () => {
    const { service, entitlements, repo } = setup();
    await service.verifyFromClient(USER, {
      platform: 'app_store',
      productId: 'sa.sarh.gold.monthly',
      purchaseToken: signTestJws(appleTx()),
    });
    const tx = appleTx();
    expect(
      await service.handleAppleNotification(
        notification('DID_CHANGE_RENEWAL_STATUS', tx, {
          subtype: 'AUTO_RENEW_DISABLED',
        }),
      ),
    ).toEqual({ outcome: 'auto_renew_off' });
    expect(entitlements.setAutoRenew).toHaveBeenCalledWith(
      USER,
      'gold-badge',
      false,
    );

    expect(
      await service.handleAppleNotification(notification('REFUND', tx)),
    ).toEqual({
      outcome: 'revoked',
    });
    expect(entitlements.revoke).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER,
        productKind: 'subscription',
        planSlug: 'gold-badge',
        paymentId: 'pay-0',
      }),
    );
    expect(repo.rows[0].status).toBe('revoked');

    const { service: s2, entitlements: e2, repo: r2 } = setup();
    await s2.verifyFromClient(USER, {
      platform: 'app_store',
      productId: 'sa.sarh.gold.monthly',
      purchaseToken: signTestJws(appleTx()),
    });
    expect(
      await s2.handleAppleNotification(notification('EXPIRED', appleTx())),
    ).toEqual({
      outcome: 'expired',
    });
    expect(e2.expire).toHaveBeenCalledWith(USER);
    expect(r2.rows[0].status).toBe('expired');
  });

  it('rejects unsigned / forged notifications and ignores other bundles', async () => {
    const { service } = setup();
    await expect(
      service.handleAppleNotification('x.y.z'),
    ).rejects.toMatchObject({
      code: 'invalid_store_signature',
    });
    await expect(
      service.handleAppleNotification(undefined),
    ).rejects.toMatchObject({ status: 400 });
    const other = signTestJws({
      notificationType: 'DID_RENEW',
      notificationUUID: 'u1',
      data: { bundleId: 'com.other' },
    });
    expect(await service.handleAppleNotification(other)).toEqual({
      outcome: 'ignored_bundle',
    });
    expect(
      await service.handleAppleNotification(
        signTestJws({ notificationType: 'TEST', notificationUUID: 't' }),
      ),
    ).toEqual({ outcome: 'test' });
  });
});

describe('Google Play RTDN', () => {
  const push = (data: Record<string, unknown>, id = 'm1') => ({
    message: {
      data: Buffer.from(
        JSON.stringify({ packageName: 'com.sarh.app', ...data }),
      ).toString('base64'),
      messageId: id,
    },
  });

  it('requires a valid Pub/Sub OIDC token', async () => {
    const { service } = setup();
    await expect(
      service.handleGoogleRtdn('Bearer bad', push({ testNotification: {} })),
    ).rejects.toMatchObject({
      status: 401,
    });
    expect(
      await service.handleGoogleRtdn(
        'Bearer good',
        push({ testNotification: {} }),
      ),
    ).toEqual({
      outcome: 'test',
    });
  });

  it('cancels auto-renew, revokes voided purchases and dedupes messages', async () => {
    const { service, google, entitlements, repo } = setup();
    const active = {
      subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
      latestOrderId: 'GPA.5',
      externalAccountIdentifiers: { obfuscatedExternalAccountId: USER },
      lineItems: [
        {
          productId: 'sa.sarh.verification.blueplus.monthly',
          expiryTime: new Date(Date.now() + 10 * DAY).toISOString(),
          autoRenewingPlan: { autoRenewEnabled: true },
        },
      ],
    };
    google.getSubscriptionV2.mockResolvedValue(active);
    const purchased = push(
      {
        subscriptionNotification: {
          notificationType: 4,
          purchaseToken: 'stok',
          subscriptionId: 'sa.sarh.verification.blueplus.monthly',
        },
      },
      'p1',
    );
    expect(await service.handleGoogleRtdn('Bearer good', purchased)).toEqual({
      outcome: 'granted',
    });
    expect(await service.handleGoogleRtdn('Bearer good', purchased)).toEqual({
      outcome: 'duplicate',
    });

    google.getSubscriptionV2.mockResolvedValue({
      ...active,
      subscriptionState: 'SUBSCRIPTION_STATE_CANCELED',
    });
    expect(
      await service.handleGoogleRtdn(
        'Bearer good',
        push(
          {
            subscriptionNotification: {
              notificationType: 3,
              purchaseToken: 'stok',
            },
          },
          'c1',
        ),
      ),
    ).toEqual({ outcome: 'auto_renew_off' });
    expect(entitlements.setAutoRenew).toHaveBeenCalledWith(
      USER,
      'blue-plus-badge',
      false,
    );

    expect(
      await service.handleGoogleRtdn(
        'Bearer good',
        push(
          {
            voidedPurchaseNotification: {
              purchaseToken: 'stok',
              orderId: 'GPA.5',
              productType: 1,
            },
          },
          'v1',
        ),
      ),
    ).toEqual({ outcome: 'revoked' });
    expect(entitlements.revoke).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER, planSlug: 'blue-plus-badge' }),
    );
    expect(repo.rows[0].status).toBe('revoked');
  });

  it('expires the subscription on SUBSCRIPTION_EXPIRED', async () => {
    const { service, google, entitlements } = setup();
    const base = {
      latestOrderId: 'GPA.7',
      externalAccountIdentifiers: { obfuscatedExternalAccountId: USER },
      lineItems: [
        {
          productId: 'sa.sarh.gold.monthly',
          expiryTime: new Date(Date.now() + DAY).toISOString(),
        },
      ],
    };
    google.getSubscriptionV2.mockResolvedValueOnce({
      ...base,
      subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
    });
    await service.handleGoogleRtdn(
      'Bearer good',
      push(
        {
          subscriptionNotification: { notificationType: 4, purchaseToken: 'g' },
        },
        'a',
      ),
    );
    google.getSubscriptionV2.mockResolvedValueOnce({
      ...base,
      subscriptionState: 'SUBSCRIPTION_STATE_EXPIRED',
      lineItems: [
        {
          productId: 'sa.sarh.gold.monthly',
          expiryTime: new Date(Date.now() - DAY).toISOString(),
        },
      ],
    });
    expect(
      await service.handleGoogleRtdn(
        'Bearer good',
        push(
          {
            subscriptionNotification: {
              notificationType: 13,
              purchaseToken: 'g',
            },
          },
          'b',
        ),
      ),
    ).toEqual({ outcome: 'expired' });
    expect(entitlements.expire).toHaveBeenCalledWith(USER);
  });
});
