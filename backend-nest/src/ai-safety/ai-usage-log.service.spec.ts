import { AiUsageLogService } from './ai-usage-log.service';
import { AiCallGuardService } from './ai-call-guard.service';
import type { AiBudgetService } from './ai-budget.service';

describe('AiUsageLogService', () => {
  const logger = { warn: jest.fn(), info: jest.fn() };
  const create = jest.fn();
  const prisma = { aiUsageLog: { create } };

  beforeEach(() => {
    jest.clearAllMocks();
    create.mockResolvedValue({ id: 'row' });
  });

  it('writes token counts only, and drops a non-uuid ticket id', async () => {
    const svc = new AiUsageLogService(prisma as never, logger as never);
    await svc.record({
      agent: 'support_assistant',
      model: 'gpt-4o-mini',
      inputTokens: 10.9,
      cachedTokens: 2,
      outputTokens: 4,
      latencyMs: 80,
      outcome: 'answered',
      ticketId: 'not a conversation',
    });
    expect(create).toHaveBeenCalledWith({
      data: {
        agent: 'support_assistant',
        model: 'gpt-4o-mini',
        inputTokens: 10,
        cachedTokens: 2,
        outputTokens: 4,
        latencyMs: 80,
        outcome: 'answered',
        ticketId: null,
      },
    });
    expect(JSON.stringify(create.mock.calls)).not.toContain('conversation');
  });

  it('ignores a missing table (migration not applied)', async () => {
    create.mockRejectedValue(
      Object.assign(new Error('table missing'), { code: 'P2021' }),
    );
    const svc = new AiUsageLogService(prisma as never, logger as never);
    await expect(
      svc.record({
        agent: 'knowledge_summarizer',
        model: 'm',
        inputTokens: 1,
        cachedTokens: 0,
        outputTokens: 1,
        latencyMs: 1,
        outcome: 'error',
      }),
    ).resolves.toBeUndefined();
    await svc.record({
      agent: 'knowledge_summarizer',
      model: 'm',
      inputTokens: 1,
      cachedTokens: 0,
      outputTokens: 1,
      latencyMs: 1,
      outcome: 'error',
    });
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('table missing');
  });

  it('does nothing when the Prisma delegate is absent', async () => {
    const svc = new AiUsageLogService({} as never, logger as never);
    await expect(
      svc.record({
        agent: 'support_assistant',
        model: 'm',
        inputTokens: 1,
        cachedTokens: 0,
        outputTokens: 0,
        latencyMs: 0,
        outcome: 'fallback',
      }),
    ).resolves.toBeUndefined();
  });
});

describe('AiCallGuardService usage log', () => {
  const logger = { info: jest.fn(), warn: jest.fn() };
  const budget = {
    reserve: jest.fn().mockResolvedValue({ ok: true, day: 'd', reserved: 10 }),
    settle: jest.fn(),
  };
  const usageLog = { record: jest.fn().mockResolvedValue(undefined) };

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.SARH_AI_ENABLED;
    budget.reserve.mockResolvedValue({ ok: true, day: 'd', reserved: 10 });
  });

  it('records answered usage including cached tokens, and survives a log failure', async () => {
    usageLog.record.mockRejectedValueOnce(new Error('db down'));
    const guard = new AiCallGuardService(
      budget as unknown as AiBudgetService,
      logger as never,
      usageLog as never,
    );
    const res = await guard.run({
      feature: 'support_assistant',
      model: 'gpt-4o-mini',
      inputChars: 30,
      maxOutputTokens: 20,
      call: async () => ({
        value: 'ok',
        usage: {
          prompt_tokens: 11,
          completion_tokens: 3,
          prompt_tokens_details: { cached_tokens: 4 },
        },
      }),
    });
    expect(res.ok).toBe(true);
    expect(usageLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: 'support_assistant',
        model: 'gpt-4o-mini',
        inputTokens: 11,
        cachedTokens: 4,
        outputTokens: 3,
        outcome: 'answered',
      }),
    );
  });
});
