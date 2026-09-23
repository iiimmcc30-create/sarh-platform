import { Test } from '@nestjs/testing';
import { NiWebhookService } from './ni-webhook.service';
import { IntegrationOrdersRepository } from '../repositories/integration-orders.repository';
import { PaymentsService } from '../../payments/payments.service';
import { LoggerService } from '../../common/services/logger.service';

describe('NiWebhookService', () => {
  let service: NiWebhookService;
  const tryInsertWebhookEvent = jest.fn();
  const findWebhookEvent = jest.fn();
  const findByExternalOrderId = jest.fn();
  const markWebhookProcessed = jest.fn();
  const markWebhookError = jest.fn();
  const repo = {
    tryInsertWebhookEvent,
    findWebhookEvent,
    findByExternalOrderId,
    markWebhookProcessed,
    markWebhookError,
  };
  const processWebhook = jest
    .fn()
    .mockResolvedValue({ status: 200, body: { received: true } });
  const payments = {
    verifyWebhookSignature: jest.fn().mockReturnValue({ ok: true }),
    processWebhook,
  };
  const logger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    tryInsertWebhookEvent.mockResolvedValue({ id: 'evt-1' });
    const moduleRef = await Test.createTestingModule({
      providers: [
        NiWebhookService,
        { provide: IntegrationOrdersRepository, useValue: repo },
        { provide: PaymentsService, useValue: payments },
        { provide: LoggerService, useValue: logger },
      ],
    }).compile();
    service = moduleRef.get(NiWebhookService);
  });

  it('processes a valid webhook and stores the event', async () => {
    const raw = JSON.stringify({
      eventName: 'ORDER.PAID',
      order: {
        reference: 'a13f81f3-27b4-48b6-88de-22b9ddc1e1dc',
        state: 'PURCHASED',
      },
    });
    findByExternalOrderId.mockResolvedValue({ paymentId: 'pay-1' });
    const result = await service.handleRaw(raw);
    expect(result.status).toBe(200);
    expect(processWebhook).toHaveBeenCalledWith(raw);
    expect(markWebhookProcessed).toHaveBeenCalled();
  });

  it('is idempotent when duplicate event was already processed', async () => {
    tryInsertWebhookEvent.mockRejectedValue({ code: 'P2002' });
    findWebhookEvent.mockResolvedValue({ id: 'evt-1', processed: true });
    const raw = JSON.stringify({
      eventName: 'ORDER.PAID',
      order: { reference: 'a13f81f3-27b4-48b6-88de-22b9ddc1e1dc' },
    });
    const result = await service.handleRaw(raw);
    expect(result.duplicate).toBe(true);
    expect(result.status).toBe(200);
    expect(processWebhook).not.toHaveBeenCalled();
  });

  it('reprocesses when duplicate event was not marked processed', async () => {
    tryInsertWebhookEvent.mockRejectedValue({ code: 'P2002' });
    findWebhookEvent.mockResolvedValue({ id: 'evt-1', processed: false });
    findByExternalOrderId.mockResolvedValue({ paymentId: 'pay-1' });
    const raw = JSON.stringify({
      eventName: 'ORDER.PAID',
      order: {
        reference: 'a13f81f3-27b4-48b6-88de-22b9ddc1e1dc',
        state: 'PURCHASED',
      },
    });
    const result = await service.handleRaw(raw);
    expect(result.status).toBe(200);
    expect(processWebhook).toHaveBeenCalledWith(raw);
    expect(markWebhookProcessed).toHaveBeenCalledWith('evt-1', 'pay-1');
  });

  it('rejects invalid JSON', async () => {
    const result = await service.handleRaw('not-json');
    expect(result.status).toBe(400);
  });
});
