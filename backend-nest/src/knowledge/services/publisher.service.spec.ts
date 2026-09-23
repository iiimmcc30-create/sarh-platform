import { PublisherService } from './publisher.service';
import { KnowledgeRepository } from '../repositories/knowledge.repository';
import { LoggerService } from '../../common/services/logger.service';
import { RedisCacheService } from '../../redis/services/redis-cache.service';
import { AppNotificationsService } from '../../queue/services/app-notifications.service';

describe('PublisherService', () => {
  const findArticleById = jest.fn();
  const findKnowledgeUser = jest.fn();
  const createPost = jest.fn();
  const updateArticle = jest.fn();
  const softHidePost = jest.fn();
  const findFollowerIds = jest.fn().mockResolvedValue([]);
  const cacheDel = jest.fn().mockResolvedValue(undefined);
  const delPattern = jest.fn().mockResolvedValue(0);
  const notifyUsers = jest.fn().mockResolvedValue(undefined);

  const repo = {
    findArticleById,
    findKnowledgeUser,
    createPost,
    updateArticle,
    softHidePost,
    findFollowerIds,
  } as unknown as KnowledgeRepository;

  const cache = {
    del: cacheDel,
    delPattern,
  } as unknown as RedisCacheService;

  const notifications = {
    notifyUsers,
  } as unknown as AppNotificationsService;

  const logger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  } as unknown as LoggerService;

  const service = new PublisherService(repo, cache, notifications, logger);

  beforeEach(() => {
    jest.clearAllMocks();
    findFollowerIds.mockResolvedValue([]);
  });

  it('builds post body with trusted tag and source metadata', () => {
    const body = service.buildPostBody({
      titleAr: 'عنوان',
      summary: 'ملخص\n\n🔗 المصدر:\nhttps://example.com',
      sourceName: 'مصدر موثوق',
      publishedAt: new Date('2026-07-01T00:00:00Z'),
    });

    expect(body.arabicContent).toContain('عنوان');
    expect(body.arabicContent).toContain('وسم: خبر موثوق');
    expect(body.arabicContent).toContain('مصدر موثوق');
    expect(body.content).toContain('trusted-news');
  });

  it('publishes pending summarized articles as posts', async () => {
    findArticleById.mockResolvedValue({
      id: 'a1',
      status: 'PENDING',
      postId: null,
      summary: 'ملخص',
      titleAr: 'عنوان',
      publishedAt: new Date(),
      source: { name: 'MEWA' },
    });
    findKnowledgeUser.mockResolvedValue({
      id: 'u-ai',
      arabicName: 'مركز المعرفة',
    });
    createPost.mockResolvedValue({ id: 'p1' });
    updateArticle.mockResolvedValue({
      id: 'a1',
      status: 'PUBLISHED',
      postId: 'p1',
    });
    findFollowerIds.mockResolvedValue([
      { followerId: 'u1' },
      { followerId: 'u2' },
    ]);

    const result = await service.publishArticle('a1');
    expect(createPost).toHaveBeenCalled();
    expect(updateArticle).toHaveBeenCalled();
    expect(notifyUsers).toHaveBeenCalledWith(
      ['u1', 'u2'],
      expect.objectContaining({
        titleAr: 'منشور جديد من مركز المعرفة',
        data: { postId: 'p1', authorId: 'u-ai' },
      }),
    );
    expect(result.status).toBe('PUBLISHED');
    expect(cacheDel).toHaveBeenCalledWith('posts:feed:first');
  });

  it('rejects articles and hides linked posts', async () => {
    findArticleById.mockResolvedValue({
      id: 'a1',
      status: 'PUBLISHED',
      postId: 'p1',
    });
    updateArticle.mockResolvedValue({
      id: 'a1',
      status: 'REJECTED',
    });

    await service.rejectArticle('a1', 'محتوى غير مناسب');
    expect(softHidePost).toHaveBeenCalledWith('p1');
    expect(updateArticle).toHaveBeenCalled();
  });
});
