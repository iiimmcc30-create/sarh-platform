import { ListingsService } from './listings.service';
import { ApiException } from '../common/exceptions/api.exception';

const baseDto = {
  title: 'Sheep',
  arabicTitle: 'أغنام',
  description: 'وصف كافٍ للإعلان هنا',
  arabicDescription: 'وصف كافٍ للإعلان هنا',
  price: 10000,
  category: 'equipment' as const,
  location: 'Riyadh',
  arabicLocation: 'الرياض',
  country: 'SA' as const,
  images: ['https://cdn.example/a.jpg'],
};

describe('ListingsService listing fee + covenant', () => {
  const repo = {
    createListingWithFee: jest.fn(),
    findSellerId: jest.fn(),
    softDelete: jest.fn(),
  };
  const cache = {
    del: jest.fn(),
    delPattern: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
  };
  const logger = { info: jest.fn(), error: jest.fn(), warn: jest.fn() };
  const feeCheckQueue = { scheduleFeeCheck: jest.fn() };
  const notifications = { notifyUser: jest.fn() };
  const entitlements = {
    assertCanCreateListing: jest.fn().mockResolvedValue('free'),
  };
  const paidServices = {
    getFlags: jest.fn().mockResolvedValue({ listingFeesEnabled: true }),
  };

  let service: ListingsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ListingsService(
      repo as never,
      {} as never,
      cache as never,
      logger as never,
      feeCheckQueue as never,
      notifications as never,
      entitlements as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      paidServices as never,
    );
  });

  it('does not publish without covenant when listing fees are enabled', async () => {
    await expect(
      service.create({ userId: 'u1', username: 'u', role: 'USER' }, baseDto),
    ).rejects.toMatchObject({ error: 'covenant_required', status: 403 });
    expect(repo.createListingWithFee).not.toHaveBeenCalled();
  });

  it('creates a 1% ListingFee after covenant and does not notify about the fee', async () => {
    repo.createListingWithFee.mockResolvedValue({
      id: 'l1',
      fee: { id: 'f1', commission: 100 },
    });

    await service.create(
      { userId: 'u1', username: 'u', role: 'USER' },
      {
        ...baseDto,
        acceptedCovenant: true,
        covenantVersion: 'listing-covenant-v2',
      },
    );

    expect(repo.createListingWithFee).toHaveBeenCalledWith(
      expect.objectContaining({
        createFee: true,
        commission: 100,
        dueDate: null,
      }),
    );
    expect(feeCheckQueue.scheduleFeeCheck).not.toHaveBeenCalled();
    expect(notifications.notifyUser).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'system',
        bodyAr: expect.not.stringMatching(/رسوم|عمولة|٧ أيام|7/),
      }),
    );
  });

  it('does not create a second fee on delete (sold or not)', async () => {
    repo.findSellerId.mockResolvedValue({ sellerId: 'u1' });
    repo.softDelete.mockResolvedValue({});

    await service.remove({ userId: 'u1', username: 'u', role: 'USER' }, 'l1', {
      sold: true,
      reason: 'تم البيع خارج المنصة',
    });
    await service.remove({ userId: 'u1', username: 'u', role: 'USER' }, 'l1', {
      sold: false,
      reason: 'لم يعد متاحاً',
    });

    expect(repo.createListingWithFee).not.toHaveBeenCalled();
    expect(repo.softDelete).toHaveBeenNthCalledWith(
      1,
      'l1',
      expect.objectContaining({ sellerDeclaredSold: true }),
    );
    expect(repo.softDelete).toHaveBeenNthCalledWith(
      2,
      'l1',
      expect.objectContaining({ sellerDeclaredSold: false }),
    );
  });

  it('refuses delete without sold/reason (deletion is not an implicit sale)', async () => {
    repo.findSellerId.mockResolvedValue({ sellerId: 'u1' });
    await expect(
      service.remove({ userId: 'u1', username: 'u', role: 'USER' }, 'l1', {
        sold: undefined as never,
        reason: '',
      }),
    ).rejects.toBeInstanceOf(ApiException);
    expect(repo.softDelete).not.toHaveBeenCalled();
  });
});
