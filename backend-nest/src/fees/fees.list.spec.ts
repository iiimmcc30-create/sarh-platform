import { FeesService } from './fees.service';
import { isListingFeeOwed, OWED_LISTING_FEE_WHERE } from '../listings/listing-fee-owed';

const row = (over: Record<string, unknown>) => ({
  id: 'f1',
  listingId: 'l1',
  price: 1000,
  saleAmount: null,
  commission: 10,
  status: 'pending',
  dueDate: new Date('2026-08-01T00:00:00Z'),
  paidAt: null,
  transactionId: null,
  createdAt: new Date('2026-07-01T00:00:00Z'),
  listing: { id: 'l1', arabicTitle: 'خروف', category: 'sheep', deletedAt: null, sellerDeclaredSold: null },
  ...over,
});

describe('FeesService.listForUser (commission only when sold, optional)', () => {
  const prisma = { listingFee: { findMany: jest.fn() } };
  const service = new FeesService(prisma as never, { getFlags: jest.fn() } as never);

  beforeEach(() => jest.clearAllMocks());

  it('queries only paid fees or unpaid fees with a declared sale / sale amount', async () => {
    prisma.listingFee.findMany.mockResolvedValue([]);
    await service.listForUser('u1');
    const where = prisma.listingFee.findMany.mock.calls[0][0].where;
    expect(where.userId).toBe('u1');
    expect(where.OR).toEqual([{ status: 'paid' }, OWED_LISTING_FEE_WHERE]);
    expect(OWED_LISTING_FEE_WHERE).toEqual({
      status: { in: ['pending', 'overdue'] },
      OR: [{ saleAmount: { not: null } }, { listing: { sellerDeclaredSold: true } }],
    });
  });

  it('never reports overdue, a due date, or an asking-price commission', async () => {
    prisma.listingFee.findMany.mockResolvedValue([
      row({ id: 'a', status: 'overdue', listing: { ...row({}).listing, sellerDeclaredSold: true } }),
      row({ id: 'b', status: 'pending', saleAmount: 5000, commission: 50 }),
      row({ id: 'c', status: 'paid', commission: 20, paidAt: new Date() }),
    ]);
    const out = await service.listForUser('u1');
    expect(out.fees.map((f) => f.status)).toEqual(['pending', 'pending', 'paid']);
    expect(out.fees.every((f) => f.dueDate === null)).toBe(true);
    // Declared sold without an amount: commission unknown until the seller enters the sale amount.
    expect(out.fees[0].commission).toBeNull();
    expect(out.fees[1].commission).toBe(50);
    expect(out.fees.map((f) => f.owed)).toEqual([true, true, false]);
    expect(out.summary).toEqual({ owedCount: 2, owedTotal: 50 });
    expect(out.optional).toBe(true);
  });

  it('returns an empty list (nothing owed) when the user sold nothing', async () => {
    prisma.listingFee.findMany.mockResolvedValue([]);
    const out = await service.listForUser('u1');
    expect(out.fees).toEqual([]);
    expect(out.summary).toEqual({ owedCount: 0, owedTotal: 0 });
  });
});

describe('isListingFeeOwed', () => {
  it('is owed only for unpaid fees on sold listings or with a sale amount', () => {
    expect(isListingFeeOwed({ status: 'pending', saleAmount: null, listing: { sellerDeclaredSold: null } })).toBe(false);
    expect(isListingFeeOwed({ status: 'overdue', saleAmount: null, listing: { sellerDeclaredSold: false } })).toBe(false);
    expect(isListingFeeOwed({ status: 'overdue', saleAmount: null, listing: { sellerDeclaredSold: true } })).toBe(true);
    expect(isListingFeeOwed({ status: 'pending', saleAmount: 100, listing: null })).toBe(true);
    expect(isListingFeeOwed({ status: 'paid', saleAmount: 100, listing: null })).toBe(false);
    expect(isListingFeeOwed({ status: 'waived', saleAmount: null, listing: { sellerDeclaredSold: true } })).toBe(false);
  });
});
