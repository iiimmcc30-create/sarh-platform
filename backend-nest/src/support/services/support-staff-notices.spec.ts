import { SupportNotificationsService } from './support-notifications.service';

describe('support staff notices', () => {
  const notifications = { notifyUser: jest.fn(), notifyUsers: jest.fn() };
  const repo = {
    findAllStaffUserIds: jest.fn(),
    findRecentTicketNotice: jest.fn(),
    updateTicketNotice: jest.fn(),
  };
  const svc = new SupportNotificationsService(
    notifications as never,
    repo as never,
  );

  const ticket = {
    id: 'ticket-1',
    ticketNumber: 'SRH-2026-000010',
    subject: 'اشتراك',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    repo.findAllStaffUserIds.mockResolvedValue([
      { id: 'admin-sarh' },
      { id: 'mod-2' },
    ]);
    repo.findRecentTicketNotice.mockResolvedValue(null);
    notifications.notifyUser.mockResolvedValue(undefined);
  });

  it('does not tell an admin about a ticket or reply they wrote themselves', async () => {
    await svc.notifyTicketCreated('admin-sarh', ticket);
    await svc.notifyUserReply(ticket, 'admin-sarh');

    const calls = notifications.notifyUser.mock.calls.map((call) => call[0]);
    const own = calls.filter((call) => call.userId === 'admin-sarh');
    expect(own).toHaveLength(1);
    expect(own[0].titleAr).toBe('تم إنشاء تذكرة الدعم');
    expect(
      calls.some(
        (call) =>
          call.userId === 'admin-sarh' &&
          (call.data.event === 'support_ticket_staff_new' ||
            call.data.event === 'support_ticket_user_reply'),
      ),
    ).toBe(false);
    expect(
      notifications.notifyUser.mock.calls.some(
        (call) =>
          call[0].userId === 'mod-2' &&
          call[0].data.event === 'support_ticket_user_reply',
      ),
    ).toBe(true);
  });

  it('keeps one in-app notice per ticket for five minutes and never pushes staff', async () => {
    await svc.notifyUserReply(ticket, 'customer-1');
    expect(notifications.notifyUser).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'mod-2',
        skipPush: true,
        titleAr: 'رد مستخدم على تذكرة',
      }),
    );
    expect(notifications.notifyUser).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'admin-sarh', skipPush: true }),
    );

    notifications.notifyUser.mockClear();
    repo.findRecentTicketNotice.mockResolvedValue({
      id: 'notice-1',
      data: { event: 'support_ticket_user_reply', count: '1' },
    });
    await svc.notifyUserReply(ticket, 'customer-1');

    expect(notifications.notifyUser).not.toHaveBeenCalled();
    expect(repo.updateTicketNotice).toHaveBeenCalledWith(
      'notice-1',
      '2 ردود جديدة على SRH-2026-000010',
      expect.objectContaining({ count: '2', ticketNumber: 'SRH-2026-000010' }),
    );
  });
});
