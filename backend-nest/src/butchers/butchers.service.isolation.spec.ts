import { OrderStatus } from '@prisma/client';
import { ButchersService } from './butchers.service';
import { OrderStateMachineService } from './services/order-state-machine.service';
import { ApiException } from '../common/exceptions/api.exception';
import type { JwtPayload } from '../common/types/jwt-payload.interface';

function jwt(userId: string, role: JwtPayload['role'] = 'BUTCHER'): JwtPayload {
  return { userId, username: userId, role };
}

describe('Butcher order isolation', () => {
  const repo = {
    findButcherIdByUser: jest.fn(),
    findButcherById: jest.fn(),
    findAcceptedOrderForChat: jest.fn(),
    findOrdersForButcher: jest.fn(),
    findOrdersForCustomer: jest.fn(),
    findOrdersPage: jest.fn(),
    countOrders: jest.fn(),
    findOrderById: jest.fn(),
    findOrderWithButcher: jest.fn(),
    findOrderAudits: jest.fn(),
    findButcherForStats: jest.fn(),
    groupOrderStatusCounts: jest.fn(),
    sumSalesSince: jest.fn(),
    countOrdersSince: jest.fn(),
    findRecentOrdersForButcher: jest.fn(),
    findProductsInventory: jest.fn(),
    findProducts: jest.fn(),
    findProductWithButcher: jest.fn(),
    updateProduct: jest.fn(),
    softDeleteProduct: jest.fn(),
    createProduct: jest.fn(),
  };
  const redis = {
    cacheDel: jest.fn(),
    cacheGet: jest.fn(),
    cacheSet: jest.fn(),
  };
  const orderLifecycle = { transitionOrder: jest.fn(), createOrder: jest.fn() };
  const ranking = {};
  let service: ButchersService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ButchersService(
      repo as never,
      redis as never,
      orderLifecycle as never,
      new OrderStateMachineService(),
      ranking as never,
    );
  });

  it('closes shop chat-access for customers and owners', async () => {
    repo.findButcherById.mockResolvedValue({
      id: 'shop-1',
      userId: 'butcher-user',
    });
    const result = await service.getChatAccess('shop-1', jwt('cust-1', 'USER'));
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('direct_chat_disabled');
    expect(repo.findAcceptedOrderForChat).not.toHaveBeenCalled();
  });

  it('refuses butcher A reading butcher B order details', async () => {
    repo.findOrderById.mockResolvedValue({
      id: 'order-b',
      customerId: 'cust-b',
      butcher: { userId: 'user-b', id: 'butcher-b' },
      status: 'pending',
    });
    await expect(
      service.getOrderById('order-b', jwt('user-a')),
    ).rejects.toMatchObject({
      status: 403,
    } satisfies Partial<ApiException>);
    expect(repo.findOrderAudits).not.toHaveBeenCalled();
  });

  it('refuses butcher A updating butcher B order status', async () => {
    repo.findOrderWithButcher.mockResolvedValue({
      id: 'order-b',
      customerId: 'cust-b',
      butcher: { userId: 'user-b', id: 'butcher-b' },
      status: 'pending',
    });
    await expect(
      service.updateOrder('order-b', jwt('user-a'), { status: 'confirmed' }),
    ).rejects.toMatchObject({ status: 403 } satisfies Partial<ApiException>);
    expect(orderLifecycle.transitionOrder).not.toHaveBeenCalled();
  });

  it('ignores a forged butcherId query and lists only the JWT butcher orders', async () => {
    repo.findButcherIdByUser.mockResolvedValue({ id: 'butcher-a' });
    repo.findOrdersPage.mockResolvedValue([]);
    repo.countOrders.mockResolvedValue(0);

    await service.getOrders(jwt('user-a'), {
      page: '1',
      butcherId: 'butcher-b',
    });

    expect(repo.findOrdersPage).toHaveBeenCalledWith(
      expect.objectContaining({ butcherId: 'butcher-a' }),
      0,
      20,
      false,
    );
    expect(repo.findOrdersPage.mock.calls[0][0].butcherId).not.toBe(
      'butcher-b',
    );
  });

  it('rejects dashboard access when the user has no butcher profile', async () => {
    repo.findButcherForStats.mockResolvedValue(null);
    await expect(
      service.getDashboardSummary(jwt('user-plain', 'USER')),
    ).rejects.toMatchObject({
      status: 403,
    } satisfies Partial<ApiException>);
  });

  it('blocks an illegal status jump before lifecycle runs', async () => {
    repo.findOrderWithButcher.mockResolvedValue({
      id: 'order-a',
      customerId: 'cust-a',
      butcher: { userId: 'user-a', id: 'butcher-a' },
      status: 'pending',
    });
    orderLifecycle.transitionOrder.mockImplementation(
      async (params: { nextStatus: OrderStatus }) => {
        new OrderStateMachineService().assertTransition(
          'pending',
          params.nextStatus,
        );
        return { id: 'order-a', status: params.nextStatus };
      },
    );

    await expect(
      service.updateOrder('order-a', jwt('user-a'), { status: 'delivered' }),
    ).rejects.toMatchObject({ status: 409 } satisfies Partial<ApiException>);
  });

  it('refuses a customer cancelling a pending order after payment succeeded', async () => {
    repo.findOrderWithButcher.mockResolvedValue({
      id: 'order-paid',
      customerId: 'cust-1',
      butcher: { userId: 'butcher-user', id: 'butcher-1' },
      status: 'pending',
      paymentStatus: 'paid',
    });

    await expect(
      service.updateOrder('order-paid', jwt('cust-1', 'USER'), {
        status: 'cancelled',
      }),
    ).rejects.toMatchObject({
      status: 403,
      error: 'forbidden_status_change',
    } satisfies Partial<ApiException>);
    expect(orderLifecycle.transitionOrder).not.toHaveBeenCalled();
  });

  it('refuses a customer cancelling a confirmed paid order', async () => {
    repo.findOrderWithButcher.mockResolvedValue({
      id: 'order-paid-confirmed',
      customerId: 'cust-1',
      butcher: { userId: 'butcher-user', id: 'butcher-1' },
      status: 'confirmed',
      paymentStatus: 'paid',
    });

    await expect(
      service.updateOrder('order-paid-confirmed', jwt('cust-1', 'USER'), {
        status: 'cancelled',
      }),
    ).rejects.toMatchObject({
      status: 403,
      error: 'forbidden_status_change',
    } satisfies Partial<ApiException>);
    expect(orderLifecycle.transitionOrder).not.toHaveBeenCalled();
  });

  it('allows a customer to cancel an unpaid pending order', async () => {
    repo.findOrderWithButcher.mockResolvedValue({
      id: 'order-unpaid',
      customerId: 'cust-1',
      butcher: { userId: 'butcher-user', id: 'butcher-1' },
      status: 'pending',
      paymentStatus: 'unpaid',
    });
    orderLifecycle.transitionOrder.mockResolvedValue({
      id: 'order-unpaid',
      status: 'cancelled',
    });

    const result = await service.updateOrder(
      'order-unpaid',
      jwt('cust-1', 'USER'),
      {
        status: 'cancelled',
      },
    );
    expect(result.status).toBe('cancelled');
    expect(orderLifecycle.transitionOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'order-unpaid',
        actorId: 'cust-1',
        nextStatus: 'cancelled',
      }),
    );
  });

  it('still lets a butcher cancel a paid pending order', async () => {
    repo.findOrderWithButcher.mockResolvedValue({
      id: 'order-paid',
      customerId: 'cust-1',
      butcher: { userId: 'butcher-user', id: 'butcher-1' },
      status: 'pending',
      paymentStatus: 'paid',
    });
    orderLifecycle.transitionOrder.mockResolvedValue({
      id: 'order-paid',
      status: 'cancelled',
    });

    const result = await service.updateOrder(
      'order-paid',
      jwt('butcher-user'),
      { status: 'cancelled' },
    );
    expect(result.status).toBe('cancelled');
    expect(orderLifecycle.transitionOrder).toHaveBeenCalledTimes(1);
  });

  it('still lets an admin cancel a paid pending order', async () => {
    repo.findOrderWithButcher.mockResolvedValue({
      id: 'order-paid',
      customerId: 'cust-1',
      butcher: { userId: 'butcher-user', id: 'butcher-1' },
      status: 'pending',
      paymentStatus: 'paid',
    });
    orderLifecycle.transitionOrder.mockResolvedValue({
      id: 'order-paid',
      status: 'cancelled',
    });

    const result = await service.updateOrder(
      'order-paid',
      jwt('admin-1', 'ADMIN'),
      { status: 'cancelled' },
    );
    expect(result.status).toBe('cancelled');
    expect(orderLifecycle.transitionOrder).toHaveBeenCalledTimes(1);
  });

  it('treats a duplicate same-status request as a lifecycle no-op', async () => {
    repo.findOrderWithButcher.mockResolvedValue({
      id: 'order-a',
      customerId: 'cust-a',
      butcher: { userId: 'user-a', id: 'butcher-a' },
      status: 'preparing',
    });
    orderLifecycle.transitionOrder.mockResolvedValue({
      id: 'order-a',
      status: 'preparing',
    });

    const result = await service.updateOrder('order-a', jwt('user-a'), {
      status: 'preparing',
    });
    expect(result.status).toBe('preparing');
    expect(orderLifecycle.transitionOrder).toHaveBeenCalledTimes(1);
  });
});

