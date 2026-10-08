/**
 * Free trial against a REAL Postgres (skipped unless TRIAL_TEST_DATABASE_URL
 * points at a scratch database with all migrations applied). Proves the
 * one-trial-per-account rule holds under concurrent requests, which the
 * in-memory spec cannot.
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { SubscriptionLifecycleRepository } from '../repositories/subscription-lifecycle.repository';
import { TRIAL_PLAN_SLUG } from './subscription-trial.service';

const url = process.env.TRIAL_TEST_DATABASE_URL;
const maybe = url ? describe : describe.skip;
const DAY = 24 * 60 * 60 * 1000;

maybe('free trial on Postgres', () => {
  let prisma: PrismaClient;
  let repo: SubscriptionLifecycleRepository;

  beforeAll(() => {
    prisma = new PrismaClient({ datasources: { db: { url } } });
    repo = new SubscriptionLifecycleRepository(
      prisma as never,
      {} as never,
      {} as never,
    );
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function newUser(opts: { paid?: boolean; downgraded?: boolean } = {}) {
    const id = randomUUID();
    await prisma.user.create({
      data: {
        id,
        username: `trial_${id.slice(0, 8)}`,
        passwordHash: 'x',
        displayName: 'Trial',
        arabicName: 'تجربة',
      },
    });
    const sub = await prisma.subscription.create({
      data: {
        userId: id,
        planId: 'free',
        renewDate: new Date(Date.now() + 30 * DAY),
        ...(opts.downgraded ? { status: 'downgraded' } : {}),
      },
    });
    if (opts.paid) {
      await prisma.payment.create({
        data: {
          userId: id,
          subscriptionId: sub.id,
          referenceId: sub.id,
          referenceType: 'subscription',
          orderId: `test-${id}`,
          amount: 59,
          method: 'mada',
          status: 'paid',
        },
      });
    }
    return id;
  }

  const activate = (userId: string) => {
    const now = new Date();
    return repo.activateTrialTx({
      userId,
      planSlug: TRIAL_PLAN_SLUG,
      audience: 'USER',
      startedAt: now,
      endsAt: new Date(now.getTime() + 7 * DAY),
    });
  };

  it('20 concurrent activations for one account: exactly one succeeds', async () => {
    const userId = await newUser();
    const results = await Promise.all(
      Array.from({ length: 20 }, () => activate(userId)),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const row = await prisma.subscription.findUnique({ where: { userId } });
    expect(row).toMatchObject({
      planId: 'blue-plus-badge',
      status: 'trial',
      autoRenew: false,
    });
    expect(row!.trialStartedAt).not.toBeNull();
    expect(row!.trialEndsAt!.getTime()).toBe(row!.renewDate.getTime());
    expect(row!.planDbId).not.toBeNull();
  });

  it('never twice: after the trial ends (downgraded) it cannot start again', async () => {
    const userId = await newUser();
    expect((await activate(userId)).ok).toBe(true);
    await repo.downgradeToFreeTx(userId, TRIAL_PLAN_SLUG, 'USER');
    expect(await activate(userId)).toEqual({
      ok: false,
      reason: 'not_eligible',
    });
  });

  it('accounts that paid before or were downgraded from a paid plan are refused', async () => {
    expect(await activate(await newUser({ paid: true }))).toEqual({
      ok: false,
      reason: 'not_eligible',
    });
    expect(await activate(await newUser({ downgraded: true }))).toEqual({
      ok: false,
      reason: 'not_eligible',
    });
  });

  it('the paid checkout gate reads the trial status (payments repository select)', async () => {
    const userId = await newUser();
    await activate(userId);
    const sub = await prisma.subscription.findUnique({ where: { userId } });
    // Same select as PaymentsRepository.findSubscriptionForPayment.
    const forPayment = await prisma.subscription.findFirst({
      where: { id: sub!.id, userId },
      select: {
        id: true,
        planId: true,
        planAudience: true,
        renewDate: true,
        autoRenew: true,
        status: true,
      },
    });
    expect(forPayment?.status).toBe('trial');
  });

  it('the trial reminder query finds trials ending within 24h only', async () => {
    const userId = await newUser();
    await activate(userId);
    const now = new Date();
    const soon = await repo.findTrialsEndingWithin(
      24,
      new Date(now.getTime() + 6.5 * DAY),
    );
    expect(soon.some((r) => r.userId === userId)).toBe(true);
    const early = await repo.findTrialsEndingWithin(24, now);
    expect(early.some((r) => r.userId === userId)).toBe(false);
  });
});
