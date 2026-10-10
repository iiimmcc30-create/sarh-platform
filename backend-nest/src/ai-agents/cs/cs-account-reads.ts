import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { FeesService } from '../../fees/fees.service';
import {
  getSubscriptionStatus,
  isPaidPlan,
  isTrialRow,
} from '../../lib/subscription-lifecycle';
import { PrismaService } from '../../prisma/prisma.service';
import { FaqService } from '../../support/services/faq.service';
import { FAQ_KNOWLEDGE_BASE } from '../../support/kb/faq-knowledge-base';
import {
  FAQ_SEARCH_MIN_SCORE,
  rankFaqs,
} from '../../support/kb/faq-retrieval';
import { SubscriptionBillingService } from '../../subscriptions/billing/subscription-billing.service';
import type { BillingSource } from '../../subscriptions/billing/subscription-billing';
import type { TicketFilter } from './cs-tools';

const OPEN_STATUSES = [
  'OPEN',
  'AI_ASSISTING',
  'WAITING_FOR_CUSTOMER',
  'WAITING_FOR_SUPPORT',
  'IN_PROGRESS',
  'AWAITING_USER',
] as const;

function day(value: Date | null | undefined): string | null {
  if (!value) return null;
  return value.toISOString().slice(0, 10);
}

function sourceOf(source: BillingSource): 'ni' | 'apple' | 'google' | null {
  if (source === 'app_store') return 'apple';
  if (source === 'google_play') return 'google';
  if (source === 'ngenius') return 'ni';
  return null;
}

@Injectable()
export class CsAccountReads {
  constructor(
    private readonly prisma: PrismaService,
    private readonly feesService: FeesService,
    private readonly billing: SubscriptionBillingService,
    private readonly faq: FaqService,
  ) {}

  async subscription(userId: string) {
    const [row, billing] = await Promise.all([
      this.prisma.subscription.findUnique({
        where: { userId },
        select: {
          planId: true,
          renewDate: true,
          autoRenew: true,
          status: true,
        },
      }),
      this.billing.getForUser(userId),
    ]);
    if (!row || !isPaidPlan(row.planId)) {
      return {
        planName: 'free',
        status: 'free' as const,
        renewDate: null,
        autoRenew: false,
        source: null,
      };
    }
    const lifecycle = getSubscriptionStatus(row);
    const status = isTrialRow(row)
      ? lifecycle === 'expired'
        ? 'expired'
        : 'trial'
      : lifecycle === 'expired' || lifecycle === 'downgraded'
        ? 'expired'
        : 'active';
    return {
      planName: row.planId,
      status,
      renewDate: day(row.renewDate),
      autoRenew: row.autoRenew,
      source: sourceOf(billing.source),
    };
  }

  async verification(userId: string) {
    const [user, request] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { verifiedTier: true },
      }),
      this.prisma.accountVerificationRequest.findUnique({
        where: { userId },
        select: {
          status: true,
          requestedTier: true,
          reviewedAt: true,
          updatedAt: true,
          documents: { select: { type: true } },
        },
      }),
    ]);
    const tier = user?.verifiedTier === 'blue' || user?.verifiedTier === 'gold'
      ? user.verifiedTier
      : 'none';
    const hasRegister = (request?.documents ?? []).some(
      (doc) => doc.type === 'COMMERCIAL_REGISTER',
    );
    const missingItems: string[] = [];
    if (request?.requestedTier === 'gold' && !hasRegister) {
      missingItems.push('commercial_register');
    }
    if (request?.status === 'NEEDS_AMENDMENTS') missingItems.push('amendments');
    return {
      badge: tier,
      requestStatus: request?.status ?? 'none',
      missingItems,
      lastUpdate: day(request?.reviewedAt ?? request?.updatedAt ?? null),
    };
  }

  async fees(userId: string) {
    const listed = await this.feesService.listForUser(userId);
    return {
      ratePercent: listed.ratePercent,
      owedCount: listed.summary.owedCount,
      owedTotal: listed.summary.owedTotal,
      fees: listed.fees.slice(0, 10).map((fee) => ({
        status: fee.status,
        commission: fee.commission,
        dueDate: fee.dueDate,
        paidAt: day(fee.paidAt),
      })),
    };
  }

  async payments(userId: string, limit: number) {
    const take = Math.min(10, Math.max(1, Math.floor(limit) || 5));
    const rows = await this.prisma.payment.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        amount: true,
        currency: true,
        status: true,
        referenceType: true,
        createdAt: true,
      },
    });
    return rows.map((row) => ({
      id: row.id.slice(-6),
      date: day(row.createdAt),
      amount: row.amount,
      currency: row.currency,
      status: row.status,
      purpose: row.referenceType ?? 'other',
    }));
  }

  async tickets(userId: string, status?: TicketFilter) {
    const where: Prisma.SupportTicketWhereInput = {
      reporterId: userId,
      deletedAt: null,
      type: 'SUPPORT',
      ...(status === 'open' ? { status: { in: [...OPEN_STATUSES] } } : {}),
      ...(status === 'review' ? { status: 'IN_REVIEW' } : {}),
      ...(status === 'closed'
        ? { status: { in: ['RESOLVED', 'CLOSED'] } }
        : {}),
    };
    const rows = await this.prisma.supportTicket.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: 10,
      select: {
        ticketNumber: true,
        subject: true,
        status: true,
        updatedAt: true,
      },
    });
    return rows.map((row) => ({
      ticketNumber: row.ticketNumber,
      subject: row.subject,
      state: row.status,
      updatedAt: day(row.updatedAt),
    }));
  }

  async searchFaq(query: string) {
    try {
      const ranked = await this.faq.retrieveForAssistant(query, 3);
      if (ranked.length) {
        return ranked.map(({ faq, score }) => ({
          key: faq.key,
          question: faq.questionAr,
          answer: faq.answerAr,
          actionRoute: faq.actionRoute ?? null,
          score,
        }));
      }
    } catch {
      // Fall through to the in-code knowledge base.
    }
    return rankFaqs(
      query,
      FAQ_KNOWLEDGE_BASE.map((faq) => ({
        id: faq.key,
        key: faq.key,
        questionAr: faq.questionAr,
        answerAr: faq.answerAr,
        keywords: [...faq.keywords],
        actionRoute: faq.actionRoute ?? null,
      })),
      { limit: 3, minScore: FAQ_SEARCH_MIN_SCORE },
    ).map(({ faq, score }) => ({
      key: faq.key,
      question: faq.questionAr,
      answer: faq.answerAr,
      actionRoute: faq.actionRoute,
      score,
    }));
  }
}
