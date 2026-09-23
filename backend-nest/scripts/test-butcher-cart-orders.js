/**
 * Integration smoke test: Buy Now (legacy) + Cart (multi-item).
 * Usage: node scripts/test-butcher-cart-orders.js
 */
const { PrismaClient } = require('@prisma/client');

const BASE = process.env.API_BASE || 'http://localhost:3001';
const prisma = new PrismaClient();

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, json };
}

function assertPaymentInitiate(label, payRes) {
  if (payRes.ok && payRes.json.success) {
    console.log(`${label}_PAYMENT_OK`, payRes.json.data?.paymentId);
    return;
  }
  // Amount/reference validation passed; NI gateway unavailable in this env.
  if (payRes.json.error === 'payment_gateway_error') {
    console.log(`${label}_PAYMENT_VALIDATION_OK_GATEWAY_SKIP`, payRes.json.messageAr);
    return;
  }
  throw new Error(`${label} payment initiate failed: ${JSON.stringify(payRes.json)}`);
}

async function login(loginId, password) {
  const { ok, json } = await api('/api/auth/login', {
    method: 'POST',
    body: { login: loginId, password },
  });
  if (!ok || !json.success) {
    throw new Error(`Login failed: ${json.message || json.messageAr || 'unknown'}`);
  }
  return json.data.accessToken ?? json.data.tokens?.accessToken;
}

async function ensureTestProducts(butcherId) {
  const existing = await prisma.butcherProduct.findMany({
    where: { butcherId, deletedAt: null, inStock: true },
    take: 3,
  });
  if (existing.length >= 2) return existing.slice(0, 3);

  const base = {
    butcherId,
    category: 'beef',
    images: ['https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?w=400'],
    availableCuts: ['whole', 'sliced'],
    weightMin: 1,
    weightMax: 20,
    availableQuantity: 100,
    reservedQuantity: 0,
    inStock: true,
    freshness: 'fresh',
    descriptionAr: 'منتج تجريبي',
    descriptionEn: 'Test product',
    country: 'SA',
  };

  const created = [];
  for (let i = existing.length; i < 3; i += 1) {
    const p = await prisma.butcherProduct.create({
      data: {
        ...base,
        nameAr: `منتج تجريبي ${i + 1}`,
        nameEn: `Test Product ${i + 1}`,
        pricePerKg: 50 + i * 10,
        priceFixed: null,
      },
    });
    created.push(p);
  }
  return [...existing, ...created].slice(0, 3);
}

