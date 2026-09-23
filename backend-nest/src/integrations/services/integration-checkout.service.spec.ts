import { Test } from '@nestjs/testing';
import { IntegrationStatus } from '@prisma/client';
import { IntegrationCheckoutService } from './integration-checkout.service';
import { IntegrationOrdersRepository } from '../repositories/integration-orders.repository';
import { PAYMENT_GATEWAY } from '../interfaces/payment-gateway.interface';
import { LoggerService } from '../../common/services/logger.service';
import { NiGatewayError } from '../../payments/ni-client';

const PAYMENT_ID = '23630825-747a-49b4-84ee-9a65f33d9a0c';
const NI_UUID = 'a13f81f3-27b4-48b6-88de-22b9ddc1e1dc';
const MERCHANT_REF = 'FTR-4916FD-MSPXSTSH';

describe('IntegrationCheckoutService', () => {
  let service: IntegrationCheckoutService;
  const repo = {
    findByPaymentId: jest.fn(),
    findByIdempotencyKey: jest.fn(),
    findById: jest.fn(),
    upsertPending: jest.fn(),
    markProcessing: jest.fn().mockResolvedValue({}),
    markSynced: jest.fn().mockResolvedValue({}),
    markFailed: jest.fn().mockResolvedValue({}),
  };
  const gateway = {
    provider: 'ni' as const,
    createCheckout: jest.fn(),
    fetchOrder: jest.fn(),
  };
  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };

  const command = {
    paymentId: PAYMENT_ID,
    merchantOrderReference: MERCHANT_REF,
    amount: 25,
    currency: 'SAR',
    description: 'سرح Payment',
    redirectUrl: 'https://sarh.app/ok',
    cancelUrl: 'https://sarh.app/cancel',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    process.env.NI_API_KEY = 'live-key-not-test';
    repo.findByPaymentId.mockResolvedValue(null);
    repo.findByIdempotencyKey.mockResolvedValue(null);
    repo.upsertPending.mockResolvedValue({
      id: 'int-1',
      retryCount: 0,
      paymentId: PAYMENT_ID,
    });
    const moduleRef = await Test.createTestingModule({
      providers: [
        IntegrationCheckoutService,
        { provide: IntegrationOrdersRepository, useValue: repo },
        { provide: PAYMENT_GATEWAY, useValue: gateway },
        { provide: LoggerService, useValue: logger },
      ],
    }).compile();
    service = moduleRef.get(IntegrationCheckoutService);
  });

  afterEach(() => {
    delete process.env.NI_API_KEY;
  });

  it('creates an order and stores the NI UUID (not the internal ref)', async () => {
    gateway.createCheckout.mockResolvedValue({
      checkoutUrl: 'https://pay.ni/abc',
      externalOrderId: NI_UUID,
      raw: { reference: NI_UUID },
    });

    const result = await service.createHostedCheckout(command);

    expect(gateway.createCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ merchantOrderReference: MERCHANT_REF }),
    );
    expect(result.externalOrderId).toBe(NI_UUID);
    expect(result.merchantOrderReference).toBe(MERCHANT_REF);
    expect(repo.markSynced).toHaveBeenCalledWith(
      'int-1',
      expect.objectContaining({ externalOrderId: NI_UUID }),
    );
  });

  it('rejects using the internal merchant ref as a UUID', () => {
    expect(() => service.rejectInternalRefAsUuid(MERCHANT_REF)).toThrow();
  });

  it('is idempotent when a UUID checkout already exists', async () => {
    repo.findByPaymentId.mockResolvedValue({
      id: 'int-1',
      checkoutUrl: 'https://pay.ni/abc',
      externalOrderId: NI_UUID,
      merchantOrderReference: MERCHANT_REF,
    });

    const result = await service.createHostedCheckout(command);
    expect(result.reused).toBe(true);
    expect(gateway.createCheckout).not.toHaveBeenCalled();
  });

  it('maps 400 without deleting the local payment row', async () => {
    gateway.createCheckout.mockRejectedValue(
      new NiGatewayError('bad request', 'create_order', 400, {
        error: 'invalid',
      }),
    );
    await expect(service.createHostedCheckout(command)).rejects.toBeInstanceOf(
      NiGatewayError,
    );
    expect(repo.markFailed).toHaveBeenCalled();
    expect(repo.markSynced).not.toHaveBeenCalled();
  });

  it('maps 401', async () => {
    gateway.createCheckout.mockRejectedValue(
      new NiGatewayError('unauthorized', 'auth', 401),
    );
    await expect(service.createHostedCheckout(command)).rejects.toMatchObject({
      httpStatus: 401,
    });
    expect(repo.markFailed).toHaveBeenCalled();
  });

  it('maps 422', async () => {
    gateway.createCheckout.mockRejectedValue(
      new NiGatewayError('unprocessable', 'create_order', 422),
    );
    await expect(service.createHostedCheckout(command)).rejects.toMatchObject({
      httpStatus: 422,
    });
  });

  it('maps 500', async () => {
    gateway.createCheckout.mockRejectedValue(
      new NiGatewayError('gateway', 'create_order', 500),
    );
    await expect(service.createHostedCheckout(command)).rejects.toMatchObject({
      httpStatus: 500,
    });
    expect(repo.markFailed).toHaveBeenCalled();
  });

  it('maps timeout', async () => {
    gateway.createCheckout.mockRejectedValue(
      new NiGatewayError('timeout', 'create_order', 408),
    );
    await expect(service.createHostedCheckout(command)).rejects.toMatchObject({
      httpStatus: 408,
    });
  });

  it('does not recreate when retrying a synced UUID row', async () => {
    repo.findById.mockResolvedValue({
      id: 'int-1',
      paymentId: PAYMENT_ID,
      status: IntegrationStatus.synced,
      externalOrderId: NI_UUID,
      checkoutUrl: 'https://pay.ni/abc',
      merchantOrderReference: MERCHANT_REF,
      retryCount: 1,
      payment: { amount: 25, currency: 'SAR', id: PAYMENT_ID },
    });
    const result = await service.retryFailedCheckout('int-1', {
      amount: 25,
      description: 'retry',
      redirectUrl: 'https://sarh.app/ok',
      cancelUrl: 'https://sarh.app/cancel',
    });
    expect(result.reused).toBe(true);
    expect(gateway.createCheckout).not.toHaveBeenCalled();
  });
});
