import { readFileSync, readdirSync } from 'fs';
import path from 'path';
import { Test } from '@nestjs/testing';
import type { FeatureValueType } from '@prisma/client';
import { PaymentsService } from '../../payments/payments.service';
import { PaymentsRepository } from '../../payments/repositories/payments.repository';
import { LoggerService } from '../../common/services/logger.service';
import { AppNotificationsService } from '../../queue/services/app-notifications.service';
import { SubscriptionCacheService } from '../services/subscription-cache.service';
import { SubscriptionLifecycleService } from '../services/subscription-lifecycle.service';
import { SubscriptionEntitlementService } from '../services/subscription-entitlement.service';
import { RedisCacheService } from '../../redis/services/redis-cache.service';
import { PlansService } from '../../plans/plans.service';
import { PaidServicesService } from '../../settings/paid-services.service';
import { IntegrationCheckoutService } from '../../integrations/services/integration-checkout.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PlanPermissionService } from '../../plans/plan-permission.service';
import { buildPermissions } from '../../plans/plan.types';
import { resolveListingCreateDailyLimit } from '../../listings/listing-policy';
import { VerificationBadgeService } from './verification-badge.service';
import { VerificationStatusService } from './verification-status.service';
import {
  GoldDocumentGateService,
  evaluateGoldDocument,
  type GoldGateRequest,
} from './gold-document-gate.service';
import {
  badgeColorForTier,
  TIER_REQUIRES_DOCUMENT,
  VERIFICATION_PLAN_SLUGS,
  VERIFICATION_TIERS,
} from './verification-tiers';

const USER = 'u1';
const DAY = 24 * 60 * 60 * 1000;
const future = new Date(Date.now() + 10 * DAY);

const PRICES: Record<string, number> = {
  'blue-badge': 29,
  'blue-plus-badge': 59,
  'gold-badge': 99,
};

const goldDoc = {
  id: 'doc-cr',
  type: 'COMMERCIAL_REGISTER',
  fileKey: `support/${USER}/cr.pdf`,
  fileUrl: 'https://res.cloudinary.com/x/cr.pdf',
};
const idDoc = {
  id: 'doc-id',
  type: 'NATIONAL_ID',
  fileKey: `support/${USER}/id.jpg`,
  fileUrl: 'https://res.cloudinary.com/x/id.jpg',
};

function goldRequest(
  over: Partial<NonNullable<GoldGateRequest>> = {},
): GoldGateRequest {
  return {
    id: 'req-1',
    status: 'UNDER_REVIEW',
    requestedTier: 'gold',
    approvedTier: null,
    documents: [idDoc, goldDoc],
    ...over,
  };
}

describe('Gold document rule (pure)', () => {
  it('only Gold requires a document', () => {
    expect(TIER_REQUIRES_DOCUMENT).toEqual({
      blue: false,
      blue_plus: false,
      gold: true,
    });
  });

  it('accepts a submitted Gold request with a commercial register', () => {
    expect(evaluateGoldDocument(goldRequest(), USER)).toEqual({
      ok: true,
      requestId: 'req-1',
      documentId: 'doc-cr',
      verificationStatus: 'UNDER_REVIEW',
    });
    expect(
      evaluateGoldDocument(
        goldRequest({ status: 'VERIFIED', approvedTier: 'gold' }),
        USER,
      ).ok,
    ).toBe(true);
  });

  it('rejects a missing request, missing document or a non-Gold request', () => {
    expect(evaluateGoldDocument(null, USER)).toMatchObject({
      ok: false,
      code: 'gold_document_required',
    });
    expect(
      evaluateGoldDocument(goldRequest({ documents: [idDoc] }), USER),
    ).toMatchObject({ ok: false, code: 'gold_document_required' });
    expect(
      evaluateGoldDocument(goldRequest({ requestedTier: 'blue' }), USER),
    ).toMatchObject({ ok: false, code: 'gold_document_required' });
  });

  it('rejects a document uploaded under another user or without a file URL', () => {
    const foreign = { ...goldDoc, fileKey: 'support/someone-else/cr.pdf' };
    expect(
      evaluateGoldDocument(goldRequest({ documents: [foreign] }), USER).ok,
    ).toBe(false);
    const noUrl = { ...goldDoc, fileUrl: ' ' };
    expect(
      evaluateGoldDocument(goldRequest({ documents: [noUrl] }), USER).ok,
    ).toBe(false);
  });

  it('rejects drafts (not submitted) and rejected requests', () => {
    expect(
      evaluateGoldDocument(goldRequest({ status: 'DRAFT' }), USER),
    ).toMatchObject({ ok: false, code: 'gold_document_not_submitted' });
    expect(
      evaluateGoldDocument(goldRequest({ status: 'NEEDS_AMENDMENTS' }), USER),
    ).toMatchObject({ ok: false, code: 'gold_document_not_submitted' });
    expect(
      evaluateGoldDocument(goldRequest({ status: 'REJECTED' }), USER),
    ).toMatchObject({ ok: false, code: 'gold_verification_rejected' });
  });
});

