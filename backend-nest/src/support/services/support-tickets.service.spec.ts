import { SupportTicketsService } from './support-tickets.service';
import { ApiException } from '../../common/exceptions/api.exception';
import {
  sarhanWelcome,
  SUPPORT_TICKET_CATEGORY_LABEL_AR,
} from '../constants/support.constants';
import type { JwtPayload } from '../../common/types/jwt-payload.interface';

function user(id: string, role: JwtPayload['role'] = 'USER'): JwtPayload {
  return { userId: id, username: id, role };
}

describe('SupportTicketsService', () => {
  const repo = {
    listUserTickets: jest.fn(),
    findUserTicket: jest.fn(),
    findTicketById: jest.fn(),
    createTicket: jest.fn(),
    updateTicket: jest.fn(),
    createMessage: jest.fn(),
    findUserNames: jest.fn(),
    findLatestSrhTicketNumber: jest.fn(),
    isUniqueConstraint: jest.fn(
      (err: { code?: string }) => err?.code === 'P2002',
    ),
    findAllStaffUserIds: jest.fn(),
  };
  const notifications = {
    notifyTicketCreated: jest.fn(),
    notifyUserReply: jest.fn(),
    notifyStaffReply: jest.fn(),
    notifyTicketStatusChanged: jest.fn(),
    notifyTicketAwaitingUser: jest.fn(),
    notifyTicketClosed: jest.fn(),
  };
  const prisma = {
    user: { findMany: jest.fn() },
  };
  const logger = { info: jest.fn(), warn: jest.fn() };
  const sockets = { emitToTicket: jest.fn() };
  const sarhan = { nextTurn: jest.fn() };
  const aiContext = { build: jest.fn() };

  let service: SupportTicketsService;

  beforeEach(() => {
    jest.clearAllMocks();
    repo.findUserNames.mockResolvedValue({
      arabicName: 'متعب العتيبي',
      displayName: 'Muteb',
    });
    repo.findLatestSrhTicketNumber.mockResolvedValue(null);
    repo.createMessage.mockResolvedValue({ id: 'm1', body: 'x' });
    repo.updateTicket.mockImplementation(
      async (id: string, data: Record<string, unknown>) => ({
        id,
        ticketNumber: 'SRH-2026-000001',
        ...data,
      }),
    );
    sarhan.nextTurn.mockResolvedValue({
      replyAr: 'هل الطلب لم يصل؟',
      escalate: false,
      metadata: { issueType: 'ORDER_NOT_RECEIVED' },
      missingInformation: ['confirm_not_received'],
    });
    aiContext.build.mockResolvedValue({
      ticketNumber: 'SRH-2026-000001',
      category: 'OTHER_HELP',
      customerFirstName: 'متعب',
      customerDescription: 'طلبي ما وصل',
      missingInformation: [],
      recentMessages: [],
    });
    service = new SupportTicketsService(
      repo as never,
      notifications as never,
      prisma as never,
      logger as never,
      sockets as never,
      sarhan as never,
      aiContext as never,
    );
  });

  it('creates a help ticket with a server SRH number and welcome from backend first name', async () => {
    repo.createTicket.mockResolvedValue({
      id: 't1',
      ticketNumber: 'SRH-2026-000001',
      status: 'AI_ASSISTING',
      handlerMode: 'AI_ACTIVE',
      subject: 'مشكلة في الطلب',
      createdAt: new Date(),
    });
    repo.findTicketById.mockResolvedValue({
      id: 't1',
      ticketNumber: 'SRH-2026-000001',
      handlerMode: 'AI_ACTIVE',
      status: 'AI_ASSISTING',
      metadata: {},
      messages: [],
    });
    repo.findUserTicket.mockResolvedValue({
      id: 't1',
      ticketNumber: 'SRH-2026-000001',
      status: 'WAITING_FOR_CUSTOMER',
      handlerMode: 'AI_ACTIVE',
    });

    const result = await service.createTicket(user('cust-a'), {
      helpKind: 'OTHER_HELP',
      description: 'طلبي ما وصل',
    });

    expect(result.ticket.ticketNumber).toMatch(/^SRH-\d{4}-\d{6}$/);
    expect(repo.createTicket).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'OTHER_HELP',
        handlerMode: 'AI_ACTIVE',
        status: 'AI_ASSISTING',
      }),
    );
    expect(repo.createMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        authorKind: 'SARHAN',
        body: sarhanWelcome('متعب', SUPPORT_TICKET_CATEGORY_LABEL_AR.OTHER_HELP),
      }),
    );
    expect(sarhan.nextTurn).toHaveBeenCalled();
  });

  it('creates an OTHER_HELP ticket with null order', async () => {
    repo.createTicket.mockResolvedValue({
      id: 't2',
      ticketNumber: 'SRH-2026-000002',
      status: 'AI_ASSISTING',
      handlerMode: 'AI_ACTIVE',
      subject: 'مساعدة في شيء آخر',
      createdAt: new Date(),
    });
    repo.findTicketById.mockResolvedValue({
      id: 't2',
      ticketNumber: 'SRH-2026-000002',
      handlerMode: 'AI_ACTIVE',
      status: 'AI_ASSISTING',
      metadata: {},
      messages: [],
    });
    repo.findUserTicket.mockResolvedValue({
      id: 't2',
      ticketNumber: 'SRH-2026-000002',
    });

    await service.createTicket(user('cust-a'), {
      helpKind: 'OTHER_HELP',
      description: 'استفسار عن الحساب',
    });

    expect(repo.createTicket.mock.calls[0][0].order).toBeUndefined();
  });

  it('stores an existing support category on OTHER_HELP tickets', async () => {
    repo.createTicket.mockResolvedValue({
      id: 't-cat',
      ticketNumber: 'SRH-2026-000009',
      status: 'AI_ASSISTING',
      handlerMode: 'AI_ACTIVE',
      subject: 'الحساب',
      createdAt: new Date(),
    });
    repo.findTicketById.mockResolvedValue({
      id: 't-cat',
      handlerMode: 'AI_ACTIVE',
      status: 'AI_ASSISTING',
      metadata: {},
      messages: [],
    });
    repo.findUserTicket.mockResolvedValue({ id: 't-cat' });

    await service.createTicket(user('cust-a'), {
      helpKind: 'OTHER_HELP',
      category: 'ACCOUNT',
      description: 'لا أستطيع تغيير رقم الجوال',
    });

    expect(repo.createTicket.mock.calls[0][0].category).toBe('ACCOUNT');
    expect(repo.createTicket.mock.calls[0][0].subject).toBe('الحساب');
  });

  it('retries ticket numbers on unique conflict', async () => {
    repo.findLatestSrhTicketNumber
      .mockResolvedValueOnce({ ticketNumber: 'SRH-2026-000001' })
      .mockResolvedValueOnce({ ticketNumber: 'SRH-2026-000001' });
    repo.createTicket
      .mockRejectedValueOnce({ code: 'P2002' })
      .mockResolvedValueOnce({
        id: 't3',
        ticketNumber: 'SRH-2026-000002',
        status: 'AI_ASSISTING',
        handlerMode: 'AI_ACTIVE',
        subject: 'مساعدة في شيء آخر',
        createdAt: new Date(),
      });
    repo.findTicketById.mockResolvedValue({
      id: 't3',
      ticketNumber: 'SRH-2026-000002',
      handlerMode: 'HUMAN_ACTIVE',
      status: 'WAITING_FOR_SUPPORT',
      metadata: {},
    });
    repo.findUserTicket.mockResolvedValue({ id: 't3' });

    const result = await service.createTicket(user('cust-a'), {
      helpKind: 'OTHER_HELP',
      description: 'مشكلة عامة في التطبيق',
    });
    expect(result.ticket.ticketNumber).toBe('SRH-2026-000002');
    expect(repo.createTicket).toHaveBeenCalledTimes(2);
  });

  it('lets a customer read only their own ticket', async () => {
    repo.findUserTicket.mockResolvedValue({ id: 't-a', reporterId: 'cust-a' });
    await expect(service.getUserTicket(user('cust-a'), 't-a')).resolves.toEqual(
      {
        ticket: { id: 't-a', reporterId: 'cust-a' },
      },
    );
  });

  it('forbids IDOR access to another customer ticket', async () => {
    repo.findUserTicket.mockResolvedValue(null);
    await expect(
      service.getUserTicket(user('cust-a'), 't-b'),
    ).rejects.toBeInstanceOf(ApiException);
  });
  it('allows a customer to send a support message on their ticket', async () => {
    repo.findUserTicket.mockResolvedValue({
      id: 't1',
      status: 'AI_ASSISTING',
      handlerMode: 'AI_ACTIVE',
      ticketNumber: 'SRH-2026-000001',
      subject: 'مشكلة في الطلب',
    });
    repo.findTicketById.mockResolvedValue({
      id: 't1',
      ticketNumber: 'SRH-2026-000001',
      handlerMode: 'AI_ACTIVE',
      status: 'AI_ASSISTING',
      metadata: {},
    });
    await service.replyAsUser(user('cust-a'), 't1', { body: 'المنتج ناقص' });
    expect(repo.createMessage).toHaveBeenCalledWith(
      expect.objectContaining({ authorKind: 'CUSTOMER', isStaffReply: false }),
    );
  });

  it('allows staff to reply and stops automatic Sarhan replies', async () => {
    repo.findTicketById.mockResolvedValue({
      id: 't1',
      ticketNumber: 'SRH-2026-000001',
      status: 'WAITING_FOR_SUPPORT',
      handlerMode: 'AI_ACTIVE',
      reporterId: 'cust-a',
      adminNotes: null,
    });
    await service.replyAsStaff(user('mod-1', 'MODERATOR'), 't1', {
      body: 'معك خدمة العملاء',
    });
    expect(repo.updateTicket).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({
        handlerMode: 'HUMAN_ACTIVE',
        status: 'IN_PROGRESS',
      }),
    );
    expect(notifications.notifyStaffReply).toHaveBeenCalled();
  });

  it('does not let another customer access a ticket via socket helper', async () => {
    repo.findUserTicket.mockResolvedValue(null);
    await expect(
      service.getTicketForSocket(user('other-user'), 't-a'),
    ).resolves.toBeNull();
  });

  it('stops Sarhan automatic replies after human handoff', async () => {
    repo.findUserTicket.mockResolvedValue({
      id: 't1',
      status: 'WAITING_FOR_SUPPORT',
      handlerMode: 'HUMAN_ACTIVE',
      ticketNumber: 'SRH-2026-000001',
      subject: 'مشكلة في الطلب',
    });
    await service.replyAsUser(user('cust-a'), 't1', {
      body: 'ما زالت المشكلة',
    });
    expect(sarhan.nextTurn).not.toHaveBeenCalled();
  });

  it('ignores client-supplied ticketNumber/status/handlerMode on create', async () => {
    repo.createTicket.mockResolvedValue({
      id: 't4',
      ticketNumber: 'SRH-2026-000004',
      status: 'AI_ASSISTING',
      handlerMode: 'AI_ACTIVE',
      subject: 'مساعدة في شيء آخر',
      createdAt: new Date(),
    });
    repo.findTicketById.mockResolvedValue({
      id: 't4',
      ticketNumber: 'SRH-2026-000004',
      handlerMode: 'AI_ACTIVE',
      status: 'AI_ASSISTING',
      metadata: {},
    });
    repo.findUserTicket.mockResolvedValue({
      id: 't4',
      ticketNumber: 'SRH-2026-000004',
    });

    await service.createTicket(user('cust-a'), {
      helpKind: 'OTHER_HELP',
      description: 'استفسار عام عن التطبيق',
      ticketNumber: 'HACK-1',
      status: 'RESOLVED',
      handlerMode: 'HUMAN_ACTIVE',
    } as never);

    const created = repo.createTicket.mock.calls[0][0];
    expect(created.ticketNumber).toMatch(/^SRH-\d{4}-\d{6}$/);
    expect(created.ticketNumber).not.toBe('HACK-1');
    expect(created.status).toBe('AI_ASSISTING');
    expect(created.handlerMode).toBe('AI_ACTIVE');
  });

  it('ignores client attempts to spoof staff authorKind on reply', async () => {
    repo.findUserTicket.mockResolvedValue({
      id: 't1',
      status: 'WAITING_FOR_SUPPORT',
      handlerMode: 'HUMAN_ACTIVE',
      ticketNumber: 'SRH-2026-000001',
      subject: 'مشكلة في الطلب',
    });
    await service.replyAsUser(user('cust-a'), 't1', {
      body: 'رد مزيف',
      authorKind: 'STAFF',
      isStaffReply: true,
    } as never);
    expect(repo.createMessage).toHaveBeenCalledWith(
      expect.objectContaining({ authorKind: 'CUSTOMER', isStaffReply: false }),
    );
  });
  it('escalates via Sarhan into WAITING_FOR_SUPPORT + HUMAN_ACTIVE without MessageThread', async () => {
    repo.findUserTicket.mockResolvedValue({
      id: 't1',
      status: 'AI_ASSISTING',
      handlerMode: 'AI_ACTIVE',
      ticketNumber: 'SRH-2026-000001',
      subject: 'مشكلة في الطلب',
    });
    repo.findTicketById.mockResolvedValue({
      id: 't1',
      ticketNumber: 'SRH-2026-000001',
      handlerMode: 'AI_ACTIVE',
      status: 'AI_ASSISTING',
      metadata: {},
      messages: [],
    });
    sarhan.nextTurn.mockResolvedValue({
      replyAr: 'تم تسجيل طلبك',
      escalate: true,
      metadata: { issueType: 'REFUND_ISSUE' },
      missingInformation: [],
    });

    await service.replyAsUser(user('cust-a'), 't1', {
      body: 'أبي استرجع فلوسي',
    });

    expect(repo.updateTicket).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({
        status: 'WAITING_FOR_SUPPORT',
        handlerMode: 'HUMAN_ACTIVE',
      }),
    );
    expect(repo.createMessage).toHaveBeenCalledWith(
      expect.objectContaining({ authorKind: 'SARHAN' }),
    );
    expect(sockets.emitToTicket).toHaveBeenCalled();
  });

  it('sets HUMAN_ACTIVE when admin moves ticket into support statuses', async () => {
    repo.findTicketById.mockResolvedValue({
      id: 't1',
      ticketNumber: 'SRH-2026-000001',
      status: 'AI_ASSISTING',
      handlerMode: 'AI_ACTIVE',
      reporterId: 'cust-a',
      assignedToId: null,
    });
    await service.updateAdminTicket(user('mod-1', 'MODERATOR'), 't1', {
      status: 'WAITING_FOR_SUPPORT',
    });
    expect(repo.updateTicket).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({
        handlerMode: 'HUMAN_ACTIVE',
        status: 'WAITING_FOR_SUPPORT',
      }),
    );
  });
});
