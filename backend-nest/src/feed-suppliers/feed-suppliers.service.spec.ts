import { FeedSuppliersService } from './feed-suppliers.service';

describe('FeedSuppliersService', () => {
  const repo = {
    findPublic: jest.fn(),
    findPublicById: jest.fn(),
    findAllAdmin: jest.fn(),
    findAdminById: jest.fn(),
    createSupplier: jest.fn(),
    updateSupplier: jest.fn(),
    softDeleteSupplier: jest.fn(),
    createProduct: jest.fn(),
    findProductById: jest.fn(),
    updateProduct: jest.fn(),
    softDeleteProduct: jest.fn(),
  };

  const service = new FeedSuppliersService(repo as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists only published public suppliers through the repository', async () => {
    repo.findPublic.mockResolvedValue([
      { id: 's1', published: true, _count: { products: 2 } },
    ]);
    const rows = await service.listPublic('شعير', 'barley');
    expect(repo.findPublic).toHaveBeenCalledWith({
      q: 'شعير',
      category: 'barley',
    });
    expect(rows).toEqual([{ id: 's1', published: true }]);
  });

  it('omits products from the public supplier payload', async () => {
    repo.findPublicById.mockResolvedValue({
      id: 's1',
      published: true,
      products: [{ id: 'p1', nameAr: 'شعير' }],
      _count: { products: 1 },
    });
    await expect(service.getPublic('s1')).resolves.toEqual({
      id: 's1',
      published: true,
    });
  });

  it('rejects a missing public supplier', async () => {
    repo.findPublicById.mockResolvedValue(null);
    await expect(service.getPublic('missing')).rejects.toMatchObject({
      status: 404,
    });
  });

  it('soft-deletes a supplier after confirming it exists', async () => {
    repo.findAdminById.mockResolvedValue({ id: 's1' });
    repo.softDeleteSupplier.mockResolvedValue([]);
    await expect(service.remove('s1')).resolves.toEqual({ deleted: true });
    expect(repo.softDeleteSupplier).toHaveBeenCalledWith('s1');
  });
});
