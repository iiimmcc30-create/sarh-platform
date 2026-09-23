import { Injectable } from '@nestjs/common';
import { AppNotificationsService } from '../../queue/services/app-notifications.service';
import { SupportRepository } from '../repositories/support.repository';
import {
  TICKET_STATUS_LABEL_AR,
  VERIFICATION_STATUS_LABEL_AR,
} from '../constants/support.constants';

const SYSTEM_TYPE = 'system';

@Injectable()
export class SupportNotificationsService {
  constructor(
    private readonly notifications: AppNotificationsService,
    private readonly repo: SupportRepository,
  ) {}

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
      titleAr: 'تم توثيق حسابك',
      bodyAr: 'مبروك! تم قبول طلب التوثيق',
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
