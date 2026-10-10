import { RedisCacheService } from './redis-cache.service';

describe('RedisCacheService.releaseClaim', () => {
  const prev = process.env.REDIS_ENABLED;

  beforeEach(() => {
    process.env.REDIS_ENABLED = 'false';
  });

  afterAll(() => {
    if (prev === undefined) delete process.env.REDIS_ENABLED;
    else process.env.REDIS_ENABLED = prev;
  });

  it('drops an in-memory claim so the next claimOnce can succeed', async () => {
    const cache = new RedisCacheService({
      warn: jest.fn(),
      info: jest.fn(),
    } as never);
    expect(await cache.claimOnce('support:handoff-alert:t1', 60)).toBe(true);
    expect(await cache.claimOnce('support:handoff-alert:t1', 60)).toBe(false);
    await cache.releaseClaim('support:handoff-alert:t1');
    expect(await cache.claimOnce('support:handoff-alert:t1', 60)).toBe(true);
  });
});
