import { SupportRepository } from '../repositories/support.repository';
import {
  reportStateFor,
  SupportTicketsService,
  toUserReportRow,
} from './support-tickets.service';
import { ApiException } from '../../common/exceptions/api.exception';
import type { JwtPayload } from '../../common/types/jwt-payload.interface';

function user(id: string): JwtPayload {
  return { userId: id, username: id, role: 'USER' };
}

describe('«بلاغاتي» — user report tickets', () => {
  describe('SupportRepository scoping', () => {
    const prisma = {
      supportTicket: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const repo = new SupportRepository(prisma as never);

    beforeEach(() => jest.clearAllMocks());

    it('lists only the requesting user’s REPORT/FRAUD tickets', async () => {
      await repo.listUserReportTickets('user-a', 2, 10);
      const args = prisma.supportTicket.findMany.mock.calls[0][0];
      expect(args.where).toEqual({
        deletedAt: null,
        reporterId: 'user-a',
        OR: [{ type: 'REPORT' }, { category: 'FRAUD' }],
      });
      expect(args.skip).toBe(10);
      expect(args.take).toBe(10);
      expect(prisma.supportTicket.count.mock.calls[0][0].where).toEqual(
        args.where,
      );
      // never select staff-only fields
      expect(args.select.adminNotes).toBeUndefined();
      expect(args.select.assignedTo).toBeUndefined();
    });

    it('status filter never widens the reporterId scope', async () => {
      await repo.listUserReportTickets('user-b', 1, 20, ['RESOLVED', 'CLOSED']);
      const where = prisma.supportTicket.findMany.mock.calls[0][0].where;
      expect(where.reporterId).toBe('user-b');
      expect(where.status).toEqual({ in: ['RESOLVED', 'CLOSED'] });
    });

    it('thread lookup is reporter-scoped and allows own REPORT tickets', async () => {
      await repo.findUserTicket('t1', 'user-a');
      const where = prisma.supportTicket.findFirst.mock.calls[0][0].where;
      expect(where).toMatchObject({
        id: 't1',
        reporterId: 'user-a',
        type: { in: ['SUPPORT', 'REPORT'] },
        deletedAt: null,
      });
    });
  });

  describe('SupportTicketsService.listUserReports', () => {
    const repo = { listUserReportTickets: jest.fn() };
    const service = new SupportTicketsService(
      repo as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    beforeEach(() => {
      jest.clearAllMocks();
      repo.listUserReportTickets.mockResolvedValue({
        items: [
          {
            id: 'r1',
            ticketNumber: 'RPT-1',
            type: 'REPORT',
            category: 'REPORT',
            status: 'IN_REVIEW',
            subject: 'بلاغ على إعلان: احتيال',
            description:
              'النوع: listing\nالمعرّف: L1\nالسبب: احتيال\nالمُبلِغ: a (user-a)',
            metadata: null,
            createdAt: new Date('2026-10-01T00:00:00Z'),
            updatedAt: new Date('2026-10-02T00:00:00Z'),
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      });
    });

    it('always queries with the caller’s own userId', async () => {
      await service.listUserReports(user('user-a'), { reporterId: 'user-b' });
      expect(repo.listUserReportTickets).toHaveBeenCalledWith(
        'user-a',
        1,
        20,
        undefined,
      );
    });

    it('maps rows without leaking the raw description', async () => {
      const res = await service.listUserReports(user('user-a'), {});
      expect(res.items[0]).toEqual({
        id: 'r1',
        ticketNumber: 'RPT-1',
        kind: 'REPORT',
        subject: 'بلاغ على إعلان: احتيال',
        reason: 'احتيال',
        targetType: 'listing',
        status: 'IN_REVIEW',
        state: 'review',
        createdAt: new Date('2026-10-01T00:00:00Z'),
        updatedAt: new Date('2026-10-02T00:00:00Z'),
      });
      expect(res.items[0]).not.toHaveProperty('description');
    });

    it('maps the state filter to ticket statuses', async () => {
      await service.listUserReports(user('user-a'), { state: 'closed' });
      expect(repo.listUserReportTickets).toHaveBeenCalledWith('user-a', 1, 20, [
        'RESOLVED',
        'CLOSED',
      ]);
    });

    it('rejects invalid query', async () => {
      await expect(
        service.listUserReports(user('user-a'), { state: 'nope' }),
      ).rejects.toBeInstanceOf(ApiException);
    });
  });

  it('pill mapping + FRAUD rows', () => {
    expect(reportStateFor('OPEN')).toBe('open');
    expect(reportStateFor('AWAITING_USER')).toBe('open');
    expect(reportStateFor('IN_PROGRESS')).toBe('review');
    expect(reportStateFor('CLOSED')).toBe('closed');
    const row = toUserReportRow({
      id: 'f1',
      ticketNumber: 'SRH-2026-000009',
      type: 'SUPPORT',
      category: 'FRAUD',
      status: 'OPEN',
      subject: 'بلاغ احتيال',
      description: 'تفاصيل',
      metadata: { reason: 'تحويل بدون استلام' },
      createdAt: new Date(0),
      updatedAt: new Date(0),
    });
    expect(row.kind).toBe('FRAUD');
    expect(row.targetType).toBeNull();
    expect(row.reason).toBe('تحويل بدون استلام');
  });
});
