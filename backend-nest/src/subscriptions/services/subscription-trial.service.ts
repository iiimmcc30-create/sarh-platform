import { Injectable, Optional } from '@nestjs/common';
import { throwApi } from '../../common/exceptions/api.exception';
import { LoggerService } from '../../common/services/logger.service';
import {
  isPaidPlan,
  isTrialRow,
  TRIAL_DAYS,
} from '../../lib/subscription-lifecycle';
import { SubscriptionLifecycleRepository } from '../repositories/subscription-lifecycle.repository';
import { SubscriptionsRepository } from '../repositories/subscriptions.repository';
import { SubscriptionCacheService } from './subscription-cache.service';
import { SubscriptionLifecycleService } from './subscription-lifecycle.service';
import { VerificationBadgeService } from '../verification/verification-badge.service';
import { VERIFICATION_PLAN_SLUGS } from '../verification/verification-tiers';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** The free trial is always Blue+ (blue badge, no document needed). */
export const TRIAL_TIER = 'blue_plus' as const;
export const TRIAL_PLAN_SLUG = VERIFICATION_PLAN_SLUGS[TRIAL_TIER];

export type TrialInfo = {
  /** Plan tier the trial unlocks. */
  tier: typeof TRIAL_TIER;
  planSlug: string;
  durationDays: number;
  /** Can start the trial now (never paid, never trialled, on the free plan). */
  eligible: boolean;
  /** The trial is running right now. */
  active: boolean;
  /** The account already used its one trial (running or finished). */
  used: boolean;
  startedAt: Date | null;
  endsAt: Date | null;
  /** Whole days left (rounded up) while active, else 0. */
  daysLeft: number;
};

type TrialRow = {
  planId: string;
  status?: string | null;
  renewDate: Date;
  trialStartedAt?: Date | null;
  trialEndsAt?: Date | null;
};

/**
 * Pure trial view (exported for tests). `paidBefore` = the account has a
 * successful subscription payment, or was downgraded from a paid plan.
 */
export function buildTrialInfo(
  row: TrialRow | null,
  paidBefore: boolean,
  now: Date = new Date(),
): TrialInfo {
  const used = !!row?.trialStartedAt;
  const active = !!row && isTrialRow(row) && row.renewDate > now;
  const endsAt = row?.trialEndsAt ?? null;
  const eligible =
    !used &&
    !paidBefore &&
    (!row || (!isPaidPlan(row.planId) && row.status !== 'downgraded'));
  const daysLeft =
    active && endsAt
      ? Math.max(0, Math.ceil((endsAt.getTime() - now.getTime()) / MS_PER_DAY))
      : 0;
  return {
    tier: TRIAL_TIER,
    planSlug: TRIAL_PLAN_SLUG,
    durationDays: TRIAL_DAYS,
    eligible,
    active,
    used,
    startedAt: row?.trialStartedAt ?? null,
    endsAt,
    daysLeft,
  };
}

/**
 * One free week of Blue+ per account, started by the user (never silently).
 * No card, no payment, no auto-renew: the period simply ends and the account
 * goes back to the free plan through the normal expiry path.
 */
@Injectable()
export class SubscriptionTrialService {
  constructor(
    private readonly repo: SubscriptionLifecycleRepository,
    private readonly subscriptions: SubscriptionsRepository,
    private readonly lifecycle: SubscriptionLifecycleService,
    private readonly cache: SubscriptionCacheService,
    private readonly logger: LoggerService,
    @Optional() private readonly verificationBadge?: VerificationBadgeService,
  ) {}

  async getInfo(userId: string, now: Date = new Date()): Promise<TrialInfo> {
    const [row, paidCount] = await Promise.all([
      this.repo.findByUserId(userId),
      this.repo.countPaidSubscriptionPayments(userId),
    ]);
    return buildTrialInfo(row, paidCount > 0, now);
  }

  /**
   * A trial that already ended is moved back to the free plan right away
   * (instead of waiting for the daily expiry job), which also sends the
   * "trial ended" notification. Paid subscriptions are left untouched.
   */
  async expireIfEnded(userId: string, now: Date = new Date()): Promise<void> {
    const row = await this.repo.findByUserId(userId);
    if (row && isTrialRow(row) && row.renewDate <= now) {
      await this.lifecycle.expireIfNeeded(row);
    }
  }

  async activate(userId: string, now: Date = new Date()) {
    // Every account gets its free-plan row lazily; make sure it exists.
    await this.subscriptions.upsertFree(userId);

    const endsAt = new Date(now.getTime() + TRIAL_DAYS * MS_PER_DAY);
    const result = await this.repo.activateTrialTx({
      userId,
      planSlug: TRIAL_PLAN_SLUG,
      audience: 'USER',
      startedAt: now,
      endsAt,
    });

    if (!result.ok) {
      if (result.reason === 'plan_unavailable') {
        throwApi(409, 'trial_unavailable', 'التجربة المجانية غير متاحة حالياً');
      }
      throwApi(
        409,
        'trial_not_eligible',
        'التجربة المجانية متاحة مرة واحدة فقط للحسابات التي لم يسبق لها الاشتراك',
      );
    }

    await this.cache.invalidate(userId);
    // Same badge path a paid Blue+ period uses (blue badge while active).
    await this.verificationBadge?.syncQuietly(userId);
    this.logger.info({ userId, endsAt }, 'Free trial started');

    return {
      trial: await this.getInfo(userId, now),
      subscription: await this.lifecycle.getForUser(userId, {
        applyExpiration: false,
      }),
    };
  }
}
