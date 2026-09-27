import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import {
  API,
  apiReachable,
  authHeader,
  registerUser,
  sampleListing,
  uniqueId,
} from './helpers';

const prisma = new PrismaClient();

describe('Hardening runtime — listings, payments', () => {
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
});
