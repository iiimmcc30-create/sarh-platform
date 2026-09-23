import { Injectable } from '@nestjs/common';
import { AppNotificationsService } from '../../queue/services/app-notifications.service';
import { ApplicationRepository } from '../repositories/application.repository';
import type { ApplicationDetailDto } from '../types';

const SYSTEM_TYPE = 'system';

@Injectable()
export class ButcherApplicationNotificationsService {
  constructor(
    private readonly notifications: AppNotificationsService,
    private readonly applications: ApplicationRepository,
  ) {}

  private shopLabel(app: ApplicationDetailDto): string {
    return app.nameAr || app.nameEn || 'ملحمة';
  }

  private baseApplicationData(
    app: ApplicationDetailDto,
  ): Record<string, string | number> {
    return {
      applicationId: app.id,
      applicationNumber: app.applicationNumber,
    };
  }

  async notifyApplicationSubmitted(
    app: ApplicationDetailDto,
    applicantUserId: string,
  ): Promise<void> {
    const adminIds = await this.applications.findAllAdminUserIds();
    await this.notifications.notifyUsers(adminIds, {
      type: SYSTEM_TYPE,
      titleAr: 'طلب تقديم ملحمة جديد',
      bodyAr: `طلب رقم ${app.applicationNumber} — ${this.shopLabel(app)}`,
      data: {
        event: 'butcher_application_submitted',
        ...this.baseApplicationData(app),
        userId: applicantUserId,
        nameAr: app.nameAr ?? '',
        country: app.country ?? '',
      },
    });
  }

  async notifyApplicationReceived(
    app: ApplicationDetailDto,
    applicantUserId: string,
  ): Promise<void> {
    await this.notifications.notifyUser({
      userId: applicantUserId,
      type: SYSTEM_TYPE,
      titleAr: 'تم استلام طلبك',
      bodyAr: `طلب رقم ${app.applicationNumber} قيد المراجعة`,
      data: {
        event: 'butcher_application_received',
        ...this.baseApplicationData(app),
      },
    });
  }

  async notifyApplicationWithdrawn(
    app: ApplicationDetailDto,
    applicantUserId: string,
    options: { notifyAdmins?: boolean } = {},
  ): Promise<void> {
    const { notifyAdmins = true } = options;

    const tasks: Promise<void>[] = [
      this.notifications.notifyUser({
        userId: applicantUserId,
        type: SYSTEM_TYPE,
        titleAr: 'تم سحب طلبك',
        bodyAr: `تم سحب طلب رقم ${app.applicationNumber}`,
        data: {
          event: 'butcher_application_withdrawn',
          ...this.baseApplicationData(app),
        },
      }),
    ];

    if (notifyAdmins) {
      tasks.push(
        this.applications.findAllAdminUserIds().then((adminIds) =>
          this.notifications.notifyUsers(adminIds, {
            type: SYSTEM_TYPE,
            titleAr: 'سحب طلب تقديم ملحمة',
            bodyAr: `تم سحب طلب رقم ${app.applicationNumber} — ${this.shopLabel(app)}`,
            data: {
              event: 'butcher_application_withdrawn',
              ...this.baseApplicationData(app),
              userId: applicantUserId,
            },
          }),
        ),
      );
    }

    await Promise.allSettled(tasks);
  }

  async notifyApplicationApproved(
    app: ApplicationDetailDto,
    applicantUserId: string,
    butcherId: string,
  ): Promise<void> {
    await this.notifications.notifyUser({
      userId: applicantUserId,
      type: SYSTEM_TYPE,
      titleAr: 'تم قبول طلبك',
      bodyAr: `تم قبول طلب رقم ${app.applicationNumber}. يمكنك الآن إدارة ملحمتك.`,
      data: {
        event: 'butcher_application_approved',
        ...this.baseApplicationData(app),
        butcherId,
      },
    });
  }

  async notifyApplicationRejected(
    app: ApplicationDetailDto,
    applicantUserId: string,
  ): Promise<void> {
    await this.notifications.notifyUser({
      userId: applicantUserId,
      type: SYSTEM_TYPE,
      titleAr: 'تم رفض طلبك',
      bodyAr: `تم رفض طلب رقم ${app.applicationNumber}`,
      data: {
        event: 'butcher_application_rejected',
        ...this.baseApplicationData(app),
        rejectionReason: app.rejectionReason ?? '',
      },
    });
  }

  async notifyAfterApplicationSubmit(
    app: ApplicationDetailDto,
    applicantUserId: string,
  ): Promise<void> {
    await Promise.allSettled([
      this.notifyApplicationSubmitted(app, applicantUserId),
      this.notifyApplicationReceived(app, applicantUserId),
    ]);
  }
}
