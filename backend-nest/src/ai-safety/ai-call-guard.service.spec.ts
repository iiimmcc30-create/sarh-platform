import { AiCallGuardService } from './ai-call-guard.service';
import type { AiBudgetService } from './ai-budget.service';

describe('AiCallGuardService', () => {
  const env = { ...process.env };
  const logger = { info: jest.fn(), warn: jest.fn() };
  const budget = {
    reserve: jest.fn(),
    settle: jest.fn(),
  };
  let guard: AiCallGuardService;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...env };
    delete process.env.SARH_AI_ENABLED;
    budget.reserve.mockResolvedValue({ ok: true, day: 'd', reserved: 500 });
    guard = new AiCallGuardService(
      budget as unknown as AiBudgetService,
      logger as never,
    );
  });
  afterAll(() => {
    process.env = env;
  });

  const base = {
    feature: 'test',
    model: 'm',
    inputChars: 300,
    maxOutputTokens: 100,
  };

  it('passes signal / timeout / retries to the call and settles real usage', async () => {
    process.env.SARH_AI_TIMEOUT_MS = '5000';
    const call = jest.fn(async () => ({
      value: 'ok',
      usage: { prompt_tokens: 120, completion_tokens: 30, total_tokens: 150 },
    }));
    const res = await guard.run({ ...base, call });
    expect(res).toEqual(expect.objectContaining({ ok: true, value: 'ok' }));
    const controls = (call.mock.calls[0] as unknown[])[0] as {
      signal: AbortSignal;
      timeout: number;
      maxRetries: number;
    };
    expect(controls.signal).toBeInstanceOf(AbortSignal);
    expect(controls.timeout).toBe(5000);
    expect(controls.maxRetries).toBe(1);
    expect(budget.settle).toHaveBeenCalledWith(
      expect.objectContaining({ ok: true }),
      150,
    );
    // reservation = input estimate (300/3 + 50) + max output
    expect(budget.reserve).toHaveBeenCalledWith(250, 'test');
  });

  it('SARH_AI_ENABLED=false: no call and no budget use', async () => {
    process.env.SARH_AI_ENABLED = 'false';
    const call = jest.fn();
    const res = await guard.run({ ...base, call });
    expect(res).toEqual(
      expect.objectContaining({ ok: false, reason: 'disabled' }),
    );
    expect(call).not.toHaveBeenCalled();
    expect(budget.reserve).not.toHaveBeenCalled();
  });

  it.each(['0', 'off', 'OFF', 'no', 'disabled'])(
    'SARH_AI_ENABLED=%s also disables',
    async (v) => {
      process.env.SARH_AI_ENABLED = v;
      const call = jest.fn();
      expect((await guard.run({ ...base, call })).ok).toBe(false);
      expect(call).not.toHaveBeenCalled();
    },
  );

  it('budget exhausted: no call', async () => {
    budget.reserve.mockResolvedValue({ ok: false, reason: 'tokens' });
    const call = jest.fn();
    const res = await guard.run({ ...base, call });
    expect(res).toEqual(
      expect.objectContaining({ ok: false, reason: 'budget' }),
    );
    expect(call).not.toHaveBeenCalled();
  });

  it('times out a hanging call, aborts the request and keeps the reservation', async () => {
    process.env.SARH_AI_TIMEOUT_MS = '1000';
    let signal: AbortSignal | undefined;
    const started = Date.now();
    const res = await guard.run({
      ...base,
      call: ({ signal: s }) => {
        signal = s;
        return new Promise(() => undefined); // never resolves
      },
    });
    expect(res).toEqual(
      expect.objectContaining({ ok: false, reason: 'timeout' }),
    );
    expect(Date.now() - started).toBeLessThan(3000);
    expect(signal?.aborted).toBe(true);
    expect(budget.settle).toHaveBeenCalledWith(expect.anything(), null, {
      refund: false,
    });
  });

  it('treats the SDK timeout error as a timeout', async () => {
    const err = Object.assign(new Error('Request timed out.'), {
      name: 'APIConnectionTimeoutError',
    });
    const res = await guard.run({
      ...base,
      call: async () => {
        throw err;
      },
    });
    expect(res).toEqual(
      expect.objectContaining({ ok: false, reason: 'timeout' }),
    );
  });

  it('HTTP error from the provider: refunds and never logs the provider message', async () => {
    const err = Object.assign(
      new Error('Incorrect API key provided: sk-test-SECRETVALUE'),
      { name: 'AuthenticationError', status: 401 },
    );
    const res = await guard.run({
      ...base,
      call: async () => {
        throw err;
      },
    });
    expect(res).toEqual(
      expect.objectContaining({ ok: false, reason: 'error' }),
    );
    expect(budget.settle).toHaveBeenCalledWith(expect.anything(), null, {
      refund: true,
    });
    const logged = JSON.stringify([
      logger.warn.mock.calls,
      logger.info.mock.calls,
    ]);
    expect(logged).not.toContain('SECRETVALUE');
    expect(logged).not.toContain('Incorrect API key');
    expect(logged).toContain('AuthenticationError');
  });

  it('logs only metadata (no prompt / answer text)', async () => {
    await guard.run({
      ...base,
      call: async () => ({ value: 'جوابي السري', usage: null }),
    });
    const logged = JSON.stringify(logger.info.mock.calls);
    expect(logged).toContain('AI_USAGE');
    expect(logged).not.toContain('جوابي السري');
  });
});