async function main() {
  console.log('API_BASE', BASE);

  const health = await fetch(`${BASE}/api/health`).catch(() => null);
  if (!health?.ok) {
    throw new Error('Backend not reachable at ' + BASE);
  }
  console.log('HEALTH_OK');

  const butcher = await prisma.butcher.findFirst({
    where: { deletedAt: null },
    orderBy: { createdAt: 'asc' },
  });
  if (!butcher) throw new Error('No butcher found in DB');

  const products = await ensureTestProducts(butcher.id);
  if (products.length < 2) throw new Error('Need at least 2 products');

  const token = await login('+966500000001', 'Test1234');
  console.log('LOGIN_OK');

  const ordersBefore = await prisma.butcherOrder.count({
    where: { customerId: (await prisma.user.findUnique({ where: { phone: '+966500000001' } })).id },
  });

  // A) Buy Now legacy payload
  const buyNowRes = await api('/api/butchers/orders', {
    method: 'POST',
    token,
    body: {
      butcherId: butcher.id,
      productId: products[0].id,
      cutType: products[0].availableCuts[0] || 'whole',
      weightKg: 2,
      deliveryType: 'pickup',
      deliveryAddress: null,
      notes: 'test buy now',
      currency: 'SAR',
    },
  });

  if (!buyNowRes.ok || !buyNowRes.json.success) {
    throw new Error(`Buy Now failed: ${JSON.stringify(buyNowRes.json)}`);
  }

  const buyNowOrder = buyNowRes.json.data;
  console.log('BUY_NOW_ORDER', buyNowOrder.id, buyNowOrder.orderNumber, buyNowOrder.totalPrice);

  const buyNowItems = await prisma.butcherOrderItem.findMany({
    where: { orderId: buyNowOrder.id },
  });
  if (buyNowItems.length !== 1) {
    throw new Error(`Buy Now expected 1 item row, got ${buyNowItems.length}`);
  }
  console.log('BUY_NOW_ITEMS_OK', buyNowItems.length);

  const payBuyNow = await api('/api/payments/initiate', {
    method: 'POST',
    token,
    body: {
      amount: buyNowOrder.totalPrice,
      currency: 'SAR',
      method: 'mada',
      type: 'butcher_order',
      referenceId: buyNowOrder.id,
      description: `Butcher order ${buyNowOrder.orderNumber}`,
      descriptionAr: `دفع طلب ${buyNowOrder.orderNumber}`,
    },
  });
  assertPaymentInitiate('BUY_NOW', payBuyNow);

  const buyNowPayments = await prisma.payment.count({
    where: { referenceId: buyNowOrder.id, referenceType: 'butcher_order' },
  });
  console.log('BUY_NOW_PAYMENT_RECORDS', buyNowPayments, '(expect 0-1, one initiate attempt)');

  // B/C) Cart multi-item (2-3 products)
  const cartLines = products.slice(0, Math.min(3, products.length)).map((p, idx) => ({
    productId: p.id,
    cutType: p.availableCuts[0] || 'whole',
    weightKg: 1 + idx * 0.5,
  }));

  const cartRes = await api('/api/butchers/orders', {
    method: 'POST',
    token,
    body: {
      butcherId: butcher.id,
      items: cartLines,
      deliveryType: 'delivery',
      deliveryAddress: 'حي النخيل، الرياض',
      notes: 'test cart',
      currency: 'SAR',
    },
  });

  if (!cartRes.ok || !cartRes.json.success) {
    throw new Error(`Cart order failed: ${JSON.stringify(cartRes.json)}`);
  }

  const cartOrder = cartRes.json.data;
  console.log('CART_ORDER', cartOrder.id, cartOrder.orderNumber, cartOrder.totalPrice);

  const cartItems = await prisma.butcherOrderItem.findMany({
    where: { orderId: cartOrder.id },
  });
  if (cartItems.length !== cartLines.length) {
    throw new Error(`Cart expected ${cartLines.length} items, got ${cartItems.length}`);
  }
  console.log('CART_ITEMS_OK', cartItems.length);

  const expectedTotal = Math.round(
    cartItems.reduce((s, i) => s + i.linePrice, 0) * 100,
  ) / 100;
  if (Math.abs(cartOrder.totalPrice - expectedTotal) > 0.01) {
    throw new Error(`Total mismatch: order=${cartOrder.totalPrice} items=${expectedTotal}`);
  }
  console.log('CART_TOTAL_OK', expectedTotal);

  const payCart = await api('/api/payments/initiate', {
    method: 'POST',
    token,
    body: {
      amount: cartOrder.totalPrice,
      currency: 'SAR',
      method: 'mada',
      type: 'butcher_order',
      referenceId: cartOrder.id,
      description: `Butcher order ${cartOrder.orderNumber}`,
      descriptionAr: `دفع طلب ${cartOrder.orderNumber}`,
    },
  });
  assertPaymentInitiate('CART', payCart);

  const cartPayments = await prisma.payment.count({
    where: { referenceId: cartOrder.id, referenceType: 'butcher_order' },
  });
  console.log('CART_PAYMENT_RECORDS', cartPayments, '(expect 0-1, one initiate attempt)');

  const ordersAfter = await prisma.butcherOrder.count({
    where: { customerId: (await prisma.user.findUnique({ where: { phone: '+966500000001' } })).id },
  });
  const ordersCreated = ordersAfter - ordersBefore;
  if (ordersCreated !== 2) {
    throw new Error(`Expected 2 new orders, created ${ordersCreated}`);
  }
  // One order + one payment initiate per flow (no loops).
  if (buyNowPayments > 1 || cartPayments > 1) {
    throw new Error('Multiple payment records for single order — unexpected');
  }
  console.log('SINGLE_ORDER_SINGLE_PAYMENT_FLOW_OK');

  console.log('ORDERS_CREATED', ordersCreated, '(1 buy now + 1 cart)');

  // Legacy orders backfill check (if any existed before migration)
  const legacyWithoutItems = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS count
    FROM "ButcherOrder" o
    WHERE NOT EXISTS (SELECT 1 FROM "ButcherOrderItem" i WHERE i."orderId" = o.id)
  `;
  console.log('LEGACY_ORDERS_WITHOUT_ITEMS', legacyWithoutItems[0]?.count ?? 0);

  console.log('\nALL_TESTS_PASSED');
}

main()
  .catch((e) => {
    console.error('TEST_FAILED', e.message || e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
