/**
 * End-to-end promote payment flow test (mock NI mode).
 * Run: node scripts/test-promote-payment-flow.js
 * Requires backend on PORT (default 3001) with NI_API_KEY=test_ or empty.
 */
const BASE = process.env.API_BASE || 'http://127.0.0.1:3001/api';
const PHONE = process.env.TEST_PHONE || '+966500000001';
const PASSWORD = process.env.TEST_PASSWORD || 'Test1234';

async function req(method, path, { token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

function assert(label, cond, detail) {
  if (!cond) {
    console.error(`FAIL: ${label}`, detail ?? '');
    process.exit(1);
  }
  console.log(`OK: ${label}`);
}

async function main() {
  console.log('API_BASE =', BASE);

  const health = await req('GET', '/health').catch(() => ({ ok: false }));
  if (!health.ok) {
    const ping = await fetch(`${BASE.replace(/\/api$/, '')}/api/health`).catch(
      () => null,
    );
    assert(
      'backend reachable',
      ping?.ok,
      'Start backend first: npm run start:dev',
    );
  } else {
    assert('backend reachable', true);
  }

  const login = await req('POST', '/auth/login', {
    body: { login: PHONE, password: PASSWORD },
  });
  assert('login', login.ok && login.json.success, login.json);
  const token = login.json.data?.accessToken;
  const userId = login.json.data?.user?.id;
  assert('access token', Boolean(token));

  const quoteVis = await req(
    'GET',
    '/listings/promote/quote?goal=visibility&durationHours=24',
  );
  assert(
    'visibility quote',
    quoteVis.ok && quoteVis.json.success,
    quoteVis.json,
  );
  const reach = quoteVis.json.data?.reachEstimate;
  console.log('  reach estimate:', reach?.min, '-', reach?.max);

  const quotePin = await req(
    'GET',
    '/listings/promote/quote?goal=pinned&durationHours=24',
  );
  assert('pinned quote', quotePin.ok && quotePin.json.success, quotePin.json);
  console.log('  pinned 24h price:', quotePin.json.data?.amount, 'SAR');

  let listingId;
  const listings = await req('GET', `/listings?sellerId=${userId}`, { token });
  listingId = listings.json.data?.listings?.[0]?.id;

  if (!listingId) {
    const created = await req('POST', '/listings', {
      token,
      body: {
        arabicTitle: 'إعلان اختبار الترويج',
        title: 'Promote test listing',
        price: 5000,
        currency: 'SAR',
        category: 'sheep',
        arabicLocation: 'الرياض',
        location: 'Riyadh',
        country: 'SA',
        description: 'Listing for promote payment flow test run.',
        arabicDescription: 'إعلان لاختبار مسار دفع الترويج في النظام.',
        images: ['https://picsum.photos/seed/sarh-promote-test/800/600'],
      },
    });
    assert('create listing', created.ok && created.json.success, created.json);
    listingId = created.json.data?.id;
  }
  assert('listing id', Boolean(listingId));
  console.log('  listingId:', listingId);

  const promo = await req('POST', `/listings/${listingId}/promotion`, {
    token,
    body: {
      method: 'mada',
      durationHours: 24,
      promotionGoal: 'visibility',
    },
  });
  assert(
    'initiate visibility promotion',
    promo.ok && promo.json.success,
    promo.json,
  );
  const promoPaymentId = promo.json.data?.paymentId;
  const promoDevMode = promo.json.data?.devMode;
  console.log(
    '  promotion paymentId:',
    promoPaymentId,
    'devMode:',
    promoDevMode,
  );

  if (promoDevMode) {
    const complete = await req(
      'POST',
      `/payments/${promoPaymentId}/dev-complete`,
      { token },
    );
    assert(
      'dev-complete promotion payment',
      complete.ok && complete.json.success,
      complete.json,
    );

    const stats = await req('GET', `/listings/${listingId}/promotion/stats`, {
      token,
    });
    assert(
      'promotion stats after pay',
      stats.ok && stats.json.data?.isPromoted,
      stats.json.data,
    );
    console.log('  promoted until:', stats.json.data?.expiresAt);
  } else {
    console.log('SKIP: dev-complete (NI keys configured — real gateway mode)');
    console.log('  checkoutUrl:', promo.json.data?.checkoutUrl?.slice(0, 80));
  }

  const boost = await req('POST', `/listings/${listingId}/boost`, {
    token,
    body: {
      method: 'mada',
      boostType: 'pinned',
      durationHours: 24,
      promotionGoal: 'pinned',
    },
  });
  assert('initiate pinned boost', boost.ok && boost.json.success, boost.json);
  const boostPaymentId = boost.json.data?.paymentId;
  const boostAmount = boost.json.data?.amount;
  console.log('  boost paymentId:', boostPaymentId, 'amount:', boostAmount);

  if (boost.json.data?.devMode) {
    const completeBoost = await req(
      'POST',
      `/payments/${boostPaymentId}/dev-complete`,
      { token },
    );
    assert(
      'dev-complete boost payment',
      completeBoost.ok && completeBoost.json.success,
      completeBoost.json,
    );

    const listing = await req('GET', `/listings/${listingId}`, { token });
    assert(
      'listing pinned after pay',
      listing.json.data?.pinned === true,
      listing.json.data,
    );
    console.log('  pinnedUntil:', listing.json.data?.pinnedUntil);
  } else {
    console.log('SKIP: boost dev-complete (real NI mode)');
  }

  console.log('\nAll promote payment flow checks passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
