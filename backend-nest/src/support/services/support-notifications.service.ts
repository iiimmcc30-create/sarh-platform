import { Injectable, Optional } from '@nestjs/common';
import { AppNotificationsService } from '../../queue/services/app-notifications.service';
import { EmailQueueService } from '../../queue/services/email-queue.service';
import { RedisCacheService } from '../../redis/services/redis-cache.service';
import { LoggerService } from '../../common/services/logger.service';
import { isSafeEmailAddress } from '../../queue/processors/email.sanitize';
import { isAiEmailAlertsEnabled } from '../../ai-safety/ai-flags';
import type { SupportEscalationReason } from '../ai/ai-provider';
import { SupportRepository } from '../repositories/support.repository';
import {
  TICKET_STATUS_LABEL_AR,
  VERIFICATION_STATUS_LABEL_AR,
} from '../constants/support.constants';

const SYSTEM_TYPE = 'system';

const HANDOFF_ALERT_TTL_SECONDS = 60 * 24 * 60 * 60;

export const HANDOFF_REASON_LABEL_AR: Record<SupportEscalationReason, string> =
  {
    human_requested: 'العميل طلب موظف',
    fraud: 'بلاغ احتيال',
    refund: 'طلب استرداد أو تعويض',
    payment_dispute: 'مشكلة في الدفع',
    repeated: 'تكرر السؤال أو وصل حد الرسائل',
    low_confidence: 'ما لقى المساعد جواب واضح في الأسئلة الشائعة',
    assistant_decision: 'المساعد قرر التحويل',
    assistant_disabled: 'المساعد الذكي متوقف',
  };

export const PRIORITY_LABEL_AR: Record<string, string> = {
  LOW: 'منخفضة',
  NORMAL: 'عادية',
  HIGH: 'عالية',
  URGENT: 'عاجلة',
};

export type HandoffAlertResult =
  'queued' | 'disabled' | 'not_configured' | 'duplicate' | 'failed';

/** SUPPORT_ALERT_EMAIL: one address or a comma-separated list (max 5). */
export function supportAlertRecipients(): string[] {
  return (process.env.SUPPORT_ALERT_EMAIL || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s && isSafeEmailAddress(s))
    .slice(0, 5);
}

export function adminTicketUrl(ticketId: string): string {
  const base = (
    process.env.ADMIN_PANEL_URL?.trim() ||
    `${(process.env.APP_URL?.trim() || 'https://sarhsa.online').replace(/\/$/, '')}/admin`
  ).replace(/\/$/, '');
  return `${base}/support/tickets/${encodeURIComponent(ticketId)}`;
}

@Injectable()
export class SupportNotificationsService {
  constructor(
    private readonly notifications: AppNotificationsService,
    private readonly repo: SupportRepository,
    @Optional() private readonly emailQueue?: EmailQueueService,
    @Optional() private readonly cache?: RedisCacheService,
    @Optional() private readonly logger?: LoggerService,
  ) {}

  /**
   * E-mail the support inbox once when a ticket is handed from «مساعد سرح»
   * to a human. Contains only the ticket number, priority, reason and an
   * admin-panel link. Never throws; failures are logged without PII.
   */
  notifyEscalatedToHuman(ticket: {
    id: string;
    ticketNumber: string;
    priority: string;
    reason: SupportEscalationReason;
  }): Promise<HandoffAlertResult> {
    return this.queueStaffAlert({
      event: 'SUPPORT_HANDOFF_ALERT',
      ticket,
      claimKey: `support:handoff-alert:${ticket.id}`,
      jobIdPrefix: `support-handoff-${ticket.id}`,
      subject: `تذكرة محوّلة للدعم: ${ticket.ticketNumber}`,
      reason: HANDOFF_REASON_LABEL_AR[ticket.reason] ?? ticket.reason,
      queued: 'Support handoff e-mail queued',
      failed: 'Support handoff e-mail failed',
      unavailable:
        'Support handoff e-mail could not be queued (Redis/queue unavailable)',
    });
  }

  /**
   * One follow-up e-mail when a handed-off ticket still has no staff reply.
   * Same fields as the first alert: number, priority, a fixed reason, admin link.
   */
  notifyUnansweredHandoff(ticket: {
    id: string;
    ticketNumber: string;
    priority: string;
  }): Promise<HandoffAlertResult> {
    return this.queueStaffAlert({
      event: 'SUPPORT_HANDOFF_REMINDER',
      ticket,
      claimKey: `support:handoff-reminder:${ticket.id}`,
      jobIdPrefix: `support-handoff-reminder-${ticket.id}`,
      subject: `تذكير: تذكرة تنتظر رد الدعم: ${ticket.ticketNumber}`,
      reason: 'مرّت ساعتان بدون رد من الموظف',
      queued: 'Support handoff reminder queued',
      failed: 'Support handoff reminder failed',
      unavailable:
        'Support handoff reminder could not be queued (Redis/queue unavailable)',
    });
  }

