import { Test } from '@nestjs/testing';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { NiWebhookService } from '../integrations/services/ni-webhook.service';

describe('PaymentsController webhook compatibility route', () => {
  it('bootstraps with NiWebhookService (no unresolved circular token)', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PaymentsController],
      providers: [
        { provide: PaymentsService, useValue: { initiate: jest.fn() } },
        {
          provide: NiWebhookService,
          useValue: { verifySignature: jest.fn(), handleRaw: jest.fn() },
        },
      ],
    }).compile();
    expect(moduleRef.get(PaymentsController)).toBeDefined();
    expect(moduleRef.get(NiWebhookService)).toBeDefined();
  });

  const verifySignature = jest.fn();
  const handleRaw = jest.fn();
  const processWebhook = jest.fn();
  const payments = {
    processWebhook,
    verifyWebhookSignature: jest.fn(),
  };
  const niWebhooks = {
    verifySignature,
    handleRaw,
  };

  const controller = new PaymentsController(
    payments as unknown as PaymentsService,
    niWebhooks as unknown as NiWebhookService,
  );

  const json = jest.fn();
  const res = {
    status: jest.fn().mockReturnValue({ json }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    res.status.mockReturnValue({ json });
  });

  it('forwards a verified webhook to NiWebhookService.handleRaw (not processWebhook)', async () => {
    verifySignature.mockReturnValue({ ok: true });
    handleRaw.mockResolvedValue({ status: 200, body: { received: true } });

    await controller.webhook(
      { rawBody: '{"eventName":"ORDER.PAID"}' } as never,
      res as never,
      undefined,
      'sig-from-ni',
    );

    expect(verifySignature).toHaveBeenCalledWith(
      '{"eventName":"ORDER.PAID"}',
      'sig-from-ni',
    );
    expect(handleRaw).toHaveBeenCalledWith('{"eventName":"ORDER.PAID"}');
    expect(processWebhook).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({ received: true });
  });

  it('prefers x-signature when both headers are present', async () => {
    verifySignature.mockReturnValue({ ok: true });
    handleRaw.mockResolvedValue({ status: 200, body: { received: true } });

    await controller.webhook(
      { rawBody: '{}' } as never,
      res as never,
      'x-signature-value',
      'x-ni-signature-value',
    );

    expect(verifySignature).toHaveBeenCalledWith('{}', 'x-signature-value');
  });

  it('returns 401 for an invalid signature', async () => {
    verifySignature.mockReturnValue({
      ok: false,
      status: 401,
      error: 'invalid_signature',
    });

    await controller.webhook(
      { rawBody: '{}' } as never,
      res as never,
      'bad-sig',
      undefined,
    );

    expect(handleRaw).not.toHaveBeenCalled();
    expect(processWebhook).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ error: 'invalid_signature' });
  });

  it('returns 401 when production rejects a missing signature', async () => {
    verifySignature.mockReturnValue({
      ok: false,
      status: 401,
      error: 'missing_signature',
    });

    await controller.webhook(
      { rawBody: '{}' } as never,
      res as never,
      undefined,
      undefined,
    );

    expect(handleRaw).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ error: 'missing_signature' });
  });

  it('acknowledges a duplicate handleRaw result without calling processWebhook', async () => {
    verifySignature.mockReturnValue({ ok: true });
    handleRaw.mockResolvedValue({
      status: 200,
      body: { received: true, duplicate: true },
      duplicate: true,
    });

    await controller.webhook(
      { rawBody: '{"eventName":"ORDER.PAID"}' } as never,
      res as never,
      'ok',
      undefined,
    );

    expect(handleRaw).toHaveBeenCalledTimes(1);
    expect(processWebhook).not.toHaveBeenCalled();
    expect(json).toHaveBeenCalledWith({ received: true, duplicate: true });
  });
});
