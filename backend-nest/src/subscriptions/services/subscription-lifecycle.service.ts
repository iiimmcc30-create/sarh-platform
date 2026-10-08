import { Injectable, Optional } from '@nestjs/common';
import type { PlanAudience } from '@prisma/client';
import { PlanResolverService } from '../../plans/plan-resolver.service';
import {
  daysUntilRenewDate,
  getEffectivePlanSlug,
  getSubscriptionStatus,
  hasPaidAccess,
  isPaidPlan,
  isTrialRow,
  RENEWAL_DAY_REMINDER,
  RENEWAL_REMINDER_DAYS,
  shouldBlockSubscriptionPayment,
  SUBSCRIPTION_GRACE_DAYS,
  type SubscriptionStatus,
} from '../../lib/subscription-lifecycle';
import { LoggerService } from '../../common/services/logger.service';
import { AppNotificationsService } from '../../queue/services/app-notifications.service';
import { EmailQueueService } from '../../queue/services/email-queue.service';
import { SubscriptionLifecycleRepository } from '../repositories/subscription-lifecycle.repository';
import { SubscriptionCacheService } from './subscription-cache.service';
import { PlanPermissionService } from '../../plans/plan-permission.service';
import { VerificationBadgeService } from '../verification/verification-badge.service';
import { tierForPlanSlug } from '../verification/verification-tiers';

function planDisplayNameAr(planId: string): string {
  const tier = tierForPlanSlug(planId);
  if (tier === 'blue') return 'اشتراك الشارة الزرقاء';
  if (tier === 'blue_plus') return 'اشتراك Blue+ (الشارة الزرقاء)';
  if (tier === 'gold') return 'اشتراك الشارة الذهبية';
  return `باقة ${planId}`;
}

export type SubscriptionView = {
  id: string;
  planId: string;
  planAudience: PlanAudience;
  billingCycle: string;
  renewDate: Date;
  listingsUsed: number;
  liveMinutesUsed: number;
  featuredAdsUsed: number;
  pinnedAdsUsed: number;
  dailyAdsUsed: number;
  autoRenew: boolean;
  createdAt: Date;
  updatedAt: Date;
  status: SubscriptionStatus;
  effectivePlanId: string;
  effectivePlanSlug: string;
  previousPlanId?: string;
  /** True while this period is the free Blue+ trial (no payment). */
  isTrial: boolean;
  trialEndsAt: Date | null;
  usageCounters?: {
    listingsUsed: number;
    liveMinutesUsed: number;
    featuredAdsUsed: number;
    pinnedAdsUsed: number;
    dailyAdsUsed: number;
  };
  permissions?: Record<string, unknown>;
  plan?: unknown;
};

@Injectable()
export class SubscriptionLifecycleService {
  constructor(
    private readonly repo: SubscriptionLifecycleRepository,
    private readonly cache: SubscriptionCacheService,
    private readonly notifications: AppNotificationsService,
    private readonly emailQueue: EmailQueueService,
    private readonly logger: LoggerService,
    private readonly permissions: PlanPermissionService,
    private readonly planResolver: PlanResolverService,
    @Optional() private readonly verificationBadge?: VerificationBadgeService,
  ) {}

  enrichSubscription(
    row: NonNullable<
      Awaited<ReturnType<SubscriptionLifecycleRepository['findByUserId']>>
    >,
    now: Date = new Date(),
    previousPlanId?: string,
  ): SubscriptionView {
    const status = getSubscriptionStatus(row, now);
    const effectivePlanSlug = getEffectivePlanSlug(row, now);
    return {
      id: row.id,
      planId: row.planId,
      planAudience: row.planAudience,
      billingCycle: row.billingCycle,
      renewDate: row.renewDate,
      listingsUsed: row.listingsUsed,
      liveMinutesUsed: row.liveMinutesUsed,
      featuredAdsUsed: row.featuredAdsUsed,
      pinnedAdsUsed: row.pinnedAdsUsed,
      dailyAdsUsed: row.dailyAdsUsed,
      autoRenew: row.autoRenew,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      status,
      effectivePlanId: effectivePlanSlug,
      effectivePlanSlug,
      isTrial: isTrialRow(row),
      trialEndsAt: row.trialEndsAt ?? null,
      ...(previousPlanId ? { previousPlanId } : {}),
    };
  }

