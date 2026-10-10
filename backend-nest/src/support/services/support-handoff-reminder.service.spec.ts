import { AWAITING_STAFF_HANDOFF_WHERE } from '../repositories/support.repository';
import {
  HANDOFF_REMINDER_AFTER_MS,
  handoffIsDue,
} from './support-handoff-clock';
import { SupportHandoffReminderService } from './support-handoff-reminder.service';
import { SupportNotificationsService } from './support-notifications.service';

const ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

describe('support handoff reminder', () => {
  const env = { ...process.env };
  const emailQueue = { addEmail: jest.fn() };
  const claims = new Set<string>();
  const cache = {
    claimOnce: jest.fn(async (key: string) => {
      if (claims.has(key)) return false;
      claims.add(key);
      return true;
    }),
    releaseClaim: jest.fn(async (key: string) => {
      claims.delete(key);
    }),
  };
  const logger = { info: jest.fn(), warn: jest.fn() };
  const rows: Array<{
    id: string;
    ticketNumber: string;
    priority: string;
    metadata: unknown;
  }> = [];
  const repo = {
    listAwaitingStaffHandoffs: jest.fn(async () => rows),
    findAllStaffUserIds: jest.fn(),
  };
  let svc: SupportHandoffReminderService;

  const now = new Date('2026-10-10T12:00:00.000Z');
  const dueAt = new Date(now.getTime() - HANDOFF_REMINDER_AFTER_MS).toISOString();

  beforeEach(() => {
    jest.clearAllMocks();
    claims.clear();
    rows.length = 0;
    process.env = { ...env };
    delete process.env.SARH_AI_EMAIL_ALERTS_ENABLED;
    process.env.SUPPORT_ALERT_EMAIL = 'support-team@example.com';
    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.SMTP_PASS = 'x';
    process.env.APP_URL = 'https://sarhsa.online';
    emailQueue.addEmail.mockResolvedValue({ id: 'job1' });
    const notifications = new SupportNotificationsService(
      { notifyUser: jest.fn(), notifyUsers: jest.fn() } as never,
      repo as never,
      emailQueue as never,
      cache as never,
      logger as never,
    );
    svc = new SupportHandoffReminderService(
      repo as never,
      notifications,
      logger as never,
    );
  });

  afterAll(() => {
    process.env = env;
  });

  it('selects open human tickets with no staff message, not updatedAt', () => {
    expect(AWAITING_STAFF_HANDOFF_WHERE).toEqual({
      deletedAt: null,
      handlerMode: 'HUMAN_ACTIVE',
      status: { notIn: ['CLOSED', 'RESOLVED'] },
      messages: { none: { authorKind: 'STAFF' } },
    });
    expect(JSON.stringify(AWAITING_STAFF_HANDOFF_WHERE)).not.toContain(
      'updatedAt',
    );
  });

  it('does not treat a missing handoff clock as due', () => {
    expect(handoffIsDue({ updatedAt: '2020-01-01T00:00:00.000Z' }, now)).toBe(
      false,
    );
    expect(handoffIsDue({}, now)).toBe(false);
    expect(handoffIsDue(null, now)).toBe(false);
  });

  it('emails once after two hours, with number priority and link only', async () => {
    rows.push({
      id: ID,
      ticketNumber: 'SRH-2026-000042',
      priority: 'HIGH',
      metadata: { handoffAt: dueAt, issueType: 'PAYMENT_ISSUE' },
    });
    await expect(svc.run(now)).resolves.toEqual({ checked: 1, queued: 1 });
    await expect(svc.run(now)).resolves.toEqual({ checked: 1, queued: 0 });
    expect(emailQueue.addEmail).toHaveBeenCalledTimes(1);
    const [job, opts] = emailQueue.addEmail.mock.calls[0];
    expect(job.subject).toBe('تذكير: تذكرة تنتظر رد الدعم: SRH-2026-000042');
    expect(job.template).toBe('support_handoff');
    expect(job.variables).toEqual({
      ticketNumber: 'SRH-2026-000042',
      priority: 'عالية',
      reason: 'مرّت ساعتان بدون رد من الموظف',
      ticketUrl: `https://sarhsa.online/admin/support/tickets/${ID}`,
    });
    expect(JSON.stringify(job)).not.toContain('issueType');
    expect(JSON.stringify(job)).not.toContain('body');
    expect(opts).toEqual({ jobId: `support-handoff-reminder-${ID}-0` });
    expect(claims.has(`support:handoff-reminder:${ID}`)).toBe(true);
    expect(claims.has(`support:handoff-alert:${ID}`)).toBe(false);
  });

  it('skips a handoff that is still inside the two hours', async () => {
    rows.push({
      id: ID,
      ticketNumber: 'SRH-2026-000042',
      priority: 'NORMAL',
      metadata: {
        handoffAt: new Date(now.getTime() - 60 * 60 * 1000).toISOString(),
      },
    });
    await expect(svc.run(now)).resolves.toEqual({ checked: 1, queued: 0 });
    expect(emailQueue.addEmail).not.toHaveBeenCalled();
  });

  it('releases the claim when the queue fails so the next scan can retry', async () => {
    rows.push({
      id: ID,
      ticketNumber: 'SRH-2026-000042',
      priority: 'URGENT',
      metadata: { handoffAt: dueAt },
    });
    emailQueue.addEmail.mockRejectedValueOnce(new Error('redis down'));
    await expect(svc.run(now)).resolves.toEqual({ checked: 1, queued: 0 });
    expect(claims.has(`support:handoff-reminder:${ID}`)).toBe(false);
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('redis down');
    emailQueue.addEmail.mockResolvedValue({ id: 'job2' });
    await expect(svc.run(now)).resolves.toEqual({ checked: 1, queued: 1 });
  });
});
