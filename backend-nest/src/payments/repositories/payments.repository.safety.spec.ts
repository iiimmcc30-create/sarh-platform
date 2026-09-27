import { PaymentsRepository } from './payments.repository';

describe('PaymentsRepository payment-safety transitions', () => {
  const tx = {
    payment: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  const prisma = {
    payment: {
      updateMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
  };

  const repo = new PaymentsRepository(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (fn) => fn(tx));
  });

  it('markPaymentFailedById only updates pending rows (paid stays paid)', async () => {
    tx.payment.updateMany.mockResolvedValue({ count: 0 });

    const result = await repo.markPaymentFailedById('pay-paid');

    expect(tx.payment.updateMany).toHaveBeenCalledWith({
      where: { id: 'pay-paid', status: 'pending' },
      data: { status: 'failed' },
    });
    expect(result).toEqual({ count: 0 });
  });

  it('markPaymentFailedById updates a pending payment', async () => {
    tx.payment.updateMany.mockResolvedValue({ count: 1 });
    tx.payment.findUnique.mockResolvedValue({
      referenceType: 'listing_fee',
      referenceId: 'fee-1',
    });

    const result = await repo.markPaymentFailedById('pay-pending');

    expect(result).toEqual({ count: 1 });
  });

  it('marks a paid payment refunded once (idempotent)', async () => {
    tx.payment.findUnique.mockResolvedValue({
      id: 'pay-1',
      status: 'paid',
      metadata: {},
      referenceType: 'featured_ad',
      referenceId: 'listing-1',
    });
    tx.payment.updateMany.mockResolvedValue({ count: 1 });

    const first = await repo.markPaymentRefunded('pay-1', {
      refundedAt: 'now',
    });
    expect(first).toEqual({
      id: 'pay-1',
      status: 'refunded',
      newlyRefunded: true,
    });

    tx.payment.findUnique.mockResolvedValue({
      id: 'pay-1',
      status: 'refunded',
      metadata: {},
      referenceType: 'featured_ad',
      referenceId: 'listing-1',
    });
    tx.payment.updateMany.mockClear();

    const second = await repo.markPaymentRefunded('pay-1', {
      refundedAt: 'now',
    });
    expect(second).toEqual({
      id: 'pay-1',
      status: 'refunded',
      newlyRefunded: false,
    });
    expect(tx.payment.updateMany).not.toHaveBeenCalled();
  });

  it('does not promote a failed listing_fee payment to paid', async () => {
    tx.payment.updateMany.mockResolvedValue({ count: 0 });

    const result = await repo.processSuccessfulPayment({
      paymentId: 'pay-fee',
      niTransactionId: 'ni-fee',
      type: 'listing_fee',
      referenceId: 'fee-1',
      userId: 'u1',
      targetPlanId: undefined,
      billingCycle: 'monthly',
      storedMeta: { type: 'listing_fee' },
    });

    expect(tx.payment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'pay-fee', status: 'pending' },
      }),
    );
    expect(result).toEqual({ processed: false });
  });
});