  async activateFromPayment(params: {
    subscriptionId: string;
    userId: string;
    targetPlanId: string;
    planAudience: PlanAudience;
    billingCycle: string;
    renewDate: Date;
    amount: number;
    currency: string;
    isRenewal: boolean;
  }): Promise<void> {
    await this.repo.activatePaidPlanTx({
      subscriptionId: params.subscriptionId,
      userId: params.userId,
      targetPlanId: params.targetPlanId,
      planAudience: params.planAudience,
      billingCycle: params.billingCycle,
      newRenewDate: params.renewDate,
      resetCounters: true,
    });
    await this.cache.invalidate(params.userId);
    await this.verificationBadge?.syncQuietly(params.userId);
    await this.notifyRenewalSuccess(
      params.userId,
      params.targetPlanId,
      params.amount,
      params.currency,
    );
  }

  async expireIfNeededForUser(userId: string): Promise<void> {
    const row = await this.repo.findByUserId(userId);
    if (row) await this.expireIfNeeded(row);
  }

  async getForUser(userId: string, options?: { applyExpiration?: boolean }) {
    let row = await this.repo.findByUserId(userId);
    if (!row) return null;

    if (options?.applyExpiration !== false) {
      const expired = await this.expireIfNeeded(row);
      if (expired) {
        row = await this.repo.findByUserId(userId);
        if (!row) return null;
      }
    }

    return this.buildEnrichedView(row);
  }

  private async buildEnrichedView(
    row: NonNullable<
      Awaited<ReturnType<SubscriptionLifecycleRepository['findByUserId']>>
    >,
  ) {
    const status = getSubscriptionStatus(row);
    const effectivePlanSlug = getEffectivePlanSlug(row);
    const ctx = await this.permissions.resolveEffective(
      effectivePlanSlug,
      row.planAudience,
      hasPaidAccess(row),
    );

    return {
      id: row.id,
      planId: row.planId,
      planAudience: row.planAudience,
      billingCycle: row.billingCycle,
      renewDate: row.renewDate,
      status,
      effectivePlanId: effectivePlanSlug,
      effectivePlanSlug,
      isTrial: isTrialRow(row),
      trialEndsAt: row.trialEndsAt ?? null,
      autoRenew: row.autoRenew,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      listingsUsed: row.listingsUsed,
      liveMinutesUsed: row.liveMinutesUsed,
      featuredAdsUsed: row.featuredAdsUsed,
      pinnedAdsUsed: row.pinnedAdsUsed,
      dailyAdsUsed: row.dailyAdsUsed,
      usageCounters: {
        listingsUsed: row.listingsUsed,
        liveMinutesUsed: row.liveMinutesUsed,
        featuredAdsUsed: row.featuredAdsUsed,
        pinnedAdsUsed: row.pinnedAdsUsed,
        dailyAdsUsed: row.dailyAdsUsed,
      },
      permissions: ctx.permissions,
      plan: this.planResolver.toApiResponse(ctx.plan),
    };
  }

  async expireIfNeeded(
    row: NonNullable<
      Awaited<ReturnType<SubscriptionLifecycleRepository['findByUserId']>>
    >,
  ): Promise<boolean> {
    if (!isPaidPlan(row.planId)) return false;

    const status = getSubscriptionStatus(row);
    if (status !== 'expired') return false;

    await this.downgradeUser(
      row.userId,
      row.planId,
      row.planAudience,
      'expiration',
      { trial: isTrialRow(row) },
    );
    return true;
  }

  async downgradeUser(
    userId: string,
    previousPlanId: string,
    audience: PlanAudience,
    reason: 'expiration' | 'refund' | 'manual',
    options?: { trial?: boolean },
  ): Promise<void> {
    if (!isPaidPlan(previousPlanId)) return;

    await this.repo.downgradeToFreeTx(userId, previousPlanId, audience);
    await this.cache.invalidate(userId);
    // Verification badge ends with its subscription (legacy badges are kept).
    await this.verificationBadge?.syncQuietly(userId);

    if (options?.trial && reason === 'expiration') {
      await this.notifications.notifyUser({
        userId,
        type: 'subscription_renew',
        titleAr: 'انتهت تجربتك المجانية',
        bodyAr:
          'انتهت تجربة Blue+ المجانية. اشترك الآن لتستمر شارتك الزرقاء وأولوية الظهور والإعلانات الإضافية.',
        data: {
          reason: 'trial_ended',
          previousPlanId,
          screen: 'verification',
          tier: 'blue_plus',
        },
      });
      this.logger.info({ userId, previousPlanId }, 'Free trial ended');
      return;
    }

    const titleAr =
      reason === 'refund' ? 'تم استرداد مبلغ الاشتراك' : 'انتهى اشتراكك';
    const bodyAr =
      reason === 'refund'
        ? 'تم إلغاء اشتراكك بعد استرداد الدفع. يمكنك الاشتراك مجدداً في أي وقت.'
        : 'انتهت صلاحية اشتراكك وتمت العودة للباقة المجانية. جدّد اشتراكك للاستمرار بالمزايا.';

    await this.notifications.notifyUser({
      userId,
      type: reason === 'refund' ? 'system' : 'subscription_renew',
      titleAr,
      bodyAr,
      data: { reason, previousPlanId },
    });

    this.logger.info(
      { userId, previousPlanId, reason },
      'Subscription downgraded',
    );
  }

