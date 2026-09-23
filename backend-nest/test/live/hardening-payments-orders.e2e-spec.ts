import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import {
  API,
  ADMIN_LOGIN,
  ADMIN_PASSWORD,
  apiReachable,
  authHeader,
  registerUser,
  sampleListing,
  uniqueId,
} from './helpers';

const prisma = new PrismaClient();

describe('Hardening runtime — listings, payments, and butcher orders', () => {
  let live = false;

  beforeAll(async () => {
    live = await apiReachable();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const t = (name: string, fn: () => Promise<void>) =>
    it(name, async () => {
      if (!live) return;
      await fn();
    });

  t('register → login context → create listing → edit → delete', async () => {
    const user = await registerUser('hard_listing');

    const created = await request(API)
      .post('/api/listings')
      .set(authHeader(user.accessToken))
      .send(
        sampleListing({
          arabicTitle: 'إعلان تقوية',
          title: 'Hardening Listing',
        }),
      );
    expect([200, 201]).toContain(created.status);
    const listingId = created.body.data?.id;
    expect(listingId).toBeTruthy();

    const updated = await request(API)
      .put(`/api/listings/${listingId}`)
      .set(authHeader(user.accessToken))
      .send({ arabicTitle: 'إعلان تقوية محدث' });
    expect(updated.status).toBe(200);

    const removed = await request(API)
      .delete(`/api/listings/${listingId}`)
      .set(authHeader(user.accessToken));
    expect(removed.status).toBe(200);

    const notFound = await request(API).get(`/api/listings/${listingId}`);
    expect(notFound.status).toBe(404);
  });

  t(
    'listing fee payment is bound to the owner listing and records payment fields',
    async () => {
      const owner = await registerUser('hard_fee_owner');
      const stranger = await registerUser('hard_fee_stranger');

      const created = await request(API)
        .post('/api/listings')
        .set(authHeader(owner.accessToken))
        .send(
          sampleListing({ arabicTitle: 'إعلان عمولة', title: 'Fee Listing' }),
        );
      expect([200, 201]).toContain(created.status);
      const listingId = created.body.data?.id as string;

      const forbidden = await request(API)
        .post('/api/payments/initiate')
        .set(authHeader(stranger.accessToken))
        .send({
          amount: 25,
          currency: 'SAR',
          method: 'visa',
          type: 'commission',
          referenceId: listingId,
        });
      expect(forbidden.status).toBe(404);
      expect(forbidden.body.error).toBe('listing_not_found');

      const initiated = await request(API)
        .post('/api/payments/initiate')
        .set(authHeader(owner.accessToken))
        .send({
          amount: 25,
          currency: 'SAR',
          method: 'visa',
          type: 'commission',
          referenceId: listingId,
        });
      expect(initiated.status).toBe(200);
      const paymentId = initiated.body.data?.paymentId as string;
      expect(paymentId).toBeTruthy();

      const completed = await request(API)
        .post(`/api/payments/${paymentId}/dev-complete`)
        .set(authHeader(owner.accessToken));
      expect(completed.status).toBe(200);

      const payment = await prisma.payment.findUnique({
        where: { id: paymentId },
      });
      expect(payment).toMatchObject({
        userId: owner.id,
        amount: 25,
        status: 'paid',
        referenceId: listingId,
        referenceType: 'commission',
      });
      expect(payment?.orderId).toBeTruthy();
      expect(payment?.paidAt).toBeTruthy();
      expect(payment?.createdAt).toBeTruthy();
    },
  );

  t(
    'double payment initiation for the same listing stays idempotent',
    async () => {
      const owner = await registerUser('hard_race');
      const created = await request(API)
        .post('/api/listings')
        .set(authHeader(owner.accessToken))
        .send(
          sampleListing({ arabicTitle: 'إعلان تزامن', title: 'Race Listing' }),
        );
      expect([200, 201]).toContain(created.status);
      const listingId = created.body.data?.id as string;

      const payload = {
        amount: 15,
        currency: 'SAR',
        method: 'visa',
        type: 'commission',
        referenceId: listingId,
      };

      const [a, b] = await Promise.all([
        request(API)
          .post('/api/payments/initiate')
          .set(authHeader(owner.accessToken))
          .send(payload),
        request(API)
          .post('/api/payments/initiate')
          .set(authHeader(owner.accessToken))
          .send(payload),
      ]);

      expect(a.status).toBe(200);
      expect(b.status).toBe(200);
      expect(a.body.data?.paymentId).toBe(b.body.data?.paymentId);

      const pending = await prisma.payment.findMany({
        where: {
          userId: owner.id,
          referenceId: listingId,
          referenceType: 'commission',
          status: 'pending',
        },
      });
      expect(pending).toHaveLength(1);
    },
  );

  t(
    'butcher order payment uses trusted total and rejects a tampered amount',
    async () => {
      const butcherOwner = await prisma.user.create({
        data: {
          username: `butcher_${uniqueId()}`,
          passwordHash: 'x',
          displayName: 'Butcher Owner',
          arabicName: 'صاحب الملحمة',
          country: 'SA',
        },
      });
      const butcher = await prisma.butcher.create({
        data: {
          userId: butcherOwner.id,
          nameAr: 'ملحمة الاختبار',
          nameEn: 'Test Butcher',
          country: 'SA',
          city: 'Dammam',
          cityAr: 'الدمام',
          address: 'Dammam',
          addressAr: 'الدمام',
          phone: '+966500000111',
          specialties: [],
        },
      });
      const product = await prisma.butcherProduct.create({
        data: {
          butcherId: butcher.id,
          nameAr: 'لحم ضأن',
          nameEn: 'Lamb',
          category: 'lamb',
          images: ['https://cdn.sarh.app/e2e/lamb.jpg'],
          pricePerKg: 40,
          availableCuts: ['whole'],
          availableQuantity: 20,
          inStock: true,
          freshness: 'fresh',
          descriptionAr: 'منتج اختبار',
          descriptionEn: 'Test product',
          country: 'SA',
        },
      });

      const customer = await registerUser('hard_order');
      const created = await request(API)
        .post('/api/butchers/orders')
        .set(authHeader(customer.accessToken))
        .send({
          butcherId: butcher.id,
          deliveryType: 'pickup',
          currency: 'SAR',
          items: [{ productId: product.id, cutType: 'whole', weightKg: 2 }],
        });
      expect(created.status).toBe(201);
      const orderId = created.body.data?.id as string;
      const totalPrice = created.body.data?.totalPrice as number;
      expect(totalPrice).toBeGreaterThan(0);

      const tampered = await request(API)
        .post('/api/payments/initiate')
        .set(authHeader(customer.accessToken))
        .send({
          amount: totalPrice - 1,
          currency: 'SAR',
          method: 'visa',
          type: 'butcher_order',
          referenceId: orderId,
        });
      expect(tampered.status).toBe(400);
      expect(tampered.body.error).toBe('amount_mismatch');

      const initiated = await request(API)
        .post('/api/payments/initiate')
        .set(authHeader(customer.accessToken))
        .send({
          amount: totalPrice,
          currency: 'SAR',
          method: 'visa',
          type: 'butcher_order',
          referenceId: orderId,
        });
      expect(initiated.status).toBe(200);
      const paymentId = initiated.body.data?.paymentId as string;

      const completed = await request(API)
        .post(`/api/payments/${paymentId}/dev-complete`)
        .set(authHeader(customer.accessToken));
      expect(completed.status).toBe(200);

      const order = await prisma.butcherOrder.findUnique({
        where: { id: orderId },
      });
      expect(order?.paymentStatus).toBe('paid');
    },
  );

  t('webhook duplicate stays idempotent for a pending payment', async () => {
    const owner = await registerUser('hard_webhook_dup');
    const created = await request(API)
      .post('/api/listings')
      .set(authHeader(owner.accessToken))
      .send(
        sampleListing({
          arabicTitle: 'إعلان ويبهوك',
          title: 'Webhook Listing',
        }),
      );
    const listingId = created.body.data?.id as string;

    const initiated = await request(API)
      .post('/api/payments/initiate')
      .set(authHeader(owner.accessToken))
      .send({
        amount: 11,
        currency: 'SAR',
        method: 'visa',
        type: 'commission',
        referenceId: listingId,
      });
    const paymentId = initiated.body.data?.paymentId as string;

    const body = JSON.stringify({
      eventName: 'ORDER.PAID',
      order: {
        reference: 'NI-WEBHOOK-1',
        customData: {
          paymentId,
          type: 'commission',
          referenceId: listingId,
          userId: owner.id,
        },
      },
    });

    const first = await request(API)
      .post('/api/payments/webhook')
      .set('Content-Type', 'application/json')
      .send(body);
    const second = await request(API)
      .post('/api/payments/webhook')
      .set('Content-Type', 'application/json')
      .send(body);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
    });
    expect(payment?.status).toBe('paid');

    const notificationCount = await prisma.notification.count({
      where: {
        userId: owner.id,
        type: 'system',
      },
    });
    expect(notificationCount).toBeGreaterThan(0);
  });

  t(
    'webhook returns 500 on internal processing failure and keeps payment pending',
    async () => {
      const user = await registerUser('hard_webhook_fail');
      const payment = await prisma.payment.create({
        data: {
          userId: user.id,
          orderId: `SFAT-WEBHOOK-${uniqueId().toUpperCase()}`,
          amount: 99,
          currency: 'SAR',
          method: 'visa',
          status: 'pending',
          referenceId: '00000000-0000-0000-0000-000000000000',
          referenceType: 'subscription',
          metadata: {
            type: 'subscription',
            referenceId: '00000000-0000-0000-0000-000000000000',
            userId: user.id,
            targetPlanId: 'sarh-pro',
            billingCycle: 'monthly',
          },
        },
      });

      const res = await request(API)
        .post('/api/payments/webhook')
        .set('Content-Type', 'application/json')
        .send(
          JSON.stringify({
            eventName: 'ORDER.PAID',
            order: {
              reference: 'NI-WEBHOOK-FAIL',
              customData: {
                paymentId: payment.id,
                type: 'subscription',
                referenceId: '00000000-0000-0000-0000-000000000000',
                userId: user.id,
                targetPlanId: 'sarh-pro',
                billingCycle: 'monthly',
              },
            },
          }),
        );

      expect(res.status).toBe(500);

      const refreshed = await prisma.payment.findUnique({
        where: { id: payment.id },
      });
      expect(refreshed?.status).toBe('pending');
    },
  );

  t(
    'unpaid orders expire and release inventory; paid orders do not',
    async () => {
      const butcherOwner = await prisma.user.create({
        data: {
          username: `butcher_exp_${uniqueId()}`,
          passwordHash: 'x',
          displayName: 'Butcher Owner Exp',
          arabicName: 'صاحب ملحمة التقادم',
          country: 'SA',
        },
      });
      const butcher = await prisma.butcher.create({
        data: {
          userId: butcherOwner.id,
          nameAr: 'ملحمة المهلة',
          nameEn: 'Expiry Butcher',
          country: 'SA',
          city: 'Riyadh',
          cityAr: 'الرياض',
          address: 'Riyadh',
          addressAr: 'الرياض',
          phone: '+966500000222',
          specialties: [],
        },
      });
      const product = await prisma.butcherProduct.create({
        data: {
          butcherId: butcher.id,
          nameAr: 'منتج مهلة',
          nameEn: 'Expiry Product',
          category: 'lamb',
          images: ['https://cdn.sarh.app/e2e/expiry.jpg'],
          pricePerKg: 20,
          availableCuts: ['whole'],
          availableQuantity: 10,
          inStock: true,
          freshness: 'fresh',
          descriptionAr: 'منتج مهلة',
          descriptionEn: 'Expiry product',
          country: 'SA',
        },
      });
      const customer = await registerUser('hard_expiry');

      const unpaidRes = await request(API)
        .post('/api/butchers/orders')
        .set(authHeader(customer.accessToken))
        .send({
          butcherId: butcher.id,
          deliveryType: 'pickup',
          currency: 'SAR',
          items: [{ productId: product.id, cutType: 'whole', weightKg: 1 }],
        });
      expect(unpaidRes.status).toBe(201);
      const unpaidOrderId = unpaidRes.body.data?.id as string;

      await prisma.butcherOrder.update({
        where: { id: unpaidOrderId },
        data: { createdAt: new Date(Date.now() - 2 * 60 * 1000) },
      });

      await new Promise((r) => setTimeout(r, 5000));

      const expiredOrder = await prisma.butcherOrder.findUnique({
        where: { id: unpaidOrderId },
      });
      const expiredProduct = await prisma.butcherProduct.findUnique({
        where: { id: product.id },
      });
      expect(expiredOrder?.status).toBe('cancelled');
      expect(expiredProduct?.reservedQuantity).toBe(0);

      const paidRes = await request(API)
        .post('/api/butchers/orders')
        .set(authHeader(customer.accessToken))
        .send({
          butcherId: butcher.id,
          deliveryType: 'pickup',
          currency: 'SAR',
          items: [{ productId: product.id, cutType: 'whole', weightKg: 1 }],
        });
      expect(paidRes.status).toBe(201);
      const paidOrderId = paidRes.body.data?.id as string;
      const paidAmount = paidRes.body.data?.totalPrice as number;

      const paymentRes = await request(API)
        .post('/api/payments/initiate')
        .set(authHeader(customer.accessToken))
        .send({
          amount: paidAmount,
          currency: 'SAR',
          method: 'visa',
          type: 'butcher_order',
          referenceId: paidOrderId,
        });
      const paymentId = paymentRes.body.data?.paymentId as string;
      await request(API)
        .post(`/api/payments/${paymentId}/dev-complete`)
        .set(authHeader(customer.accessToken));

      await prisma.butcherOrder.update({
        where: { id: paidOrderId },
        data: { createdAt: new Date(Date.now() - 2 * 60 * 1000) },
      });

      await new Promise((r) => setTimeout(r, 5000));

      const paidOrder = await prisma.butcherOrder.findUnique({
        where: { id: paidOrderId },
      });
      expect(paidOrder?.paymentStatus).toBe('paid');
      expect(paidOrder?.status).toBe('pending');
    },
  );

  t('admin flow remains accessible after hardening', async () => {
    const login = await request(API)
      .post('/api/admin/auth/login')
      .send({ login: ADMIN_LOGIN, password: ADMIN_PASSWORD });
    expect(login.status).toBe(200);
    const token = login.body.data?.accessToken as string;
    expect(token).toBeTruthy();

    const users = await request(API)
      .get('/api/admin/users')
      .set(authHeader(token));
    expect(users.status).toBe(200);
  });
});
