import { FeesService } from './fees.service';
import { calculateListingFeeAmount } from '../listings/listing-fee';

describe('FeesService.quoteForOwner', () => {
  const prisma = {
    listingFee: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    listing: {
      findUnique: jest.fn(),
    },
  };
  const paidServices = {
    getFlags: jest.fn().mockResolvedValue({ listingFeesEnabled: true }),
  };

  const service = new FeesService(prisma as never, paidServices as never);

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
      where: { userId: 'u1', OR: [{ id: 'l1' }, { listingId: 'l1' }] },
      select: { id: true, listingId: true, status: true },
    });
  });

  it("rejects another user quoting someone else's listing", async () => {
    prisma.listingFee.findFirst.mockResolvedValue(null);
    prisma.listing.findUnique.mockResolvedValue({
      id: 'l1',
      sellerId: 'owner',
      origin: 'USER',
      deletedAt: null,
      category: 'camels',
      quantity: 1,
      price: 1000,
    });
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

  it('rejects a PAID fee with fee_already_paid (D)', async () => {
    prisma.listingFee.findFirst.mockResolvedValue({
      id: 'fee-1',
      status: 'paid',
      listingId: 'l1',
    });
    await expect(
      service.quoteForOwner('u1', 'l1', 10000),
    ).rejects.toMatchObject({
      error: 'fee_already_paid',
      status: 409,
    });
  });

  it('lazily creates the fee for a legacy listing the owner publishes without one (A)', async () => {
    prisma.listingFee.findFirst.mockResolvedValue(null);
    prisma.listing.findUnique.mockResolvedValue({
      id: 'l1',
      sellerId: 'u1',
      origin: 'USER',
      deletedAt: null,
      category: 'sheep',
      quantity: 1,
      price: 1500,
    });
    prisma.listingFee.create.mockResolvedValue({
      id: 'fee-new',
      listingId: 'l1',
      status: 'pending',
    });
    const quote = await service.quoteForOwner('u1', 'l1', 10000);
    expect(quote).toMatchObject({
      feeId: 'fee-new',
      commission: 100,
      status: 'pending',
    });
    expect(prisma.listingFee.create).toHaveBeenCalledTimes(1);
  });

  it('does not create a fee while listing fees are disabled', async () => {
    paidServices.getFlags.mockResolvedValueOnce({ listingFeesEnabled: false });
    prisma.listingFee.findFirst.mockResolvedValue(null);
    prisma.listing.findUnique.mockResolvedValue({
      id: 'l1',
      sellerId: 'u1',
      origin: 'USER',
      deletedAt: null,
      category: 'sheep',
      quantity: 1,
      price: 1500,
    });
    await expect(
      service.quoteForOwner('u1', 'l1', 10000),
    ).rejects.toMatchObject({
      error: 'service_disabled',
    });
    expect(prisma.listingFee.create).not.toHaveBeenCalled();
  });
});
