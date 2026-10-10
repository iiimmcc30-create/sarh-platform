import { AiCallGuardService } from '../../ai-safety/ai-call-guard.service';
import type { AiBudgetService } from '../../ai-safety/ai-budget.service';
import type { SupportAiContext } from './ai-provider';
import {
  AI_PAUSED_NOTICE_AR,
  AI_TIMEOUT_NOTICE_AR,
  OpenAiAiProvider,
} from './openai-ai.provider';

/** Synthetic values only. */
const PHONE = '0501234567';
const PHONE_INTL = '+966 55 765 4321';
const EMAIL = 'customer.test@example.com';
const NATIONAL_ID = '1012345678';
const IQAMA = '٢٤١٢٣٤٥٦٧٨';
const IBAN = 'SA03 8000 0000 6080 1016 7519';

type CreateFn = jest.Mock<any, any[]>;

class TestProvider extends OpenAiAiProvider {
  constructor(
    guard: AiCallGuardService,
    public readonly create: CreateFn,
  ) {
    super('sk-test-not-a-real-key', 'gpt-test', logger as never, guard);
  }
  protected override get chat() {
    return { create: this.create } as never;
  }
}

const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

function ctx(
  body: string,
  over: Partial<SupportAiContext> = {},
): SupportAiContext {
  return {
    ticketNumber: 'SRH-2026-000077',
    category: 'OTHER_HELP',
    customerFirstName: 'متعب',
    customerDescription: body,
    missingInformation: [],
    recentMessages: [
      { authorKind: 'STAFF', body: `تواصل معنا على ${PHONE_INTL}` },
      { authorKind: 'CUSTOMER', body },
    ],
    knowledge: [
      {
        key: 'promo-how',
        questionAr: 'كيف أميز إعلاني؟',
        answerAr: 'من صفحة الإعلان اضغط «تمييز» واختر المدة.',
        score: 0.9,
      },
    ],
    ...over,
  };
}

function completion(content: unknown) {
  return {
    choices: [{ message: { content: JSON.stringify(content) } }],
    usage: { prompt_tokens: 400, completion_tokens: 60, total_tokens: 460 },
  };
}

