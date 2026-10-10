import {
  adminTicketUrl,
  SupportNotificationsService,
  supportAlertRecipients,
} from './support-notifications.service';
import { supportHandoffHtml } from '../../queue/processors/email.processor';

describe('Support handoff e-mail alert (Phase 0)', () => {
  const env = { ...process.env };
  const notifications = { notifyUser: jest.fn(), notifyUsers: jest.fn() };
  const repo = { findAllStaffUserIds: jest.fn() };
  const emailQueue = { addEmail: jest.fn() };
  const claims = new Set<string>();
  const cache = {
    claimOnce: jest.fn(async (key: string) => {
      if (claims.has(key)) return false;
      claims.add(key);
      return true;
    }),
  };
  const logger = { info: jest.fn(), warn: jest.fn() };
  let svc: SupportNotificationsService;

  const ticket = {
    id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    ticketNumber: 'SRH-2026-000042',
    priority: 'HIGH',
    reason: 'fraud' as const,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    claims.clear();
    process.env = { ...env };
    delete process.env.SARH_AI_EMAIL_ALERTS_ENABLED;
    delete process.env.ADMIN_PANEL_URL;
    process.env.SUPPORT_ALERT_EMAIL = 'support-team@example.com';
    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.SMTP_PASS = 'x';
    process.env.APP_URL = 'https://sarhsa.online';
    emailQueue.addEmail.mockResolvedValue({ id: 'job1' });
    svc = new SupportNotificationsService(
      notifications as never,
      repo as never,
      emailQueue as never,
      cache as never,
      logger as never,
    );
  });
  afterAll(() => {
    process.env = env;
  });

  it('queues one e-mail with number, priority, reason and admin link only', async () => {
    expect(await svc.notifyEscalatedToHuman(ticket)).toBe('queued');
    expect(emailQueue.addEmail).toHaveBeenCalledTimes(1);
    const [job, opts] = emailQueue.addEmail.mock.calls[0];
    expect(job).toEqual({
      to: 'support-team@example.com',
      subject: 'تذكرة محوّلة للدعم: SRH-2026-000042',
      template: 'support_handoff',
      variables: {
        ticketNumber: 'SRH-2026-000042',
        priority: 'عالية',
        reason: 'بلاغ احتيال',
        ticketUrl: `https://sarhsa.online/admin/support/tickets/${ticket.id}`,
      },
    });
    expect(opts).toEqual({ jobId: `support-handoff-${ticket.id}-0` });
    expect(opts.jobId).not.toContain(':');
  });

  it('never sends twice for the same ticket (retries / repeated events)', async () => {
    await svc.notifyEscalatedToHuman(ticket);
    expect(await svc.notifyEscalatedToHuman(ticket)).toBe('duplicate');
    expect(await svc.notifyEscalatedToHuman(ticket)).toBe('duplicate');
    expect(emailQueue.addEmail).toHaveBeenCalledTimes(1);
  });

  it('SARH_AI_EMAIL_ALERTS_ENABLED=false → nothing sent', async () => {
    process.env.SARH_AI_EMAIL_ALERTS_ENABLED = 'false';
    expect(await svc.notifyEscalatedToHuman(ticket)).toBe('disabled');
    expect(emailQueue.addEmail).not.toHaveBeenCalled();
    expect(cache.claimOnce).not.toHaveBeenCalled();
  });

  it('missing recipient / SMTP → safe log naming the settings, no throw, no claim', async () => {
    delete process.env.SUPPORT_ALERT_EMAIL;
    delete process.env.SMTP_PASS;
    expect(await svc.notifyEscalatedToHuman(ticket)).toBe('not_configured');
    expect(emailQueue.addEmail).not.toHaveBeenCalled();
    expect(cache.claimOnce).not.toHaveBeenCalled();
    const [meta] = logger.warn.mock.calls[0];
    expect(meta.missing).toEqual(['SUPPORT_ALERT_EMAIL', 'SMTP_PASS']);
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(
      'smtp.example.com',
    );
  });

  it('queue failure is reported but never thrown', async () => {
    emailQueue.addEmail.mockResolvedValue(null);
    expect(await svc.notifyEscalatedToHuman(ticket)).toBe('failed');
    emailQueue.addEmail.mockRejectedValue(new Error('redis down'));
    expect(await svc.notifyEscalatedToHuman({ ...ticket, id: 'other' })).toBe(
      'failed',
    );
  });

  it('works without the optional e-mail deps (older wiring) → not_configured', async () => {
    const bare = new SupportNotificationsService(
      notifications as never,
      repo as never,
    );
    expect(await bare.notifyEscalatedToHuman(ticket)).toBe('not_configured');
  });

  it('recipient list: comma separated, invalid ones dropped, max 5', () => {
    process.env.SUPPORT_ALERT_EMAIL = 'a@example.com, bad, b@example.com';
    expect(supportAlertRecipients()).toEqual([
      'a@example.com',
      'b@example.com',
    ]);
  });

  it('ADMIN_PANEL_URL overrides the default APP_URL/admin', () => {
    process.env.ADMIN_PANEL_URL = 'https://ops.example.com/admin/';
    expect(adminTicketUrl('t 1')).toBe(
      'https://ops.example.com/admin/support/tickets/t%201',
    );
  });

  it('e-mail HTML escapes values and contains no conversation text', () => {
    const html = supportHandoffHtml({
      ticketNumber: '<b>SRH</b>',
      priority: 'عالية',
      reason: 'بلاغ احتيال',
      ticketUrl: 'https://sarhsa.online/admin/support/tickets/abc',
    });
    expect(html).toContain('&lt;b&gt;SRH&lt;/b&gt;');
    expect(html).toContain(
      'href="https://sarhsa.online/admin/support/tickets/abc"',
    );
    expect(
      supportHandoffHtml({ ticketUrl: 'javascript:alert(1)' } as never),
    ).not.toContain('javascript');
  });
});