  private async queueStaffAlert(input: {
    event: string;
    ticket: { id: string; ticketNumber: string; priority: string };
    claimKey: string;
    jobIdPrefix: string;
    subject: string;
    reason: string;
    queued: string;
    failed: string;
    unavailable: string;
  }): Promise<HandoffAlertResult> {
    const log = {
      event: input.event,
      ticketNumber: input.ticket.ticketNumber,
    };
    let claimed = false;
    try {
      if (!isAiEmailAlertsEnabled()) return 'disabled';
      const recipients = supportAlertRecipients();
      const missing: string[] = [];
      if (!recipients.length) missing.push('SUPPORT_ALERT_EMAIL');
      if (!process.env.SMTP_HOST?.trim()) missing.push('SMTP_HOST');
      if (!process.env.SMTP_PASS?.trim()) missing.push('SMTP_PASS');
      if (missing.length || !this.emailQueue || !this.cache) {
        this.logger?.warn(
          { ...log, outcome: 'not_configured', missing },
          'Support handoff e-mail skipped — set SUPPORT_ALERT_EMAIL and SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS/EMAIL_FROM',
        );
        return 'not_configured';
      }
      const first = await this.cache.claimOnce(
        input.claimKey,
        HANDOFF_ALERT_TTL_SECONDS,
      );
      if (!first) return 'duplicate';
      claimed = true;

      const variables = {
        ticketNumber: input.ticket.ticketNumber,
        priority:
          PRIORITY_LABEL_AR[input.ticket.priority] ?? input.ticket.priority,
        reason: input.reason,
        ticketUrl: adminTicketUrl(input.ticket.id),
      };
      const results = await Promise.all(
        recipients.map((to, i) =>
          this.emailQueue!.addEmail(
            {
              to,
              subject: input.subject,
              template: 'support_handoff',
              variables,
            },
            { jobId: `${input.jobIdPrefix}-${i}` },
          ),
        ),
      );
      if (results.some((r) => !r)) {
        await this.releaseHandoffClaim(input.claimKey);
        this.logger?.warn({ ...log, outcome: 'failed' }, input.unavailable);
        return 'failed';
      }
      this.logger?.info({ ...log, outcome: 'queued' }, input.queued);
      return 'queued';
    } catch (err) {
      if (claimed) await this.releaseHandoffClaim(input.claimKey);
      this.logger?.warn(
        {
          ...log,
          outcome: 'failed',
          errorName: err instanceof Error ? err.name : undefined,
        },
        input.failed,
      );
      return 'failed';
    }
  }

  /** Drop the once-only lock so a failed enqueue can be retried. */
  private async releaseHandoffClaim(key: string) {
    try {
      await this.cache?.releaseClaim(key);
    } catch (err) {
      this.logger?.warn(
        {
          event: 'SUPPORT_HANDOFF_ALERT',
          outcome: 'release_failed',
          errorName: err instanceof Error ? err.name : undefined,
        },
        'Support handoff claim could not be released',
      );
    }
  }

  private async notifyStaff(payload: {
    titleAr: string;
    bodyAr: string;
    data: Record<string, string | number>;
  }) {
    const staff = await this.repo.findAllStaffUserIds();
    if (!staff.length) return;
    await this.notifications.notifyUsers(
      staff.map((s) => s.id),
      {
        type: SYSTEM_TYPE,
        titleAr: payload.titleAr,
        bodyAr: payload.bodyAr,
        data: payload.data,
      },
    );
  }

  async notifyTicketCreated(
    userId: string,
    ticket: { id: string; ticketNumber: string; subject: string },
  ) {
    await Promise.allSettled([
      this.notifications.notifyUser({
        userId,
        type: SYSTEM_TYPE,
        titleAr: 'تم إنشاء تذكرة الدعم',
        bodyAr: `تذكرة رقم ${ticket.ticketNumber} — ${ticket.subject}`,
        data: {
          event: 'support_ticket_created',
          ticketId: ticket.id,
          ticketNumber: ticket.ticketNumber,
        },
      }),
      this.notifyStaff({
        titleAr: 'تذكرة دعم جديدة',
        bodyAr: `${ticket.ticketNumber} — ${ticket.subject}`,
        data: {
          event: 'support_ticket_staff_new',
          ticketId: ticket.id,
          ticketNumber: ticket.ticketNumber,
        },
      }),
    ]);
  }