  shouldBlockPayment(
    sub: {
      planId: string;
      renewDate: Date;
      autoRenew: boolean;
      status?: string | null;
    },
    targetPlanId: string,
    audience: PlanAudience,
  ): boolean {
    return shouldBlockSubscriptionPayment(sub, targetPlanId, (slug) =>
      this.planResolver.planTier(slug, audience),
    );
  }

  async cancelAutoRenew(userId: string) {
    const row = await this.repo.findByUserId(userId);
    if (!row) return null;
    if (!isPaidPlan(row.planId)) {
      return this.enrichSubscription(row);
    }
    // A free trial never renews: nothing to cancel.
    if (isTrialRow(row)) {
      return this.enrichSubscription(row);
    }
    if (!hasPaidAccess(row)) {
      await this.expireIfNeeded(row);
      const updated = await this.repo.findByUserId(userId);
      return updated ? this.enrichSubscription(updated) : null;
    }

    const updated = await this.repo.setAutoRenew(userId, false);
    await this.cache.invalidate(userId);

    await this.notifications.notifyUser({
      userId,
      type: 'subscription_renew',
      titleAr: 'تم إلغاء تجديد الاشتراك',
      bodyAr: `ستبقى مزاياك فعّالة حتى ${updated.renewDate.toLocaleDateString('ar-SA')}، ولن نرسل تذكيرات تجديد.`,
      data: { renewDate: updated.renewDate.toISOString() },
    });

    return this.enrichSubscription(updated);
  }

  async sendRenewalReminder(
    row: NonNullable<
      Awaited<ReturnType<SubscriptionLifecycleRepository['findByUserId']>>
    >,
    daysLeft: number,
  ): Promise<void> {
    const kind = `d${daysLeft}`;
    const ttl = 8 * 24 * 60 * 60;
    const shouldSend = await this.cache.markReminderSent(row.userId, kind, ttl);
    if (!shouldSend) return;

    const planLabel = planDisplayNameAr(row.planId);
    const titleAr =
      daysLeft <= 0
        ? 'اليوم موعد تجديد اشتراكك'
        : `تذكير: اشتراكك ينتهي خلال ${daysLeft} ${daysLeft === 1 ? 'يوم' : 'أيام'}`;
    // Renewal is manual (no automatic card charge): always ask for a new payment.
    const bodyAr =
      daysLeft <= 0
        ? `انتهت فترة ${planLabel}. جدّد بدفعة جديدة خلال ${SUBSCRIPTION_GRACE_DAYS} أيام للحفاظ على المزايا والشارة.`
        : `${planLabel} تنتهي في ${new Date(row.renewDate).toLocaleDateString('ar-SA')}. التجديد يدوي: جدّد بدفعة جديدة لتجنب انقطاع المزايا.`;

    await this.notifications.notifyUser({
      userId: row.userId,
      type: 'subscription_renew',
      titleAr,
      bodyAr,
      data: {
        planId: row.planId,
        renewDate: row.renewDate.toISOString(),
        daysLeft: String(daysLeft),
      },
    });

    const user = await this.repo.findUserEmail(row.userId);
    if (user?.email) {
      await this.emailQueue.addEmail({
        to: user.email,
        subject: titleAr,
        template: 'subscription_renew',
        variables: {
          plan: row.planId,
          amount: '',
          daysLeft: String(daysLeft),
          body: bodyAr,
        },
      });
    }
  }

