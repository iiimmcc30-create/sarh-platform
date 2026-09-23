import { compareListingBoostPriority, nextMarketSortMode } from '../lib/listingSort';
import type { Listing } from '../services/types';
import {
  BOOST_TYPE_ORDER,
  FALLBACK_BOOST_PLANS,
  boostSuccessMessage,
  boostTypeLabel,
  formatBoostExpiry,
} from '../services/listingBoost';
import {
  formatPlanFeatureText,
  normalizeSlug,
  mapApiPlan,
  isStoreExemptFromPermissions,
} from '../services/subscriptionPlans';
import { isPaymentReturnUrl, paymentResultDeepLink } from '../services/paymentCheckout';
import { syncPaymentStatus } from '../services/payments';

function listing(partial: Partial<Listing> & { id: string }): Listing {
  return {
    id: partial.id,
    title: 't',
    arabicTitle: 'ع',
    price: 100,
    currency: 'SAR',
    category: 'sheep',
    breed: '',
    age: '',
    location: 'Riyadh',
    arabicLocation: 'الرياض',
    country: 'SA',
    images: [],
    description: 'd',
    arabicDescription: 'و',
    seller: {
      id: 's1',
      username: 'u',
      displayName: 'U',
      arabicName: 'م',
      verified: partial.seller?.verified ?? false,
      followers: 0,
      following: 0,
      rating: null,
      country: 'SA',
      bio: '',
    },
    featured: partial.featured ?? false,
    pinned: partial.pinned ?? false,
    postedAt: 'اليوم',
    createdAt: partial.createdAt ?? '2026-01-01T00:00:00.000Z',
  };
}

describe('listingSort', () => {
  it('orders pinned > featured > verified > newest', () => {
    const items = [
      listing({ id: 'a', featured: true, createdAt: '2026-01-01T00:00:00Z' }),
      listing({ id: 'b', pinned: true, createdAt: '2026-01-01T00:00:00Z' }),
      listing({
        id: 'c',
        createdAt: '2026-01-03T00:00:00Z',
        seller: {
          id: 's',
          username: 'v',
          displayName: 'V',
          arabicName: 'م',
          verified: true,
          followers: 0,
          following: 0,
          rating: null,
          country: 'SA',
          bio: '',
        },
      }),
      listing({ id: 'd', createdAt: '2026-01-02T00:00:00Z' }),
    ];
    const sorted = [...items].sort(compareListingBoostPriority);
    expect(sorted.map((x) => x.id)).toEqual(['b', 'a', 'c', 'd']);
  });

  it('cycles the existing market sort values without inventing new ones', () => {
    expect(nextMarketSortMode('newest')).toBe('oldest');
    expect(nextMarketSortMode('oldest')).toBe('price_asc');
    expect(nextMarketSortMode('price_asc')).toBe('price_desc');
    expect(nextMarketSortMode('price_desc')).toBe('newest');
  });
});

describe('listingBoost helpers', () => {
  it('exposes boost types and fallback prices', () => {
    expect(BOOST_TYPE_ORDER).toEqual(['pinned', 'featured', 'promotion']);
    expect(FALLBACK_BOOST_PLANS.pinned[0].amount).toBe(12);
    expect(FALLBACK_BOOST_PLANS.featured[0].amount).toBe(9);
    expect(FALLBACK_BOOST_PLANS.featured[1].amount).toBe(25);
    expect(FALLBACK_BOOST_PLANS.pinned[1].amount).toBe(29);
    expect(boostTypeLabel('featured')).toContain('تمييز');
  });

  it('formats expiry and success messages', () => {
    expect(formatBoostExpiry('2026-08-01T12:00:00.000Z')).toBeTruthy();
    expect(boostSuccessMessage('pinned')).toBeTruthy();
    expect(boostSuccessMessage('both', '2026-08-01T12:00:00.000Z')).toBeTruthy();
  });
});

