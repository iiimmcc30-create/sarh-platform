import { AISummarizerService } from './ai-summarizer.service';
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
});