  /**
   * Manual-renewal reminders at exactly 7, 3 and 1 day(s) before renewDate
   * (the day-0 renewal-day reminder is sent by processExpirationBatch when the
   * grace period starts). Each milestone is sent once per period (cache key
   * dedupe); the cron runs every few hours so every 24h window is covered.
   */
  async processReminderBatch(now: Date = new Date()): Promise<number> {
    let sent = 0;
    const horizon = Math.max(...RENEWAL_REMINDER_DAYS);
    const milestones = new Set<number>(RENEWAL_REMINDER_DAYS);
    const rows = await this.repo.findPaidSubscriptionsRenewingWithin(
      horizon,
      now,
    );
    for (const row of rows) {
      const left = daysUntilRenewDate(row.renewDate, now);
      if (milestones.has(left)) {
        await this.sendRenewalReminder(row, left);
        sent++;
      }
    }
    try {
      sent += await this.processTrialReminders(now);
    } catch (err) {
      // Never let the trial reminder break the paid renewal reminders.
      this.logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'Trial reminder batch failed',
      );
    }
    return sent;
  }

  /**
   * Free trial: one reminder in the trial's last 24 hours ("one day left").
   * Runs inside the existing daily `reminders` job (no queue change); the
   * job runs once a day, so exactly one run falls in that 24h window. Each
   * trial is reminded once (cache key dedupe).
   */
  async processTrialReminders(now: Date = new Date()): Promise<number> {
    let sent = 0;
    const rows = await this.repo.findTrialsEndingWithin(24, now);
    for (const row of rows) {
      if (!isTrialRow(row)) continue;
      const shouldSend = await this.cache.markReminderSent(
        row.userId,
        'trial_d1',
        8 * 24 * 60 * 60,
      );
      if (!shouldSend) continue;
      await this.notifications.notifyUser({
        userId: row.userId,
        type: 'subscription_renew',
        titleAr: 'باقي يوم على نهاية تجربتك المجانية',
        bodyAr:
          'تنتهي تجربة Blue+ المجانية خلال يوم. اشترك الآن لتحتفظ بالشارة الزرقاء والمزايا بدون انقطاع.',
        data: {
          reason: 'trial_ending',
          planId: row.planId,
          renewDate: row.renewDate.toISOString(),
          daysLeft: '1',
          screen: 'verification',
          tier: 'blue_plus',
        },
      });
      sent++;
    }
    return sent;
  }

  async processExpirationBatch(now: Date = new Date()): Promise<number> {
    const rows = await this.repo.findExpirablePaidSubscriptions(now);
    let count = 0;
    for (const row of rows) {
      const status = getSubscriptionStatus(row, now);
      if (status === 'expired') {
        await this.downgradeUser(
          row.userId,
          row.planId,
          row.planAudience,
          'expiration',
          { trial: isTrialRow(row) },
        );
        count++;
        continue;
      }
      if (status === 'grace_period') {
        const left = daysUntilRenewDate(row.renewDate, now);
        if (left <= 0) {
          // Renewal-day reminder (once per period): pay again during grace.
          await this.sendRenewalReminder(row, RENEWAL_DAY_REMINDER);
        }
      }
    }
    return count;
  }

  async notifyRenewalSuccess(
    userId: string,
    planId: string,
    amount: number,
    currency: string,
  ): Promise<void> {
    // Called by Payment Core after a successful subscription payment:
    // grant/refresh the verification badge when the request is approved.
    await this.verificationBadge?.syncQuietly(userId);
    await this.notifications.notifyUser({
      userId,
      type: 'subscription_renew',
      titleAr: '✅ تم تجديد اشتراكك',
      bodyAr: `تم تفعيل باقة ${planId}. المبلغ: ${amount} ${currency}`,
      data: { planId, amount: String(amount) },
    });

    const user = await this.repo.findUserEmail(userId);
    if (user?.email) {
      await this.emailQueue.addEmail({
        to: user.email,
        subject: 'تم تجديد اشتراكك',
        template: 'subscription_renew',
        variables: {
          plan: planId,
          amount: String(amount),
          body: `تم تجديد اشتراكك بنجاح.`,
        },
      });
    }
  }

  async notifyRenewalFailed(userId: string, planId: string): Promise<void> {
    await this.notifications.notifyUser({
      userId,
      type: 'subscription_renew',
      titleAr: '❌ فشل تجديد الاشتراك',
      bodyAr: 'لم تكتمل عملية الدفع. يمكنك إعادة المحاولة بدفعة جديدة.',
      data: { planId },
    });
  }
}
