import { ConsentService } from './consent.service';
import { PrivacyController } from './privacy.controller';
import { AuthController } from '../auth/auth.controller';
import { PRIVACY_POLICY_VERSION } from './privacy-policy';

function makeConsent() {
  const prisma = {
    consentRecord: {
      upsert: jest.fn().mockResolvedValue({
        policyVersion: PRIVACY_POLICY_VERSION,
        acceptedAt: new Date(),
      }),
      findUnique: jest.fn().mockResolvedValue(null),
    },
  };
  const rateLimit = { getClientIp: jest.fn().mockReturnValue('203.0.113.7') };
  return {
    prisma,
    service: new ConsentService(prisma as never, rateLimit as never),
  };
}

const req = { headers: { 'user-agent': 'SarhApp/1.0' } } as never;

describe('consent log', () => {
  it('records one row per user × policy × version (idempotent upsert, ip + UA kept)', async () => {
    const { prisma, service } = makeConsent();
    await service.record('u1', 'signup', req);
    expect(prisma.consentRecord.upsert).toHaveBeenCalledWith({
      where: {
        userId_policy_policyVersion: {
          userId: 'u1',
          policy: 'privacy',
          policyVersion: PRIVACY_POLICY_VERSION,
        },
      },
      update: {},
      create: expect.objectContaining({
        userId: 'u1',
        policyVersion: PRIVACY_POLICY_VERSION,
        source: 'signup',
        ip: '203.0.113.7',
        userAgent: 'SarhApp/1.0',
      }),
      select: expect.any(Object),
    });
  });

  it('status reports whether the current version was accepted', async () => {
    const { prisma, service } = makeConsent();
    await expect(service.status('u1')).resolves.toMatchObject({
      policyVersion: PRIVACY_POLICY_VERSION,
      accepted: false,
    });
    prisma.consentRecord.findUnique.mockResolvedValue({
      acceptedAt: new Date(),
    });
    await expect(service.status('u1')).resolves.toMatchObject({
      accepted: true,
    });
  });

  it('accept refuses an outdated version and records policy_update otherwise', async () => {
    const { prisma, service } = makeConsent();
    const controller = new PrivacyController(service);
    await expect(
      controller.accept(
        { userId: 'u1' } as never,
        { policyVersion: '1999-01' },
        req,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(prisma.consentRecord.upsert).not.toHaveBeenCalled();
    await controller.accept(
      { userId: 'u1' } as never,
      { policyVersion: PRIVACY_POLICY_VERSION },
      req,
    );
    expect(prisma.consentRecord.upsert.mock.calls[0][0].create.source).toBe(
      'policy_update',
    );
  });

  it('signup records consent and a logging failure never blocks registration', async () => {
    const auth = {
      register: jest.fn().mockResolvedValue({ user: { id: 'new-user' } }),
    };
    const consent = {
      record: jest.fn().mockRejectedValue(new Error('db down')),
    };
    const controller = new AuthController(auth as never, consent as never);
    const res = await controller.register({} as never, req);
    expect(consent.record).toHaveBeenCalledWith('new-user', 'signup', req);
    expect(res).toMatchObject({ success: true });
  });
});
