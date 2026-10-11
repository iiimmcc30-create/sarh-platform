/**
 * Socket and worker graphs must boot without the customer-service agent
 * (and therefore without SubscriptionBillingService on the socket process).
 */
describe('standalone process boot', () => {
  jest.setTimeout(60_000);

  async function withBootEnv<T>(fn: () => Promise<T>): Promise<T> {
    const previousRedis = process.env.REDIS_ENABLED;
    const previousDb = process.env.DATABASE_URL;
    const previousJwt = process.env.JWT_SECRET;
    const previousRefresh = process.env.JWT_REFRESH_SECRET;
    process.env.REDIS_ENABLED = 'false';
    process.env.JWT_SECRET =
      process.env.JWT_SECRET || 'local-boot-test-jwt-secret-32chars';
    process.env.JWT_REFRESH_SECRET =
      process.env.JWT_REFRESH_SECRET || 'local-boot-test-refresh-secret-32';
    process.env.DATABASE_URL =
      previousDb ||
      'postgresql://boot:boot@127.0.0.1:1/boot?connect_timeout=1';
    try {
      return await fn();
    } finally {
      if (previousRedis === undefined) delete process.env.REDIS_ENABLED;
      else process.env.REDIS_ENABLED = previousRedis;
      if (previousJwt === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = previousJwt;
      if (previousRefresh === undefined) delete process.env.JWT_REFRESH_SECRET;
      else process.env.JWT_REFRESH_SECRET = previousRefresh;
      if (previousDb === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousDb;
    }
  }

  it('GatewayModule finishes within 20 seconds without CsAccountReads', async () => {
    await withBootEnv(async () => {
      await jest.isolateModulesAsync(async () => {
        const { Test } = await import('@nestjs/testing');
        const { GatewayModule } = await import('./gateway/gateway.module');
        const { CsAccountReads } = await import(
          './ai-agents/cs/cs-account-reads'
        );
        const { SupportTicketsService } = await import(
          './support/services/support-tickets.service'
        );
        const started = Date.now();
        const compiled = await Promise.race([
          Test.createTestingModule({ imports: [GatewayModule] }).compile(),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error('GatewayModule boot exceeded 20s')),
              20_000,
            ),
          ),
        ]);
        expect(Date.now() - started).toBeLessThan(20_000);
        expect(compiled.get(SupportTicketsService, { strict: false })).toBeInstanceOf(
          SupportTicketsService,
        );
        expect(() => compiled.get(CsAccountReads)).toThrow(
          /does not exist|Nest could not find CsAccountReads/i,
        );
        await compiled.close();
      });
    });
  });

  it('WorkerModule finishes within 20 seconds', async () => {
    await withBootEnv(async () => {
      await jest.isolateModulesAsync(async () => {
        const { Test } = await import('@nestjs/testing');
        const { WorkerModule } = await import('./queue/worker.module');
        const { WorkerCronService } = await import(
          './queue/services/worker-cron.service'
        );
        const started = Date.now();
        const compiled = await Promise.race([
          Test.createTestingModule({ imports: [WorkerModule] }).compile(),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error('WorkerModule boot exceeded 20s')),
              20_000,
            ),
          ),
        ]);
        expect(Date.now() - started).toBeLessThan(20_000);
        expect(compiled.get(WorkerCronService, { strict: false })).toBeInstanceOf(
          WorkerCronService,
        );
        await compiled.close();
      });
    });
  });
});