describe('Butcher customers, reports, and settings isolation', () => {
  const repo = {
    findButcherIdByUser: jest.fn(),
    findCustomersPage: jest.fn(),
    countCustomers: jest.fn(),
    findOrdersForReports: jest.fn(),
    findButcherOwner: jest.fn(),
    findButcherOwnerByUser: jest.fn(),
    updateButcher: jest.fn(),
  };
  const redis = {
    cacheDel: jest.fn(),
    cacheDelPattern: jest.fn().mockResolvedValue(undefined),
  };
  let service: ButchersService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ButchersService(
      repo as never,
      redis as never,
      {} as never,
      new OrderStateMachineService(),
      {} as never,
    );
  });

  it('lists customers of the JWT butcher and ignores a forged butcherId', async () => {
    repo.findButcherIdByUser.mockResolvedValue({ id: 'butcher-a' });
    repo.findCustomersPage.mockResolvedValue([]);
    repo.countCustomers.mockResolvedValue(0);

    await service.getCustomers(jwt('user-a'), {
      page: '1',
      butcherId: 'butcher-b',
    });

    expect(repo.findCustomersPage).toHaveBeenCalledWith(
      'butcher-a',
      undefined,
      0,
      20,
    );
    expect(repo.findCustomersPage.mock.calls[0][0]).not.toBe('butcher-b');
  });

  it('aggregates reports from JWT butcher orders only', async () => {
    repo.findButcherIdByUser.mockResolvedValue({ id: 'butcher-a' });
    const createdAt = new Date('2026-08-19T10:00:00.000+03:00');
    repo.findOrdersForReports.mockResolvedValue([
      {
        id: 'paid-delivered',
        customerId: 'c1',
        productId: 'p1',
        status: 'delivered',
        paymentStatus: 'paid',
        totalPrice: 100,
        createdAt,
        product: { id: 'p1', nameAr: 'لحم' },
        items: [],
      },
      {
        id: 'unpaid',
        customerId: 'c2',
        productId: 'p1',
        status: 'pending',
        paymentStatus: 'unpaid',
        totalPrice: 50,
        createdAt,
        product: { id: 'p1', nameAr: 'لحم' },
        items: [],
      },
      {
        id: 'cancelled-paid',
        customerId: 'c3',
        productId: 'p1',
        status: 'cancelled',
        paymentStatus: 'paid',
        totalPrice: 80,
        createdAt,
        product: { id: 'p1', nameAr: 'لحم' },
        items: [],
      },
      {
        id: 'paid-preparing',
        customerId: 'c4',
        productId: 'p2',
        status: 'preparing',
        paymentStatus: 'paid',
        totalPrice: 40,
        createdAt,
        product: { id: 'p2', nameAr: 'دجاج' },
        items: [],
      },
    ]);

    const result = await service.getReports(jwt('user-a'), {
      period: '30d',
      butcherId: 'butcher-b',
    });

    expect(repo.findOrdersForReports).toHaveBeenCalledWith(
      'butcher-a',
      expect.any(Date),
      expect.any(Date),
    );
    expect(repo.findOrdersForReports.mock.calls[0][0]).not.toBe('butcher-b');
    expect(result.salesTotal).toBe(140);
    expect(result.salesCount).toBe(2);
    expect(result.avgOrderValue).toBe(70);
    expect(result.classification).toEqual({
      unpaid: 1,
      cancelled: 1,
      paidPreparing: 1,
      paidDelivered: 1,
      sales: 2,
    });
  });

  it('refuses butcher A updating butcher B settings', async () => {
    repo.findButcherOwner.mockResolvedValue({
      id: 'butcher-b',
      userId: 'user-b',
    });
    await expect(
      service.updateButcher('butcher-b', jwt('user-a'), { isOpen: false }),
    ).rejects.toMatchObject({ status: 403 } satisfies Partial<ApiException>);
    expect(repo.updateButcher).not.toHaveBeenCalled();
  });

  it('updates settings via PUT me using the JWT butcher only', async () => {
    repo.findButcherOwnerByUser.mockResolvedValue({
      id: 'butcher-a',
      userId: 'user-a',
    });
    repo.updateButcher.mockResolvedValue({ id: 'butcher-a', isOpen: false });
    await service.updateButcher('me', jwt('user-a'), { isOpen: false });
    expect(repo.findButcherOwnerByUser).toHaveBeenCalledWith('user-a');
    expect(repo.updateButcher).toHaveBeenCalledWith('butcher-a', {
      isOpen: false,
    });
  });

  it('refuses butcher A replacing butcher B logo/cover', async () => {
    repo.findButcherOwner.mockResolvedValue({
      id: 'butcher-b',
      userId: 'user-b',
    });
    await expect(
      service.updateButcher('butcher-b', jwt('user-a'), {
        logo: 'https://res.cloudinary.com/demo/image/upload/v1/b.jpg',
        cover: 'https://res.cloudinary.com/demo/image/upload/v1/c.jpg',
      }),
    ).rejects.toMatchObject({ status: 403 } satisfies Partial<ApiException>);
    expect(repo.updateButcher).not.toHaveBeenCalled();
  });

  it('persists logo/cover for the JWT butcher via PUT me', async () => {
    repo.findButcherOwnerByUser.mockResolvedValue({
      id: 'butcher-a',
      userId: 'user-a',
    });
    repo.updateButcher.mockResolvedValue({
      id: 'butcher-a',
      logo: 'https://res.cloudinary.com/demo/image/upload/v1/logo.jpg',
      cover: null,
    });
    await service.updateButcher('me', jwt('user-a'), {
      logo: 'https://res.cloudinary.com/demo/image/upload/v1/logo.jpg',
      cover: null,
    });
    expect(repo.updateButcher).toHaveBeenCalledWith('butcher-a', {
      logo: 'https://res.cloudinary.com/demo/image/upload/v1/logo.jpg',
      cover: null,
    });
  });
});

