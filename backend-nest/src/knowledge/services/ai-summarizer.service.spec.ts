import { AISummarizerService } from './ai-summarizer.service';
import { LoggerService } from '../../common/services/logger.service';

describe('AISummarizerService', () => {
  const logger = {
    error: jest.fn(),
    info: jest.fn(),
  } as unknown as LoggerService;

  const originalKey = process.env.OPENAI_API_KEY;

  afterEach(() => {
    process.env.OPENAI_API_KEY = originalKey;
  });

  it('uses local fallback when OpenAI is not configured', async () => {
    delete process.env.OPENAI_API_KEY;
    const service = new AISummarizerService(logger);
    expect(service.isConfigured()).toBe(false);
    const result = await service.summarize({
      title: 'عنوان الخبر',
      content: 'محتوى الخبر عن الثروة الحيوانية',
      sourceName: 'مصدر',
      sourceUrl: 'https://example.com/news/1',
    });
    expect(result.titleAr).toBe('عنوان الخبر');
    expect(result.summary).toContain('https://example.com/news/1');
    expect(result.summary).toContain('محتوى الخبر');
  });
});