describe('PaymentsService.initiate with the Gold document gate (server-side)', () => {
  let service: PaymentsService;
  let verificationRequest: GoldGateRequest;

  const repo = {
    findSubscriptionForPayment: jest.fn().mockResolvedValue({
      id: 'sub-1',
      userId: USER,
      planId: 'free',
      renewDate: new Date(0),
      autoRenew: false,
    }),
    findUserContact: jest.fn().mockResolvedValue({ displayName: 'User' }),
    createPendingPaymentOrReturnExisting: jest.fn().mockResolvedValue({
      payment: { id: 'pay-1', orderId: 'SFAT-U1-TEST' },
    }),
  };
  const prisma = {
    accountVerificationRequest: {
      findUnique: jest.fn(async () => verificationRequest),
    },
  };
  const plans = {
    getUpgradablePlans: jest.fn().mockReturnValue(Object.keys(PRICES)),
    getPlanPrice: jest.fn((slug: string) => PRICES[slug] ?? 0),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    verificationRequest = null;
    const moduleRef = await Test.createTestingModule({
      providers: [
        PaymentsService,
        GoldDocumentGateService,
        { provide: PrismaService, useValue: prisma },
        { provide: PaymentsRepository, useValue: repo },
        {
          provide: LoggerService,
          useValue: {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
          },
        },
        {
          provide: AppNotificationsService,
          useValue: { notifyUser: jest.fn() },
        },
        {
          provide: SubscriptionCacheService,
          useValue: { invalidate: jest.fn() },
        },
        {
          provide: SubscriptionLifecycleService,
          useValue: { shouldBlockPayment: jest.fn().mockReturnValue(false) },
        },
        {
          provide: SubscriptionEntitlementService,
          useValue: { getAudienceForUser: jest.fn().mockResolvedValue('USER') },
        },
        { provide: PlansService, useValue: plans },
        {
          provide: RedisCacheService,
          useValue: { del: jest.fn(), delPattern: jest.fn() },
        },
        { provide: PaidServicesService, useValue: {} },
        { provide: IntegrationCheckoutService, useValue: {} },
      ],
    }).compile();
    service = moduleRef.get(PaymentsService);
    jest.spyOn(service as any, 'createCheckoutForPayment').mockResolvedValue({
      paymentId: 'pay-1',
      orderId: 'SFAT-U1-TEST',
      checkoutUrl: 'https://checkout.example/pay-1',
      status: 'pending',
      devMode: true,
    } as never);
  });

  const initiate = (planId: string, amount = PRICES[planId]) =>
    service.initiate(
      { userId: USER, role: 'USER' } as never,
      {
        amount,
        method: 'visa',
        type: 'subscription',
        referenceId: 'sub-1',
        planId,
        billingCycle: 'monthly',
      } as never,
    );

  const storedMetadata = () =>
    repo.createPendingPaymentOrReturnExisting.mock.calls[0][0]
      .metadata as Record<string, unknown>;

  it('Blue without a document creates the payment', async () => {
    await expect(initiate('blue-badge')).resolves.toMatchObject({
      paymentId: 'pay-1',
    });
    expect(storedMetadata()).toMatchObject({ targetPlanId: 'blue-badge' });
    expect(storedMetadata().goldVerification).toBeUndefined();
  });

  it('Blue+ without a document creates the payment', async () => {
    await expect(initiate('blue-plus-badge')).resolves.toMatchObject({
      paymentId: 'pay-1',
    });
    expect(storedMetadata()).toMatchObject({ targetPlanId: 'blue-plus-badge' });
  });

  it('Gold with a valid document creates the payment and links the document', async () => {
    verificationRequest = goldRequest();
    await expect(initiate('gold-badge')).resolves.toMatchObject({
      paymentId: 'pay-1',
    });
    expect(storedMetadata()).toMatchObject({
      targetPlanId: 'gold-badge',
      goldVerification: {
        requestId: 'req-1',
        documentId: 'doc-cr',
        verificationStatus: 'UNDER_REVIEW',
      },
    });
  });

  it('Gold without a document is rejected server-side (no payment row)', async () => {
    await expect(initiate('gold-badge')).rejects.toMatchObject({
      status: 403,
      error: 'gold_document_required',
    });
    verificationRequest = goldRequest({ documents: [idDoc] });
    await expect(initiate('gold-badge')).rejects.toMatchObject({
      status: 403,
      error: 'gold_document_required',
    });
    expect(repo.createPendingPaymentOrReturnExisting).not.toHaveBeenCalled();
  });

  it('rejects direct API bypass attempts (slug variants, unsubmitted draft, foreign file)', async () => {
    // Slug spelled differently still resolves to Gold.
    await expect(initiate('Gold_Badge', 99)).rejects.toMatchObject({
      error: 'gold_document_required',
    });
    // Document attached but never submitted for review.
    verificationRequest = goldRequest({ status: 'DRAFT' });
    await expect(initiate('gold-badge')).rejects.toMatchObject({
      error: 'gold_document_not_submitted',
    });
    // Document row pointing at another user's upload.
    verificationRequest = goldRequest({
      documents: [{ ...goldDoc, fileKey: 'support/other/cr.pdf' }],
    });
    await expect(initiate('gold-badge')).rejects.toMatchObject({
      error: 'gold_document_required',
    });
    // Rejected verification.
    verificationRequest = goldRequest({ status: 'REJECTED' });
    await expect(initiate('gold-badge')).rejects.toMatchObject({
      error: 'gold_verification_rejected',
    });
    expect(repo.createPendingPaymentOrReturnExisting).not.toHaveBeenCalled();
  });

  it('prices are enforced from the plan data (29 / 59 / 99)', async () => {
    await expect(initiate('blue-badge', 19)).rejects.toMatchObject({
      error: 'amount_mismatch',
    });
    await expect(initiate('blue-plus-badge', 29)).rejects.toMatchObject({
      error: 'amount_mismatch',
    });
    verificationRequest = goldRequest();
    await expect(initiate('gold-badge', 59)).rejects.toMatchObject({
      error: 'amount_mismatch',
    });
  });
});