  async notifyStaffReply(
    userId: string,
    ticket: { id: string; ticketNumber: string },
  ) {
    await this.notifications.notifyUser({
      userId,
      type: SYSTEM_TYPE,
      titleAr: 'رد من فريق الدعم',
      bodyAr: `تذكرة رقم ${ticket.ticketNumber}`,
      data: {
        event: 'support_ticket_staff_reply',
        ticketId: ticket.id,
        ticketNumber: ticket.ticketNumber,
      },
    });
  }

  async notifyUserReply(ticket: {
    id: string;
    ticketNumber: string;
    subject: string;
  }) {
    await this.notifyStaff({
      titleAr: 'رد مستخدم على تذكرة',
      bodyAr: `${ticket.ticketNumber} — ${ticket.subject}`,
      data: {
        event: 'support_ticket_user_reply',
        ticketId: ticket.id,
        ticketNumber: ticket.ticketNumber,
      },
    });
  }

  async notifyTicketStatusChanged(
    userId: string,
    ticket: { id: string; ticketNumber: string; status: string },
  ) {
    const statusLabel = TICKET_STATUS_LABEL_AR[ticket.status] ?? ticket.status;
    await this.notifications.notifyUser({
      userId,
      type: SYSTEM_TYPE,
      titleAr: 'تحديث حالة التذكرة',
      bodyAr: `تذكرة ${ticket.ticketNumber} — ${statusLabel}`,
      data: {
        event: 'support_ticket_status_changed',
        ticketId: ticket.id,
        ticketNumber: ticket.ticketNumber,
        status: ticket.status,
      },
    });
  }

  async notifyTicketAwaitingUser(
    userId: string,
    ticket: { id: string; ticketNumber: string },
  ) {
    await this.notifications.notifyUser({
      userId,
      type: SYSTEM_TYPE,
      titleAr: 'مطلوب رد منك',
      bodyAr: `تذكرة ${ticket.ticketNumber} — يرجى تزويدنا بمعلومات إضافية`,
      data: {
        event: 'support_ticket_awaiting_user',
        ticketId: ticket.id,
        ticketNumber: ticket.ticketNumber,
      },
    });
  }

  async notifyTicketClosed(
    userId: string,
    ticket: { id: string; ticketNumber: string },
  ) {
    await this.notifications.notifyUser({
      userId,
      type: SYSTEM_TYPE,
      titleAr: 'تم إغلاق التذكرة',
      bodyAr: `تذكرة ${ticket.ticketNumber}`,
      data: {
        event: 'support_ticket_closed',
        ticketId: ticket.id,
        ticketNumber: ticket.ticketNumber,
      },
    });
  }

  async notifyVerificationSubmitted(userId: string) {
    await Promise.allSettled([
      this.notifications.notifyUser({
        userId,
        type: SYSTEM_TYPE,
        titleAr: 'تم استلام طلب التوثيق',
        bodyAr: 'طلبك قيد المراجعة',
        data: { event: 'account_verification_received' },
      }),
      this.notifyStaff({
        titleAr: 'طلب توثيق حساب جديد',
        bodyAr: 'يوجد طلب توثيق بانتظار المراجعة',
        data: { event: 'account_verification_staff_new' },
      }),
    ]);
  }

  async notifyVerificationReviewStarted(userId: string) {
    await this.notifications.notifyUser({
      userId,
      type: SYSTEM_TYPE,
      titleAr: 'بدء مراجعة طلب التوثيق',
      bodyAr: 'جاري مراجعة مستنداتك',
      data: { event: 'account_verification_review_started' },
    });
  }

  async notifyVerificationNeedsAmendments(userId: string, reason: string) {
    await this.notifications.notifyUser({
      userId,
      type: SYSTEM_TYPE,
      titleAr: 'طلب تعديلات على التوثيق',
      bodyAr: reason.slice(0, 120) || 'يرجى مراجعة الملاحظات وإعادة الإرسال',
      data: {
        event: 'account_verification_needs_amendments',
        reviewReason: reason,
      },
    });
  }

  async notifyVerificationApproved(userId: string) {
    await this.notifications.notifyUser({
      userId,
      type: SYSTEM_TYPE,
      titleAr: 'تم قبول طلب التوثيق',
      bodyAr:
        'مبروك! تم قبول طلب التوثيق. تظهر الشارة الذهبية على حسابك مع اشتراك Gold النشط.',
      data: { event: 'account_verification_approved' },
    });
  }

  async notifyVerificationRejected(userId: string, reason: string) {
    await this.notifications.notifyUser({
      userId,
      type: SYSTEM_TYPE,
      titleAr: 'تم رفض طلب التوثيق',
      bodyAr: reason.slice(0, 120) || 'يرجى مراجعة السبب في صفحة التوثيق',
      data: {
        event: 'account_verification_rejected',
        reviewReason: reason,
      },
    });
  }

  statusLabelAr(status: string) {
    return VERIFICATION_STATUS_LABEL_AR[status] ?? status;
  }
}
