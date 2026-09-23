import { NewsFetcherService } from './news-fetcher.service';
import { LoggerService } from '../../common/services/logger.service';
import axios from 'axios';

jest.mock('axios');

describe('NewsFetcherService', () => {
  const logError = jest.fn();
  const logger = {
    error: logError,
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  } as unknown as LoggerService;

  it('maps API payload articles into FetchedNewsItem[]', async () => {
    (axios.get as jest.Mock).mockResolvedValue({
      data: {
        articles: [
          {
            title: 'خبر تجريبي',
            url: 'https://example.com/news/1',
            publishedAt: '2026-07-01T10:00:00Z',
            summary: 'محتوى الخبر',
          },
        ],
      },
    });

    const service = new NewsFetcherService(logger);
    const items = await service.fetchFromApi('https://example.com/api/news');
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('خبر تجريبي');
    expect(items[0].url).toContain('example.com');
  });

  it('propagates RSS fetch errors after logging', async () => {
    const service = new NewsFetcherService(logger);
    const err = new Error('network');
    jest.spyOn((service as any).parser, 'parseURL').mockRejectedValue(err);

    await expect(
      service.fetchFromRss('https://bad.example/rss'),
    ).rejects.toThrow('network');
    expect(logError).toHaveBeenCalled();
  });
});
