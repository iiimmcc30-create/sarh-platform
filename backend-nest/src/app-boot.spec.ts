/**
 * The customer-service write token aliased the ticket service while that
 * service injected the agent. Nest waited on that cycle and never listened.
 * Dependency initialization is the phase that stopped after ListingsModule.
 */
describe('AppModule boot', () => {
  jest.setTimeout(60_000);

  it('finishes dependency initialization within 20 seconds', async () => {
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
      await jest.isolateModulesAsync(async () => {
        const { Test } = await import('@nestjs/testing');
        const { AppModule } = await import('./app.module');
        const { CsAgentService } = await import('./ai-agents/cs/cs-agent.service');
        const { SupportTicketsService } = await import(
          './support/services/support-tickets.service'
        );
        const started = Date.now();
        const compiled = await Promise.race([
          Test.createTestingModule({ imports: [AppModule] }).compile(),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error('AppModule boot exceeded 20s')),
              20_000,
            ),
          ),
        ]);
        expect(Date.now() - started).toBeLessThan(20_000);
        expect(compiled.get(CsAgentService, { strict: false })).toBeInstanceOf(
          CsAgentService,
        );
        expect(
          compiled.get(SupportTicketsService, { strict: false }),
        ).toBeInstanceOf(SupportTicketsService);
        await compiled.close();
      });
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
  });
});