describe('subscriptionPlans helpers', () => {
  it('normalizeSlug maps legacy', () => {
    expect(normalizeSlug('pro')).toBe('sarh-pro');
    expect(normalizeSlug('FREE')).toBe('free');
  });

  it('mapApiPlan localizes', () => {
    const plan = mapApiPlan({
      slug: 'sarh-pro',
      name: 'Pro',
      monthlyPrice: 299,
      audience: 'USER',
      displayFeatures: [
        { key: 'monthlyPinnedAds', value: 10, valueType: 'NUMBER' },
      ],
    });
    expect(plan.slug).toBe('sarh-pro');
    expect(plan.name).toBeTruthy();
  });

  it('formatPlanFeatureText', () => {
    expect(formatPlanFeatureText('monthlyPinnedAds', 10, 'NUMBER')).toContain('تثبيت');
    expect(formatPlanFeatureText('maxAdsPer24Hours', -1, 'NUMBER')).toContain('غير محدود');
    expect(formatPlanFeatureText('verifiedBadge', true, 'BOOLEAN')).toBe('متاح');
  });

  it('isStoreExemptFromPermissions', () => {
    expect(isStoreExemptFromPermissions({ storeCommission: 0 })).toBe(true);
    expect(isStoreExemptFromPermissions({ storeCommission: 5 })).toBe(false);
  });
});

describe('paymentCheckout deep link', () => {
  it('builds base and query params', () => {
    expect(paymentResultDeepLink()).toBe('sarh://payment/result');
    const url = paymentResultDeepLink({
      paymentId: 'p1',
      context: 'boost',
      gatewayReturn: '1',
    });
    expect(url).toContain('sarh://payment/result?');
    expect(url).toContain('paymentId=p1');
    expect(url).toContain('context=boost');
  });

  it('detects NI return and cancel URLs', () => {
    expect(isPaymentReturnUrl('sarh://payment/result?paymentId=1')).toBe('result');
    expect(isPaymentReturnUrl('https://sarh-new4.onrender.com/payment/result?paymentId=1')).toBe(
      'result',
    );
    expect(isPaymentReturnUrl('sarh://payment/cancel')).toBe('cancel');
    expect(isPaymentReturnUrl('https://sarh-new4.onrender.com/payment/cancel')).toBe('cancel');
    expect(isPaymentReturnUrl('https://paypage.ksa.ngenius-payments.com/?code=abc')).toBe(null);
  });
});

describe('syncPaymentStatus mapping (fetch mock)', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function mockRes(status: number, body: unknown) {
    global.fetch = jest.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    }) as unknown as typeof fetch;
  }

  it('maps CAPTURED/success → paid', async () => {
    mockRes(200, {
      success: true,
      data: { outcome: 'success', status: 'paid', messageAr: 'تم الدفع بنجاح' },
    });
    const r = await syncPaymentStatus('tok', 'pay1');
    expect(r.status).toBe('paid');
  });

  it('maps failed/cancelled → cancelled (no fulfill)', async () => {
    mockRes(200, {
      success: true,
      data: { outcome: 'failed', status: 'failed' },
    });
    const r = await syncPaymentStatus('tok', 'pay1');
    expect(r.status).toBe('cancelled');
  });

  it('maps processing → pending', async () => {
    mockRes(200, {
      success: true,
      data: { outcome: 'processing', status: 'pending' },
    });
    const r = await syncPaymentStatus('tok', 'pay2');
    expect(r.status).toBe('pending');
  });

  it('maps 404 → not_found', async () => {
    mockRes(404, { success: false });
    const r = await syncPaymentStatus('tok', 'missing');
    expect(r.status).toBe('not_found');
  });

  it('maps 429 → rate_limited', async () => {
    mockRes(429, {});
    const r = await syncPaymentStatus('tok', 'pay3');
    expect(r.status).toBe('rate_limited');
  });

  it('dedupes concurrent sync for same paymentId', async () => {
    let resolveJson!: (v: unknown) => void;
    const jsonPromise = new Promise((resolve) => {
      resolveJson = resolve;
    });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => jsonPromise,
    }) as unknown as typeof fetch;

    const p1 = syncPaymentStatus('tok', 'same-id');
    const p2 = syncPaymentStatus('tok', 'same-id');
    expect(global.fetch).toHaveBeenCalledTimes(1);
    resolveJson({
      success: true,
      data: { outcome: 'success', status: 'paid' },
    });
    const [a, b] = await Promise.all([p1, p2]);
    expect(a.status).toBe('paid');
    expect(b.status).toBe('paid');
  });
});