describe('Butcher product isolation', () => {
  const repo = {
    findButcherIdByUser: jest.fn(),
    findProducts: jest.fn(),
    findProductWithButcher: jest.fn(),
    updateProduct: jest.fn(),
    softDeleteProduct: jest.fn(),
  };
  const redis = { cacheDel: jest.fn() };
  let service: ButchersService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ButchersService(
      repo as never,
      redis as never,
      {} as never,
      new OrderStateMachineService(),
      {} as never,
    );
  });

  it('lists only products of the JWT butcher', async () => {
    repo.findButcherIdByUser.mockResolvedValue({ id: 'butcher-a' });
    repo.findProducts.mockResolvedValue([
      {
        id: 'p1',
        butcherId: 'butcher-a',
        inStock: true,
        availableQuantity: 12,
        reservedQuantity: 9,
        nameAr: 'لحم',
      },
    ]);
    const result = await service.getMyProducts(jwt('user-a'));
    expect(repo.findProducts).toHaveBeenCalledWith('butcher-a');
    expect(result[0].sellableQuantity).toBe(3);
    expect(result[0].stock).toBe('low');
  });

  it('refuses butcher A updating butcher B product', async () => {
    repo.findProductWithButcher.mockResolvedValue({
      id: 'p-b',
      butcher: { userId: 'user-b', id: 'butcher-b' },
    });
    await expect(
      service.updateProduct('p-b', jwt('user-a'), { inStock: false }),
    ).rejects.toMatchObject({ status: 403 } satisfies Partial<ApiException>);
    expect(repo.updateProduct).not.toHaveBeenCalled();
  });

  it('refuses butcher A replacing butcher B product images', async () => {
    repo.findProductWithButcher.mockResolvedValue({
      id: 'p-b',
      butcher: { userId: 'user-b', id: 'butcher-b' },
    });
    await expect(
      service.updateProduct('p-b', jwt('user-a'), {
        images: ['https://res.cloudinary.com/demo/image/upload/v1/stolen.jpg'],
      }),
    ).rejects.toMatchObject({ status: 403 } satisfies Partial<ApiException>);
    expect(repo.updateProduct).not.toHaveBeenCalled();
  });

  it('allows the owner to replace or clear product images', async () => {
    repo.findProductWithButcher.mockResolvedValue({
      id: 'p-a',
      butcher: { userId: 'user-a', id: 'butcher-a' },
    });
    repo.updateProduct.mockResolvedValue({ id: 'p-a', images: [] });
    await service.updateProduct('p-a', jwt('user-a'), { images: [] });
    expect(repo.updateProduct).toHaveBeenCalledWith(
      'p-a',
      expect.objectContaining({ images: [] }),
    );
  });

  it('refuses butcher A deleting butcher B product', async () => {
    repo.findProductWithButcher.mockResolvedValue({
      id: 'p-b',
      butcher: { userId: 'user-b', id: 'butcher-b' },
    });
    await expect(
      service.deleteProduct('p-b', jwt('user-a')),
    ).rejects.toMatchObject({ status: 403 } satisfies Partial<ApiException>);
    expect(repo.softDeleteProduct).not.toHaveBeenCalled();
  });
});
