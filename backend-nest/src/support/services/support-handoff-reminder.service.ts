import { Injectable } from '@nestjs/common';
import { LoggerService } from '../../common/services/logger.service';
import { SupportRepository } from '../repositories/support.repository';
import { handoffIsDue } from './support-handoff-clock';
import { SupportNotificationsService } from './support-notifications.service';

/**
 * Second alert: one e-mail per ticket, two hours after handoff, if no staff
 * message exists. Scanned by the worker; does not use ticket.updatedAt.
 */
@Injectable()
export class SupportHandoffReminderService {
  constructor(
    private readonly repo: SupportRepository,
    private readonly notifications: SupportNotificationsService,
    private readonly logger: LoggerService,
  ) {}

  async run(now = new Date()): Promise<{ checked: number; queued: number }> {
    const rows = await this.repo.listAwaitingStaffHandoffs();
    let queued = 0;
    for (const row of rows) {
      if (!handoffIsDue(row.metadata, now)) continue;
      const result = await this.notifications.notifyUnansweredHandoff({
        id: row.id,
        ticketNumber: row.ticketNumber,
        priority: row.priority,
      });
      if (result === 'queued') queued += 1;
    }
    if (queued) {
      this.logger.info(
        { event: 'SUPPORT_HANDOFF_REMINDER', queued },
        'Support handoff reminders queued',
      );
    }
    return { checked: rows.length, queued };
  }
}
