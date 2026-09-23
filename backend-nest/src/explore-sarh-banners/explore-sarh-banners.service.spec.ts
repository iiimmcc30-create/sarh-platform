import { ExploreSarhBannersService } from './explore-sarh-banners.service';

describe('ExploreSarhBannersService', () => {
  const prisma = {
    exploreSarhBanner: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      aggregate: jest.fn(),
    },
    $transaction: jest.fn(async (ops: unknown[]) => ops),
  };

  let service: ExploreSarhBannersService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ExploreSarhBannersService(prisma as never);
  });

  it('listPublic returns only active banners ordered by sortOrder', async () => {
    prisma.exploreSarhBanner.findMany.mockResolvedValueOnce([
      { id: 'a', sortOrder: 0 },
    ]);
    await service.listPublic();
    expect(prisma.exploreSarhBanner.findMany).toHaveBeenCalledWith({
      take: 50,
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        imageUrl: true,
        accessibilityLabel: true,
        href: true,
        sortOrder: true,
      },
    });
  });

  it('create appends sortOrder after current max', async () => {
    prisma.exploreSarhBanner.aggregate.mockResolvedValueOnce({
      _max: { sortOrder: 2 },
    });
    prisma.exploreSarhBanner.create.mockResolvedValueOnce({ id: 'n' });
    await service.create({
      imageUrl: 'https://cdn.example/b.jpg',
      accessibilityLabel: 'ملاحم',
      href: '/butchers',
    });
    expect(prisma.exploreSarhBanner.create).toHaveBeenCalledWith({
      data: {
        imageUrl: 'https://cdn.example/b.jpg',
        accessibilityLabel: 'ملاحم',
        href: '/butchers',
        isActive: true,
        sortOrder: 3,
      },
    });
  });

  it('reorder writes contiguous sortOrder values', async () => {
    prisma.exploreSarhBanner.findMany
      .mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
      .mockResolvedValueOnce([{ id: 'b' }, { id: 'a' }, { id: 'c' }]);
    prisma.exploreSarhBanner.update.mockResolvedValue({});
    await service.reorder(['b', 'a']);
    expect(prisma.$transaction).toHaveBeenCalled();
    const ops = prisma.$transaction.mock.calls[0][0] as unknown[];
    expect(ops).toHaveLength(3);
  });

  it('remove deletes an existing banner', async () => {
    prisma.exploreSarhBanner.findUnique.mockResolvedValueOnce({ id: 'x' });
    prisma.exploreSarhBanner.delete.mockResolvedValueOnce({ id: 'x' });
    await expect(service.remove('x')).resolves.toEqual({ id: 'x' });
    expect(prisma.exploreSarhBanner.delete).toHaveBeenCalledWith({
      where: { id: 'x' },
    });
  });
});
