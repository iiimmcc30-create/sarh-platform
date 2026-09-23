import { FeesService } from './fees.service';
import { calculateListingFeeAmount } from '../listings/listing-fee';

describe('FeesService.quoteForOwner', () => {
  const prisma = {
    listingFee: {
      findFirst: jest.fn(),
    },
  };

  const service = new FeesService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('computes 10000 → 100 for the owner only', async () => {
    prisma.listingFee.findFirst.mockResolvedValue({
      id: 'fee-1',
      status: 'pending',
      listingId: 'l1',
    });

    const quote = await service.quoteForOwner('u1', 'l1', 10000);
    expect(quote.commission).toBe(100);
    expect(quote.ratePercent).toBe(1);
    expect(prisma.listingFee.findFirst).toHaveBeenCalledWith({
      where: { listingId: 'l1', userId: 'u1' },
      select: { id: true, status: true, listingId: true },
    });
  });

  it("rejects another user quoting someone else's listing", async () => {
    prisma.listingFee.findFirst.mockResolvedValue(null);
    await expect(
      service.quoteForOwner('eve', 'l1', 10000),
    ).rejects.toMatchObject({
      error: 'fee_not_found',
    });
  });

  it('quotes 1% of the client-declared saleAmount, not a listing row price', async () => {
    prisma.listingFee.findFirst.mockResolvedValue({
      id: 'fee-1',
      status: 'pending',
      listingId: 'listing-1',
    });
    const quoted = await service.quoteForOwner('u1', 'listing-1', 1);
    expect(quoted.saleAmount).toBe(1);
    expect(quoted.commission).toBe(calculateListingFeeAmount(1));
    expect(quoted.commission).toBe(0.01);
  });

  it('does not collapse two different declared sale amounts', async () => {
    prisma.listingFee.findFirst.mockResolvedValue({
      id: 'fee-1',
      status: 'pending',
      listingId: 'listing-1',
    });
    const low = await service.quoteForOwner('u1', 'listing-1', 1);
    const high = await service.quoteForOwner('u1', 'listing-1', 10000);
    expect(low.commission).not.toBe(high.commission);
    expect(high.commission).toBe(100);
  });
});