describe('badges per plan', () => {
  const plainUser = {
    verified: false,
    verifiedTier: null,
    subscriptionBadge: false,
  };
  const sub = (planId: string) => ({
    planId,
    renewDate: future,
    autoRenew: true,
  });

  it('Blue and Blue+ get the blue badge; Gold gets gold (with the approved document)', () => {
    const blue = VerificationBadgeService.decide({
      user: plainUser,
      request: null,
      subscription: sub('blue-badge'),
    });
    const bluePlus = VerificationBadgeService.decide({
      user: plainUser,
      request: null,
      subscription: sub('blue-plus-badge'),
    });
    const gold = VerificationBadgeService.decide({
      user: plainUser,
      request: { status: 'VERIFIED', approvedTier: 'gold' },
      subscription: sub('gold-badge'),
    });
    expect(blue).toMatchObject({ verified: true, verifiedTier: 'blue' });
    expect(bluePlus).toMatchObject({
      verified: true,
      verifiedTier: 'blue_plus',
    });
    expect(gold).toMatchObject({ verified: true, verifiedTier: 'gold' });
    expect(badgeColorForTier(blue.verifiedTier)).toBe('blue');
    expect(badgeColorForTier(bluePlus.verifiedTier)).toBe('blue');
    expect(badgeColorForTier(gold.verifiedTier)).toBe('gold');
  });

  it('Blue+ never gets gold, and a paid Gold is not gold until the document is approved', () => {
    const bluePlusWithGoldApproval = VerificationBadgeService.decide({
      user: plainUser,
      request: { status: 'VERIFIED', approvedTier: 'gold' },
      subscription: sub('blue-plus-badge'),
    });
    expect(badgeColorForTier(bluePlusWithGoldApproval.verifiedTier)).toBe(
      'blue',
    );
    const goldUnderReview = VerificationBadgeService.decide({
      user: plainUser,
      request: { status: 'UNDER_REVIEW', approvedTier: null },
      subscription: sub('gold-badge'),
    });
    expect(badgeColorForTier(goldUnderReview.verifiedTier)).toBe('blue');
  });
});

