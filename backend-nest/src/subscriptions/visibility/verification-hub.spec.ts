import { of, lastValueFrom } from 'rxjs';
import {
  maskHiddenBadges,
  type BadgeVisibilityPrefs,
} from './badge-visibility';
import { BadgeVisibilityInterceptor } from './badge-visibility.interceptor';
import { resolveBilling } from '../billing/subscription-billing';
import { SubscriptionBillingService } from '../billing/subscription-billing.service';
import { ApiException } from '../../common/exceptions/api.exception';

const future = new Date(Date.now() + 10 * 86400000);

describe('resolveBilling', () => {
  it('store subscription wins and follows the store auto-renew / expiry', () => {
    const exp = new Date('2026-11-09T00:00:00Z');
    expect(
      resolveBilling({
        subscription: {
          planId: 'gold-badge',
          renewDate: future,
          autoRenew: true,
        },
        store: { platform: 'app_store', autoRenew: false, expiresAt: exp },
      }),
    ).toEqual({ source: 'app_store', autoRenew: false, expiresAt: exp });
  });
  it('web paid plan is ngenius, trial is trial, free is none', () => {
    expect(
      resolveBilling({
        subscription: {
          planId: 'blue-badge',
          renewDate: future,
          autoRenew: true,
        },
        store: null,
      }).source,
    ).toBe('ngenius');
    expect(
      resolveBilling({
        subscription: {
          planId: 'blue-plus-badge',
          renewDate: future,
          autoRenew: false,
          status: 'trial',
        },
        store: null,
      }),
    ).toEqual({ source: 'trial', autoRenew: false, expiresAt: future });
    expect(
      resolveBilling({
        subscription: { planId: 'free', renewDate: future, autoRenew: true },
        store: null,
      }),
    ).toEqual({ source: 'none', autoRenew: false, expiresAt: null });
  });
});

describe('SubscriptionBillingService.assertNotStoreBilled', () => {
  const svc = (row: unknown) =>
    new SubscriptionBillingService({
      storePurchase: { findFirst: jest.fn().mockResolvedValue(row) },
    } as never);

  it('refuses our cancel for store-billed subscriptions (manage_in_store)', async () => {
    await expect(
      svc({
        platform: 'google_play',
        autoRenew: true,
        expiresAt: future,
      }).assertNotStoreBilled('u1'),
    ).rejects.toMatchObject({ status: 409, error: 'manage_in_store' });
    await expect(
      svc({
        platform: 'app_store',
        autoRenew: true,
        expiresAt: future,
      }).assertNotStoreBilled('u1'),
    ).rejects.toBeInstanceOf(ApiException);
  });
  it('lets web / N-Genius subscriptions cancel', async () => {
    await expect(svc(null).assertNotStoreBilled('u1')).resolves.toBeUndefined();
  });
});

describe('maskHiddenBadges', () => {
  const hidden = new Map<string, BadgeVisibilityPrefs>([
    ['gold1', { hideVerifiedBadge: false, hideGoldSellerLabel: true }],
    ['blue1', { hideVerifiedBadge: true, hideGoldSellerLabel: false }],
  ]);

  it('hides the badge / label from others, never mutates the input', () => {
    const payload = {
      success: true,
      data: {
        items: [
          {
            id: 'l1',
            seller: { id: 'blue1', verified: true, verifiedTier: 'blue' },
          },
          {
            id: 'l2',
            seller: { id: 'gold1', verified: true, verifiedTier: 'gold' },
          },
          {
            id: 'l3',
            seller: { id: 'other', verified: true, verifiedTier: 'gold' },
          },
        ],
      },
    };
    const snapshot = JSON.stringify(payload);
    const out = maskHiddenBadges(payload, hidden, 'viewer');
    expect(JSON.stringify(payload)).toBe(snapshot);
    expect(out.data.items[0].seller).toEqual({
      id: 'blue1',
      verified: false,
      verifiedTier: null,
    });
    expect(out.data.items[1].seller).toEqual({
      id: 'gold1',
      verified: true,
      verifiedTier: 'gold',
      hideGoldSellerLabel: true,
    });
    // untouched branches keep identity
    expect(out.data.items[2]).toBe(payload.data.items[2]);
  });

  it('the owner still sees their own badge', () => {
    const me = { id: 'blue1', verified: true, verifiedTier: 'blue' };
    expect(maskHiddenBadges({ user: me }, hidden, 'blue1').user).toBe(me);
  });

  it('passes through when nobody hides anything', () => {
    const p = { a: { id: 'x', verified: true } };
    expect(maskHiddenBadges(p, new Map(), null)).toBe(p);
  });

  it('ignores non user-shaped objects and Dates', () => {
    const d = new Date();
    const p = { id: 'blue1', name: 'no badge field', at: d };
    const out = maskHiddenBadges(p, hidden, null);
    expect(out).toBe(p);
  });
});

describe('BadgeVisibilityInterceptor', () => {
  const ctx = (url: string) =>
    ({
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => ({ originalUrl: url, user: { userId: 'v' } }),
      }),
    }) as never;
  const visibility = {
    hiddenMap: jest
      .fn()
      .mockResolvedValue(
        new Map([
          ['blue1', { hideVerifiedBadge: true, hideGoldSellerLabel: false }],
        ]),
      ),
  };
  const interceptor = new BadgeVisibilityInterceptor(visibility as never);
  const body = { data: { id: 'blue1', verified: true, verifiedTier: 'blue' } };

  it('masks public API responses', async () => {
    const out = (await lastValueFrom(
      interceptor.intercept(ctx('/api/users/by-username/x'), {
        handle: () => of(body),
      }),
    )) as typeof body;
    expect(out.data.verified).toBe(false);
  });
  it('leaves admin endpoints untouched', async () => {
    const out = await lastValueFrom(
      interceptor.intercept(ctx('/api/admin/users'), {
        handle: () => of(body),
      }),
    );
    expect(out).toBe(body);
  });
});
