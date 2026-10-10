import {
  AISummarizerService,
  SUMMARY_RESPONSE_FORMAT,
} from './ai-summarizer.service';
import { LoggerService } from '../../common/services/logger.service';
import type { AiCallGuardService } from '../../ai-safety/ai-call-guard.service';

describe('AISummarizerService', () => {
  const logger = {
    error: jest.fn(),
    info: jest.fn(),
  } as unknown as LoggerService;
  const guard = { run: jest.fn() };

  const env = { ...process.env };

  afterEach(() => {
    process.env = { ...env };
    jest.clearAllMocks();
  });

  const input = {
    title: 'عنوان الخبر',
    content: 'محتوى الخبر عن الثروة الحيوانية',
    sourceName: 'مصدر',
    sourceUrl: 'https://example.com/news/1',
  };

  it('uses local fallback when OpenAI is not configured', async () => {
    delete process.env.OPENAI_API_KEY;
    const service = new AISummarizerService(
      logger,
      guard as unknown as AiCallGuardService,
    );
    expect(service.isConfigured()).toBe(false);
    const result = await service.summarize(input);
    expect(result.titleAr).toBe('عنوان الخبر');
    expect(result.summary).toContain('https://example.com/news/1');
    expect(result.summary).toContain('محتوى الخبر');
    expect(guard.run).not.toHaveBeenCalled();
  });

  it('SARH_AI_ENABLED=false → no model call, local fallback', async () => {
    process.env.OPENAI_API_KEY = 'sk-test-not-real';
    process.env.SARH_AI_ENABLED = 'false';
    const service = new AISummarizerService(
      logger,
      guard as unknown as AiCallGuardService,
    );
    expect(service.isConfigured()).toBe(false);
    const result = await service.summarize(input);
    expect(guard.run).not.toHaveBeenCalled();
    expect(result.summary).toContain('محتوى الخبر');
  });

  it('goes through the guard (budget/timeout) and falls back when it fails', async () => {
    process.env.OPENAI_API_KEY = 'sk-test-not-real';
    delete process.env.SARH_AI_ENABLED;
    guard.run.mockResolvedValue({ ok: false, reason: 'timeout', latencyMs: 1 });
    const service = new AISummarizerService(
      logger,
      guard as unknown as AiCallGuardService,
    );
    const result = await service.summarize({
      ...input,
      content: 'للتواصل 0501234567',
    });
    expect(guard.run).toHaveBeenCalledWith(
      expect.objectContaining({ feature: 'knowledge_summarizer' }),
    );
    expect(result.summary).toContain('https://example.com/news/1');
  });

  it('uses the model answer when the guard succeeds', async () => {
    process.env.OPENAI_API_KEY = 'sk-test-not-real';
    guard.run.mockResolvedValue({
      ok: true,
      latencyMs: 1,
      value: JSON.stringify({ titleAr: 'عنوان', summary: 'ملخص' }),
    });
    const service = new AISummarizerService(
      logger,
      guard as unknown as AiCallGuardService,
    );
    const result = await service.summarize(input);
    expect(result.titleAr).toBe('عنوان');
    expect(result.summary).toContain('ملخص');
    expect(result.summary).toContain(input.sourceUrl);
  });

  it('sends a strict json_schema and falls back when the model JSON cannot be parsed', async () => {
    process.env.OPENAI_API_KEY = 'sk-test-not-real';
    const create = jest.fn();
    const service = new AISummarizerService(
      logger,
      guard as unknown as AiCallGuardService,
    );
    const client = (
      service as unknown as {
        client: { chat: { completions: { create: typeof create } } };
      }
    ).client;
    client.chat.completions.create = create;

    create.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({ titleAr: 'عنوان', summary: 'ملخص' }),
          },
        },
      ],
      usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
    });
    guard.run.mockImplementationOnce(async (opts: { call: (c: unknown) => Promise<{ value: string }> }) => {
      const res = await opts.call({
        signal: new AbortController().signal,
        timeout: 1000,
        maxRetries: 0,
      });
      return { ok: true, value: res.value, latencyMs: 4 };
    });
    const ok = await service.summarize(input);
    expect(ok.summary).toContain('ملخص');
    expect(create.mock.calls[0][0].response_format).toEqual(
      SUMMARY_RESPONSE_FORMAT,
    );
    expect(create.mock.calls[0][0].response_format.json_schema.strict).toBe(
      true,
    );

    guard.run.mockResolvedValueOnce({
      ok: true,
      latencyMs: 1,
      value: '{not json',
    });
    const broken = await service.summarize(input);
    expect(broken.summary).toContain(input.sourceUrl);
    expect(broken.summary).toContain('محتوى الخبر');
    const errorLog = logger.error as unknown as jest.Mock;
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain('{not json');
  });
});
