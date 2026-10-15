import * as jwt from 'jsonwebtoken';
import { RateLimitService } from './rate-limit.service';

describe('RateLimitService per-account bucket', () => {
  const OLD = { ...process.env };
  beforeEach(() => {
    process.env.JWT_SECRET = 'x'.repeat(40);
    process.env.REDIS_ENABLED = 'false';
    process.env.NODE_ENV = 'test';
    process.env.RATE_LIMIT_MAX = '3';
  });
  afterAll(() => {
    process.env = OLD;
  });

  const logger = { warn: jest.fn(), error: jest.fn(), info: jest.fn() } as never;
  const res = () => ({ setHeader: jest.fn() }) as never;
  const req = (auth?: string) =>
    ({
      headers: auth ? { authorization: auth } : {},
      socket: { remoteAddress: '1.2.3.4' },
      url: '/api/x',
    }) as never;

  it('signed-in users are not throttled by the shared per-IP budget', async () => {
    const svc = new RateLimitService(logger);
    const token = jwt.sign({ userId: 'u1' }, process.env.JWT_SECRET!);
    for (let i = 0; i < 50; i++) {
      expect(await svc.consume(req(`Bearer ${token}`), res(), 'api')).toBe(true);
    }
  });

  it('forged tokens fall back to the per-IP bucket', async () => {
    const svc = new RateLimitService(logger);
    const forged = jwt.sign({ userId: 'u2' }, 'y'.repeat(40));
    const results: boolean[] = [];
    for (let i = 0; i < 5; i++) results.push(await svc.consume(req(`Bearer ${forged}`), res(), 'api'));
    expect(results.filter(Boolean).length).toBe(3);
  });
});
