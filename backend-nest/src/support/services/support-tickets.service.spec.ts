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

/** The assistant turn is scheduled after the HTTP handler returns. */
function flushScheduledTurn() {
  return new Promise((resolve) => setImmediate(resolve));
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
    findReporterTier: jest.fn(),
    claimHumanHandoff: jest.fn(),
  };
  const notifications = {
    notifyTicketCreated: jest.fn(),
    notifyUserReply: jest.fn(),
    notifyStaffReply: jest.fn(),
    notifyTicketStatusChanged: jest.fn(),
    notifyTicketAwaitingUser: jest.fn(),
    notifyTicketClosed: jest.fn(),
    notifyEscalatedToHuman: jest.fn(),
  };
  const prisma = {
    user: { findMany: jest.fn() },
  };
  const logger = { info: jest.fn(), warn: jest.fn() };
  const sockets = { emitToTicket: jest.fn() };
  const sarhan = { nextTurn: jest.fn() };
  const aiContext = { build: jest.fn() };

  let service: SupportTicketsService;

  beforeEach(async () => {
    await flushScheduledTurn();
    jest.clearAllMocks();
    repo.findUserNames.mockResolvedValue({
      arabicName: 'متعب العتيبي',
      displayName: 'Muteb',
    });
    repo.findLatestSrhTicketNumber.mockResolvedValue(null);
    repo.findReporterTier.mockResolvedValue({ verifiedTier: null });
    repo.claimHumanHandoff.mockResolvedValue(true);
    notifications.notifyEscalatedToHuman.mockResolvedValue('queued');
    repo.createMessage.mockResolvedValue({ id: 'm1', body: 'x' });
    repo.updateTicket.mockImplementation(
      async (id: string, data: Record<string, unknown>) => ({
        id,
        ticketNumber: 'SRH-2026-000001',
        ...data,
      }),
    );
    sarhan.nextTurn.mockResolvedValue({
      replyAr: 'جرّب «إعادة إرسال الرمز».',
      escalate: false,
      metadata: { issueType: 'ACCOUNT_ISSUE' },
      missingInformation: [],
    });
    aiContext.build.mockResolvedValue({
      ticketNumber: 'SRH-2026-000001',
      category: 'OTHER_HELP',
      customerFirstName: 'متعب',
      customerDescription: 'ما جاني الكود',
      missingInformation: [],
      recentMessages: [],
      knowledge: [],
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

  afterEach(async () => {
    await flushScheduledTurn();
  });

  it('creates a help ticket with a server SRH number and welcome from backend first name', async () => {
    repo.createTicket.mockResolvedValue({
      id: 't1',
      ticketNumber: 'SRH-2026-000001',
      status: 'AI_ASSISTING',
      handlerMode: 'AI_ACTIVE',
      subject: 'مشكلة في حسابي',
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
      description: 'ما جاني الكود',
    });
    await flushScheduledTurn();

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
        body: sarhanWelcome(
          'متعب',
          SUPPORT_TICKET_CATEGORY_LABEL_AR.OTHER_HELP,
        ),
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
      subject: 'مشكلة في حسابي',
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
      subject: 'مشكلة في حسابي',
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
      subject: 'مشكلة في حسابي',
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
      subject: 'مشكلة في حسابي',
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
      replyAr: 'حوّلت طلبك لفريق خدمة العملاء',
      escalate: true,
      metadata: { issueType: 'REFUND_ISSUE' },
      missingInformation: [],
    });

    await service.replyAsUser(user('cust-a'), 't1', {
      body: 'أبي استرجع فلوسي',
    });
    await flushScheduledTurn();

    expect(repo.claimHumanHandoff).toHaveBeenCalledWith('t1');
    const metadataWrite = repo.updateTicket.mock.calls.find(
      (call) =>
        call[1] &&
        typeof call[1] === 'object' &&
        'metadata' in (call[1] as object),
    );
    expect(metadataWrite?.[1]).toEqual({
      metadata: { issueType: 'REFUND_ISSUE' },
    });
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

  describe('default priority (Gold → HIGH)', () => {
    const created = {
      id: 't9',
      ticketNumber: 'SUP-X-001',
      status: 'OPEN',
      handlerMode: 'HUMAN_ACTIVE',
      subject: 's',
      createdAt: new Date(),
    };

    it('creates Gold subscriber tickets with HIGH priority', async () => {
      repo.findReporterTier.mockResolvedValue({ verifiedTier: 'gold' });
      repo.createTicket.mockResolvedValue(created);
      await service.createTicket(user('gold-user'), {
        category: 'ACCOUNT',
        subject: 'مشكلة في حسابي',
        description: 'ما أقدر أدخل حسابي من أمس',
      });
      expect(repo.findReporterTier).toHaveBeenCalledWith('gold-user');
      expect(repo.createTicket.mock.calls[0][0].priority).toBe('HIGH');
    });

    it('keeps NORMAL priority for Blue / Blue+ / free accounts', async () => {
      for (const tier of ['blue', 'blue_plus', null]) {
        repo.createTicket.mockClear();
        repo.findReporterTier.mockResolvedValue({ verifiedTier: tier });
        repo.createTicket.mockResolvedValue(created);
        await service.createTicket(user('u1'), {
          category: 'ACCOUNT',
          subject: 'مشكلة في حسابي',
          description: 'ما أقدر أدخل حسابي من أمس',
        });
        expect(repo.createTicket.mock.calls[0][0].priority).toBe('NORMAL');
      }
    });

    it('gives Gold help tickets (مساعد سرح) HIGH priority too', async () => {
      repo.findReporterTier.mockResolvedValue({ verifiedTier: 'gold' });
      repo.createTicket.mockResolvedValue({
        ...created,
        status: 'AI_ASSISTING',
        handlerMode: 'AI_ACTIVE',
      });
      repo.findTicketById.mockResolvedValue(null);
      repo.findUserTicket.mockResolvedValue(null);
      await service.createTicket(user('gold-user'), {
        helpKind: 'OTHER_HELP',
        description: 'ما جاني الكود',
      });
      expect(repo.createTicket.mock.calls[0][0].priority).toBe('HIGH');
    });

    it('marks help-center fraud reports HIGH', async () => {
      repo.createTicket.mockResolvedValue(created);
      await service.createTicket(user('u2'), {
        category: 'FRAUD',
        subject: 'بلاغ احتيال',
        description: 'البائع أخذ العربون وحظرني',
      });
      expect(repo.createTicket.mock.calls[0][0].priority).toBe('HIGH');
    });

    it('falls back to NORMAL when the tier lookup fails', async () => {
      repo.findReporterTier.mockRejectedValue(new Error('db'));
      repo.createTicket.mockResolvedValue(created);
      await service.createTicket(user('u3'), {
        category: 'ACCOUNT',
        subject: 'مشكلة في حسابي',
        description: 'ما أقدر أدخل حسابي من أمس',
      });
      expect(repo.createTicket.mock.calls[0][0].priority).toBe('NORMAL');
    });
  });

  describe('Phase 0: handoff alert + kill switches', () => {
    it('returns the HTTP reply before the model finishes, then pings the open ticket', async () => {
      const ticketId = '0f8fad5b-d9cb-469f-a165-70867728950e';
      const bridge = { notify: jest.fn() };
      const local = new SupportTicketsService(
        repo as never,
        notifications as never,
        prisma as never,
        logger as never,
        sockets as never,
        sarhan as never,
        aiContext as never,
        bridge as never,
      );
      repo.findUserTicket.mockResolvedValue({
        id: ticketId,
        status: 'AI_ASSISTING',
        handlerMode: 'AI_ACTIVE',
        ticketNumber: 'SRH-2026-000001',
        subject: 'مشكلة',
      });
      repo.findTicketById.mockResolvedValue({
        id: ticketId,
        ticketNumber: 'SRH-2026-000001',
        handlerMode: 'AI_ACTIVE',
        status: 'AI_ASSISTING',
        priority: 'NORMAL',
        metadata: {},
        messages: [],
      });
      let release: (value: unknown) => void = () => undefined;
      sarhan.nextTurn.mockReturnValue(
        new Promise((resolve) => {
          release = resolve;
        }),
      );
      await expect(
        local.replyAsUser(user('cust-a'), ticketId, { body: 'ابي اميز اعلاني' }),
      ).resolves.toEqual(expect.objectContaining({ message: expect.anything() }));
      expect(sarhan.nextTurn).not.toHaveBeenCalled();

      await flushScheduledTurn();
      expect(sarhan.nextTurn).toHaveBeenCalledTimes(1);
      release({
        replyAr: 'تمييز الإعلان من صفحة الإعلان',
        escalate: false,
        metadata: {},
        missingInformation: [],
      });
      await flushScheduledTurn();
      expect(sockets.emitToTicket).toHaveBeenCalledWith(
        ticketId,
        'support:message',
        expect.objectContaining({
          authorKind: 'SARHAN',
          body: 'تمييز الإعلان من صفحة الإعلان',
        }),
      );
      expect(bridge.notify).toHaveBeenCalledWith(ticketId);
      expect(JSON.stringify(bridge.notify.mock.calls)).not.toContain('تمييز');
    });

    const env = { ...process.env };
    afterEach(() => {
      process.env = { ...env };
    });

    const aiTicket = {
      id: 't1',
      ticketNumber: 'SRH-2026-000001',
      handlerMode: 'AI_ACTIVE',
      status: 'AI_ASSISTING',
      priority: 'HIGH',
      metadata: {},
      messages: [],
    };

    function primeReply() {
      repo.findUserTicket.mockResolvedValue({
        ...aiTicket,
        subject: 'مشكلة',
      });
      repo.findTicketById.mockResolvedValue(aiTicket);
    }

    it('alerts once on the real AI → human transition, with reason and priority only', async () => {
      primeReply();
      sarhan.nextTurn.mockResolvedValue({
        replyAr: 'حوّلت طلبك',
        escalate: true,
        escalationReason: 'refund',
        metadata: {},
        missingInformation: [],
      });
      await service.replyAsUser(user('cust-a'), 't1', {
        body: 'أبي استرجع فلوسي',
      });
      await flushScheduledTurn();
      expect(repo.claimHumanHandoff).toHaveBeenCalledWith('t1');
      expect(notifications.notifyEscalatedToHuman).toHaveBeenCalledTimes(1);
      expect(notifications.notifyEscalatedToHuman).toHaveBeenCalledWith({
        id: 't1',
        ticketNumber: 'SRH-2026-000001',
        priority: 'HIGH',
        reason: 'refund',
      });
    });

    it('does not rewrite status after the atomic handoff if staff already replied', async () => {
      primeReply();
      let staffReplyLanded = false;
      repo.claimHumanHandoff.mockImplementation(async () => {
        staffReplyLanded = true;
        return true;
      });
      repo.updateTicket.mockImplementation(
        async (id: string, data: Record<string, unknown>) => {
          // A staff reply between the claim and this write sets IN_PROGRESS.
          // Copying status/handlerMode here would undo that reply.
          if (
            staffReplyLanded &&
            ('status' in data || 'handlerMode' in data)
          ) {
            return {
              id,
              ticketNumber: 'SRH-2026-000001',
              status: data.status,
              handlerMode: data.handlerMode,
            };
          }
          return {
            id,
            ticketNumber: 'SRH-2026-000001',
            status: staffReplyLanded ? 'IN_PROGRESS' : 'AI_ASSISTING',
            handlerMode: staffReplyLanded ? 'HUMAN_ACTIVE' : 'AI_ACTIVE',
            ...data,
          };
        },
      );
      sarhan.nextTurn.mockResolvedValue({
        replyAr: 'حوّلت طلبك',
        escalate: true,
        escalationReason: 'refund',
        metadata: { issueType: 'PAYMENT_ISSUE' },
        missingInformation: [],
      });
      await service.replyAsUser(user('cust-a'), 't1', {
        body: 'أبي استرجع فلوسي',
      });
      await flushScheduledTurn();
      const handoffWrite = repo.updateTicket.mock.calls.find(
        (call) =>
          call[1] &&
          typeof call[1] === 'object' &&
          'metadata' in (call[1] as object),
      );
      expect(handoffWrite).toBeDefined();
      const data = handoffWrite![1] as Record<string, unknown>;
      expect(data).not.toHaveProperty('status');
      expect(data).not.toHaveProperty('handlerMode');
      expect(data.metadata).toEqual({ issueType: 'PAYMENT_ISSUE' });
      expect(notifications.notifyEscalatedToHuman).toHaveBeenCalledTimes(1);
    });

    it('no alert when the transition was already claimed (retry / concurrent turn)', async () => {
      primeReply();
      repo.claimHumanHandoff.mockResolvedValue(false);
      sarhan.nextTurn.mockResolvedValue({
        replyAr: 'حوّلت طلبك',
        escalate: true,
        metadata: {},
        missingInformation: [],
      });
      await service.replyAsUser(user('cust-a'), 't1', { body: 'موظف' });
      await flushScheduledTurn();
      expect(notifications.notifyEscalatedToHuman).not.toHaveBeenCalled();
      // staff status is not overwritten
      const data = repo.updateTicket.mock.calls[
        repo.updateTicket.mock.calls.length - 1
      ]?.[1] as Record<string, unknown>;
      expect(data.status).not.toBe('WAITING_FOR_SUPPORT');
    });

    it('no alert and no handoff claim on a normal (non-escalating) turn', async () => {
      primeReply();
      await service.replyAsUser(user('cust-a'), 't1', {
        body: 'ما جاني الكود',
      });
      await flushScheduledTurn();
      expect(repo.claimHumanHandoff).not.toHaveBeenCalled();
      expect(notifications.notifyEscalatedToHuman).not.toHaveBeenCalled();
    });

    it('ticket creation still succeeds when the e-mail alert throws', async () => {
      repo.createTicket.mockResolvedValue({
        ...aiTicket,
        subject: 's',
        createdAt: new Date(),
      });
      repo.findTicketById.mockResolvedValue(aiTicket);
      repo.findUserTicket.mockResolvedValue({
        ...aiTicket,
        status: 'WAITING_FOR_SUPPORT',
        handlerMode: 'HUMAN_ACTIVE',
      });
      sarhan.nextTurn.mockResolvedValue({
        replyAr: '',
        escalate: true,
        escalationReason: 'low_confidence',
        metadata: {},
        missingInformation: [],
      });
      notifications.notifyEscalatedToHuman.mockRejectedValue(
        new Error('smtp down'),
      );
      const res = await service.createTicket(user('cust-a'), {
        helpKind: 'OTHER_HELP',
        description: 'عندي مشكلة غريبة ما لها وصف',
      });
      await flushScheduledTurn();
      expect(res.ticket.ticketNumber).toBe('SRH-2026-000001');
      expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('smtp down');
    });

    it.each([
      ['SARH_ASSISTANT_ENABLED', 'false'],
      ['SARH_AI_ENABLED', 'false'],
    ])(
      '%s=%s: help ticket goes straight to staff, assistant not run',
      async (key, value) => {
        process.env[key] = value;
        repo.createTicket.mockResolvedValue({
          ...aiTicket,
          subject: 's',
          createdAt: new Date(),
        });
        repo.findTicketById.mockResolvedValue(aiTicket);
        repo.findUserTicket.mockResolvedValue({
          ...aiTicket,
          status: 'WAITING_FOR_SUPPORT',
          handlerMode: 'HUMAN_ACTIVE',
        });

        const res = await service.createTicket(user('cust-a'), {
          helpKind: 'OTHER_HELP',
          description: 'ما جاني الكود',
        });
        await flushScheduledTurn();

        expect((res.ticket as { handlerMode?: string }).handlerMode).toBe(
          'HUMAN_ACTIVE',
        );
        expect(sarhan.nextTurn).not.toHaveBeenCalled();
        expect(aiContext.build).not.toHaveBeenCalled();
        expect(repo.claimHumanHandoff).toHaveBeenCalledWith('t1');
        const bodies = repo.createMessage.mock.calls.map((c) => c[0].body);
        expect(bodies.some((b: string) => b.startsWith('هلا '))).toBe(false);
        expect(bodies).toContain('ما جاني الكود');
        expect(notifications.notifyEscalatedToHuman).toHaveBeenCalledWith(
          expect.objectContaining({ reason: 'assistant_disabled' }),
        );
        // the customer still gets the normal "ticket created" notification
        expect(notifications.notifyTicketCreated).toHaveBeenCalled();
      },
    );

    it('assistant off: a reply on an AI ticket is handed to staff, no model turn', async () => {
      process.env.SARH_ASSISTANT_ENABLED = 'off';
      primeReply();
      await service.replyAsUser(user('cust-a'), 't1', { body: 'وش صار؟' });
      await flushScheduledTurn();
      expect(sarhan.nextTurn).not.toHaveBeenCalled();
      expect(repo.claimHumanHandoff).toHaveBeenCalledWith('t1');
    });

    it('switches default ON: unset / "true" keep the assistant running', async () => {
      process.env.SARH_ASSISTANT_ENABLED = 'true';
      delete process.env.SARH_AI_ENABLED;
      primeReply();
      await service.replyAsUser(user('cust-a'), 't1', {
        body: 'ما جاني الكود',
      });
      await flushScheduledTurn();
      expect(sarhan.nextTurn).toHaveBeenCalledTimes(1);
    });

    it('human support keeps working with AI off (staff reply unaffected)', async () => {
      process.env.SARH_AI_ENABLED = 'false';
      repo.findTicketById.mockResolvedValue({
        ...aiTicket,
        handlerMode: 'HUMAN_ACTIVE',
        reporterId: 'cust-a',
      });
      const res = await service.replyAsStaff(user('mod-1', 'MODERATOR'), 't1', {
        body: 'هلا، نشيّك لك',
      });
      expect(res.message).toBeDefined();
      expect(notifications.notifyStaffReply).toHaveBeenCalled();
    });
  });
});