describe('plan limits, visibility and prices from DB', () => {
  const perms = new PlanPermissionService({} as never);
  const f = (key: string, value: string, valueType: FeatureValueType) => ({
    key,
    value,
    valueType,
  });
  const features: Record<string, ReturnType<typeof f>[]> = {
    'blue-badge': [
      f('extraDailyListings', '3', 'NUMBER'),
      f('prioritySearch', 'true', 'BOOLEAN'),
    ],
    'blue-plus-badge': [
      f('extraDailyListings', '6', 'NUMBER'),
      f('prioritySearch', 'true', 'BOOLEAN'),
    ],
    'gold-badge': [
      f('extraDailyListings', '10', 'NUMBER'),
      f('prioritySearch', 'true', 'BOOLEAN'),
      f('priorityHome', 'true', 'BOOLEAN'),
    ],
  };

  it('daily limits: Blue +3, Blue+ +6, Gold +10 (also as defaults)', () => {
    const expected = {
      'blue-badge': 3,
      'blue-plus-badge': 6,
      'gold-badge': 10,
    };
    for (const [slug, n] of Object.entries(expected)) {
      expect(
        perms.extraDailyListings(buildPermissions(features[slug]), slug),
      ).toBe(n);
      expect(perms.extraDailyListings({}, slug)).toBe(n);
    }
  });

  it('listing create limit adds +3 / +6 / +10 on top of the base', () => {
    const base = resolveListingCreateDailyLimit('USER', 0).limit;
    expect(resolveListingCreateDailyLimit('USER', 0, 3).limit).toBe(base + 3);
    expect(resolveListingCreateDailyLimit('USER', 0, 6).limit).toBe(base + 6);
    expect(resolveListingCreateDailyLimit('USER', 0, 10).limit).toBe(base + 10);
  });

  it('visibility priority: normal < Blue < Blue+ < Gold', () => {
    const free = perms.priorityBoost({}, 'free');
    const blue = perms.priorityBoost(
      buildPermissions(features['blue-badge']),
      'blue-badge',
    );
    const bluePlus = perms.priorityBoost(
      buildPermissions(features['blue-plus-badge']),
      'blue-plus-badge',
    );
    const gold = perms.priorityBoost(
      buildPermissions(features['gold-badge']),
      'gold-badge',
    );
    expect([free, blue, bluePlus, gold]).toEqual([0, 1, 2, 3]);
  });

  it('getPlans returns the 3 plans in order with DB prices and badge colours', async () => {
    const rows = VERIFICATION_TIERS.map((tier) => {
      const slug = VERIFICATION_PLAN_SLUGS[tier];
      return {
        slug,
        name: slug,
        monthlyPrice: PRICES[slug],
        currency: 'SAR',
        isActive: true,
        features: features[slug],
      };
    });
    const svc = new VerificationStatusService(
      { plan: { findMany: jest.fn().mockResolvedValue(rows) } } as never,
      {} as never,
      perms,
      {} as never,
      {} as never,
    );
    const plans = await svc.getPlans();
    expect(
      plans.map((p) => [
        p.tier,
        p.monthlyPrice,
        p.extraDailyListings,
        p.badgeColor,
        p.documentRequired,
      ]),
    ).toEqual([
      ['blue', 29, 3, 'blue', false],
      ['blue_plus', 59, 6, 'blue', false],
      ['gold', 99, 10, 'gold', true],
    ]);
    expect(plans.map((p) => p.visibilityBoost)).toEqual([1, 2, 3]);
  });

  it('the new migration sets 29 / 59 / 99 SAR and +3 / +6 / +10 without editing 20260930130000', () => {
    const root = path.join(__dirname, '..', '..', '..');
    const migrations = readdirSync(path.join(root, 'prisma/migrations'));
    const dir = migrations.find((d) =>
      d.endsWith('_verification_blue_plus_gold'),
    );
    expect(dir).toBeDefined();
    expect(dir! > '20260930130000_verification_plan_prices').toBe(true);
    const sql = readFileSync(
      path.join(root, 'prisma/migrations', dir!, 'migration.sql'),
      'utf8',
    );
    expect(sql).not.toMatch(/\b(DROP|DELETE|TRUNCATE|ALTER)\b/);
    expect(sql).toContain("'blue-plus-badge', 'Blue+");
    expect(sql).toMatch(/'USER', 59, 0, 'SAR', 0, true, 15/);
    expect(sql).toContain(
      "('blue-plus-badge', 'extraDailyListings', '6', 'NUMBER')",
    );
    expect(sql).toContain('IN (0, 59) THEN 99');
    expect(sql).toContain('SET "value" = \'10\'');
    const prior = readFileSync(
      path.join(
        root,
        'prisma/migrations/20260930130000_verification_plan_prices/migration.sql',
      ),
      'utf8',
    );
    expect(prior).toContain('ELSE 29 END');
    expect(prior).toContain('ELSE 59 END');
  });
});