describe('OpenAiAiProvider (guarded «مساعد سرح» model calls)', () => {
  const env = { ...process.env };
  const budget = {
    reserve: jest.fn(),
    settle: jest.fn(),
  };
  let guard: AiCallGuardService;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...env };
    delete process.env.SARH_AI_ENABLED;
    delete process.env.SARH_ASSISTANT_ENABLED;
    budget.reserve.mockResolvedValue({ ok: true, day: 'd', reserved: 1000 });
    guard = new AiCallGuardService(
      budget as unknown as AiBudgetService,
      logger as never,
    );
  });
  afterAll(() => {
    process.env = env;
  });

  const body = `ابي اميز اعلاني، جوالي ${PHONE} وايميلي ${EMAIL} وهويتي ${NATIONAL_ID} وإقامة أخوي ${IQAMA} وحسابي ${IBAN}`;

  it('sends no obvious personal data to OpenAI (customer text, staff history, name)', async () => {
    const create: CreateFn = jest.fn(async () =>
      completion({
        replyAr: 'اضغط «تمييز».',
        issueType: 'PROMOTION_ISSUE',
        escalate: false,
      }),
    );
    await new TestProvider(guard, create).completeSupportTurn(ctx(body));
    expect(create).toHaveBeenCalledTimes(1);
    const sent = JSON.stringify(create.mock.calls[0][0]);
    for (const value of [
      PHONE,
      '0557654321',
      '557654321',
      EMAIL,
      NATIONAL_ID,
      '2412345678',
      'SA0380000000608010167519',
      '8000 0000',
      'متعب',
    ]) {
      expect(sent).not.toContain(value);
    }
    expect(sent).not.toMatch(/05\d{8}/);
    expect(sent).toContain('[PHONE_');
    expect(sent).toContain('[EMAIL_1]');
    expect(sent).toContain('[NATIONAL_ID_1]');
    expect(sent).toContain('[IQAMA_1]');
    expect(sent).toContain('[IBAN_1]');
    // ticket number and the FAQ context still reach the model
    expect(sent).toContain('SRH-2026-000077');
    expect(sent).toContain('تمييز');
  });

  it('sets output cap, store:false and passes abort signal / timeout / retries', async () => {
    process.env.SARH_AI_MAX_OUTPUT_TOKENS = '500';
    const create: CreateFn = jest.fn(async () =>
      completion({ replyAr: 'تمام', issueType: 'OTHER', escalate: false }),
    );
    await new TestProvider(guard, create).completeSupportTurn(
      ctx('ابي اميز اعلاني'),
    );
    const [params, options] = create.mock.calls[0];
    expect(params.max_completion_tokens).toBe(500);
    expect(params.store).toBe(false);
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.timeout).toBe(15000);
    expect(options.maxRetries).toBe(1);
  });

  it('restores pseudonyms in the reply shown to the same customer', async () => {
    const create: CreateFn = jest.fn(async () =>
      completion({
        replyAr: 'بنتواصل معك على [PHONE_1]',
        issueType: 'OTHER',
        escalate: false,
      }),
    );
    const d = await new TestProvider(guard, create).completeSupportTurn(
      ctx(body),
    );
    expect(d.replyAr).toBe(`بنتواصل معك على ${PHONE}`);
  });

  it('timeout → FAQ answer with a timeout notice (no crash)', async () => {
    process.env.SARH_AI_TIMEOUT_MS = '1000';
    const create: CreateFn = jest.fn(() => new Promise(() => undefined));
    const d = await new TestProvider(guard, create).completeSupportTurn(
      ctx('ابي اميز اعلاني'),
    );
    expect(d.escalate).toBe(false);
    expect(d.replyAr.startsWith(AI_TIMEOUT_NOTICE_AR)).toBe(true);
    expect(d.replyAr).toContain('تمييز');
  });

  it('daily budget reached → no call, FAQ answer with a paused notice', async () => {
    budget.reserve.mockResolvedValue({ ok: false, reason: 'tokens' });
    const create: CreateFn = jest.fn();
    const d = await new TestProvider(guard, create).completeSupportTurn(
      ctx('ابي اميز اعلاني'),
    );
    expect(create).not.toHaveBeenCalled();
    expect(d.replyAr.startsWith(AI_PAUSED_NOTICE_AR)).toBe(true);
  });

  it('SARH_AI_ENABLED=false → no OpenAI call, rule-based answer', async () => {
    process.env.SARH_AI_ENABLED = 'false';
    const create: CreateFn = jest.fn();
    const d = await new TestProvider(guard, create).completeSupportTurn(
      ctx('ابي اميز اعلاني'),
    );
    expect(create).not.toHaveBeenCalled();
    expect(budget.reserve).not.toHaveBeenCalled();
    expect(d.replyAr).toContain('تمييز');
  });

  it('provider error / broken JSON → rule-based fallback, error text not logged', async () => {
    const create: CreateFn = jest.fn(async () => {
      throw Object.assign(
        new Error('Incorrect API key provided: sk-abc-LEAK'),
        {
          name: 'AuthenticationError',
          status: 401,
        },
      );
    });
    const d = await new TestProvider(guard, create).completeSupportTurn(
      ctx('ابي اميز اعلاني'),
    );
    expect(d.replyAr).toContain('تمييز');
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('LEAK');

    const broken: CreateFn = jest.fn(async () => ({
      choices: [{ message: { content: '{not json' } }],
    }));
    const d2 = await new TestProvider(guard, broken).completeSupportTurn(
      ctx('ابي اميز اعلاني'),
    );
    expect(d2.replyAr).toContain('تمييز');
  });

  it('model escalation carries a reason; deterministic paths never call the model', async () => {
    const create: CreateFn = jest.fn(async () =>
      completion({ replyAr: '', issueType: 'OTHER', escalate: true }),
    );
    const p = new TestProvider(guard, create);
    const d = await p.completeSupportTurn(ctx('ابي اميز اعلاني'));
    expect(d).toEqual(
      expect.objectContaining({
        escalate: true,
        escalationReason: 'assistant_decision',
      }),
    );

    create.mockClear();
    const refund = await p.completeSupportTurn(ctx('أبي استرجع فلوسي'));
    expect(create).not.toHaveBeenCalled();
    expect(refund).toEqual(
      expect.objectContaining({ escalate: true, escalationReason: 'refund' }),
    );
  });
});
