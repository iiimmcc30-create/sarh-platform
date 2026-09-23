import { Injectable, OnModuleInit } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { KnowledgeSourceType } from '@prisma/client';
import { LoggerService } from '../../common/services/logger.service';
import { throwApi } from '../../common/exceptions/api.exception';
import { RedisCacheService } from '../../redis/services/redis-cache.service';
import { KnowledgeRepository } from '../repositories/knowledge.repository';
import { NewsFetcherService } from './news-fetcher.service';
import { AISummarizerService } from './ai-summarizer.service';
import { PublisherService } from './publisher.service';
import { DEFAULT_KNOWLEDGE_SOURCES } from '../constants/default-sources';
import {
  CreateKnowledgePostDto,
  CreateKnowledgeSourceDto,
  UpdateKnowledgeProfileDto,
  UpdateKnowledgeSourceDto,
} from '../dto/knowledge.dto';

@Injectable()
export class KnowledgeCenterService implements OnModuleInit {
  private syncRunning = false;

  constructor(
    private readonly repo: KnowledgeRepository,
    private readonly fetcher: NewsFetcherService,
    private readonly summarizer: AISummarizerService,
    private readonly publisher: PublisherService,
    private readonly logger: LoggerService,
    private readonly cache: RedisCacheService,
  ) {}

  async onModuleInit() {
    await this.ensureKnowledgeUser();
    await this.ensureDefaultSources();
  }

  async ensureKnowledgeUser() {
    const existing = await this.repo.findKnowledgeUser();
    if (existing) {
      if (!existing.isActive || !existing.isAI || !existing.verified) {
        return this.repo.updateKnowledgeUserFlags(existing.id);
      }
      return existing;
    }

    const passwordHash = await bcrypt.hash(randomBytes(48).toString('hex'), 12);
    const user = await this.repo.createKnowledgeUser({ passwordHash });
    this.logger.info({ userId: user.id }, 'Knowledge Center user created');
    await this.repo.createSyncLog({
      level: 'info',
      message: 'تم إنشاء حساب مركز المعرفة',
      meta: { userId: user.id },
    });
    return user;
  }

  async ensureDefaultSources() {
    const count = await this.repo.countSources();
    if (count > 0) return { seeded: 0, total: count };

    let seeded = 0;
    for (const source of DEFAULT_KNOWLEDGE_SOURCES) {
      const existing = await this.repo.findSourceByUrl(source.url);
      if (existing) continue;
      await this.repo.createSource({
        name: source.name,
        url: source.url,
        type: source.type,
        enabled: true,
      });
      seeded += 1;
    }

    if (seeded > 0) {
      await this.repo.createSyncLog({
        level: 'info',
        message: `تمت إضافة ${seeded} مصادر افتراضية لمركز المعرفة`,
        meta: { seeded },
      });
      this.logger.info({ seeded }, 'Default knowledge sources seeded');
    }

    return { seeded, total: count + seeded };
  }

  /**
   * Activate Knowledge Center for in-app publishing + interaction:
   * ensure AI user, seed sources, auto-follow for all users, optional sync.
   */
  async activateAccount(options?: { sync?: boolean }) {
    const user = await this.ensureKnowledgeUser();
    const sources = await this.ensureDefaultSources();
    const follows = await this.repo.ensureFollowedByAllActiveUsers(user.id);

    // Ensure default sources are enabled so publishing can run
    const defaultUrls = new Set(DEFAULT_KNOWLEDGE_SOURCES.map((s) => s.url));
    const allSources = await this.repo.listSources();
    let enabled = 0;
    for (const source of allSources) {
      if (!source.enabled && defaultUrls.has(source.url)) {
        await this.repo.updateSource(source.id, { enabled: true });
        enabled += 1;
      }
    }

    await this.repo.createSyncLog({
      level: 'info',
      message: 'تم تفعيل حساب مركز المعرفة للنشر والتفاعل',
      meta: {
        userId: user.id,
        sourcesSeeded: sources.seeded,
        followsCreated: follows.followsCreated,
        sourcesEnabled: enabled,
      },
    });

    let syncStats: Awaited<
      ReturnType<KnowledgeCenterService['syncAll']>
    > | null = null;
    if (options?.sync !== false) {
      syncStats = await this.syncAll();
    }

    this.logger.info(
      { userId: user.id, sources, follows, syncStats },
      'Knowledge Center account activated',
    );

    return {
      user: {
        id: user.id,
        username: user.username,
        arabicName: user.arabicName,
        isAI: user.isAI,
        verified: user.verified,
        isActive: user.isActive,
      },
      sources,
      follows,
      sourcesEnabled: enabled,
      sync: syncStats,
    };
  }

  async getProfile() {
    const user = await this.repo.findKnowledgeUser();
    if (!user) return null;
    return {
      id: user.id,
      username: user.username,
      arabicName: user.arabicName,
      displayName: user.displayName,
      avatar: user.avatar,
      bio: user.bio,
      isAI: user.isAI,
      verified: user.verified,
      isActive: user.isActive,
    };
  }

  async updateProfile(dto: UpdateKnowledgeProfileDto) {
    const user = await this.repo.findKnowledgeUser();
    if (!user) throwApi(404, 'not_found', 'حساب مركز المعرفة غير موجود');
    const updated = await this.repo.updateKnowledgeUserProfile(user.id, dto);
    await this.repo.createSyncLog({
      level: 'info',
      message: 'تم تحديث ملف مركز المعرفة',
      meta: { fields: Object.keys(dto) },
    });
    return updated;
  }

  async createDirectPost(dto: CreateKnowledgePostDto) {
    const user = await this.repo.findKnowledgeUser();
    if (!user) throwApi(404, 'not_found', 'حساب مركز المعرفة غير موجود');

    const post = await this.repo.createDirectPost({
      authorId: user.id,
      content: dto.content,
      arabicContent: dto.content,
      image: dto.imageUrl ?? null,
    });

    const followers = await this.repo.findFollowerIds(user.id);
    if (followers.length > 0) {
      await this.publisher
        .notifyFollowers(user, post.id, dto.content.slice(0, 80))
        .catch(() => undefined);
    }

    await this.cache.del('posts:feed:first').catch(() => undefined);
    await this.cache.delPattern('posts:feed:*').catch(() => 0);
    await this.cache.delPattern('posts:feed:following:*').catch(() => 0);

    await this.repo.createSyncLog({
      level: 'info',
      message: 'تم نشر منشور مباشر من مركز المعرفة',
      meta: { postId: post.id },
    });

    this.logger.info(
      { postId: post.id, authorId: user.id },
      'Knowledge direct post created',
    );
    return post;
  }

  async ensureFollowedByUser(userId: string) {
    const knowledge = await this.ensureKnowledgeUser();
    await this.repo.ensureFollowedByUser(userId, knowledge.id);
  }

  listSources() {
    return this.repo.listSources();
  }

  async createSource(dto: CreateKnowledgeSourceDto) {
    const source = await this.repo.createSource({
      name: dto.name.trim(),
      url: dto.url.trim(),
      type: dto.type,
      enabled: dto.enabled ?? true,
    });
    await this.repo.createSyncLog({
      sourceId: source.id,
      level: 'info',
      message: `تمت إضافة مصدر: ${source.name}`,
    });
    return source;
  }

  async updateSource(id: string, dto: UpdateKnowledgeSourceDto) {
    const existing = await this.repo.findSourceById(id);
    if (!existing) throwApi(404, 'not_found', 'المصدر غير موجود');
    const source = await this.repo.updateSource(id, {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.url !== undefined ? { url: dto.url.trim() } : {}),
      ...(dto.type !== undefined ? { type: dto.type } : {}),
      ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
    });
    await this.repo.createSyncLog({
      sourceId: id,
      level: 'info',
      message: `تم تحديث المصدر: ${source.name}`,
    });
    return source;
  }

  async deleteSource(id: string) {
    const existing = await this.repo.findSourceById(id);
    if (!existing) throwApi(404, 'not_found', 'المصدر غير موجود');
    await this.repo.deleteSource(id);
    await this.repo.createSyncLog({
      level: 'warn',
      message: `تم حذف المصدر: ${existing.name}`,
      meta: { sourceId: id },
    });
    return { deleted: true };
  }

  async setSourceEnabled(id: string, enabled: boolean) {
    return this.updateSource(id, { enabled });
  }

  async listArticles(params: {
    status?: 'PENDING' | 'PUBLISHED' | 'REJECTED';
    sourceId?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));
    const { items, total } = await this.repo.listArticles({
      status: params.status,
      sourceId: params.sourceId,
      page,
      pageSize,
    });
    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async listLogs(params: { page?: number; pageSize?: number }) {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 50));
    const { items, total } = await this.repo.listSyncLogs({ page, pageSize });
    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  approveArticle(id: string) {
    return this.publisher.publishArticle(id);
  }

  rejectArticle(id: string, reason?: string) {
    return this.publisher.rejectArticle(id, reason);
  }

  async publishManual(id: string) {
    const article = await this.repo.findArticleById(id);
    if (!article) throwApi(404, 'not_found', 'الخبر غير موجود');

    if (!article.summary || !article.titleAr) {
      await this.summarizeAndStore(article.id);
    }
    return this.publisher.publishArticle(id);
  }

  async syncAll(options?: { sourceId?: string }) {
    if (this.syncRunning) {
      this.logger.warn({}, 'Knowledge sync already running');
      return { skipped: true, reason: 'already_running' };
    }

    this.syncRunning = true;
    const startedAt = Date.now();
    const stats = {
      sources: 0,
      fetched: 0,
      created: 0,
      published: 0,
      skipped: 0,
      failed: 0,
    };

    try {
      await this.ensureKnowledgeUser();
      const sources = options?.sourceId
        ? [await this.repo.findSourceById(options.sourceId)].filter(
            (s): s is NonNullable<typeof s> => !!s && s.enabled,
          )
        : await this.repo.listEnabledSources();

      stats.sources = sources.length;
      await this.repo.createSyncLog({
        level: 'info',
        message: `بدء مزامنة مركز المعرفة (${sources.length} مصادر)`,
        meta: { sourceId: options?.sourceId ?? null },
      });

      if (sources.length === 0) {
        await this.repo.createSyncLog({
          level: 'warn',
          message:
            'لا توجد مصادر مفعّلة لمركز المعرفة — أضف مصدراً RSS/API من لوحة التحكم',
        });
        this.logger.warn({}, 'Knowledge sync: no enabled sources');
      }

      for (const source of sources) {
        try {
          const result = await this.syncSource(source.id);
          stats.fetched += result.fetched;
          stats.created += result.created;
          stats.published += result.published;
          stats.skipped += result.skipped;
        } catch (err) {
          stats.failed += 1;
          const message = err instanceof Error ? err.message : String(err);
          this.logger.error(
            { err, sourceId: source.id },
            'Knowledge source sync failed',
          );
          await this.repo.createSyncLog({
            sourceId: source.id,
            level: 'error',
            message: `فشل مزامنة المصدر ${source.name}: ${message}`,
          });
        }
      }

      // Retry PENDING articles that previously failed summarization (e.g. missing OpenAI key)
      const autoPublish = process.env.KNOWLEDGE_AUTO_PUBLISH !== 'false';
      const pending = await this.repo.findPendingWithoutSummary(20);
      for (const article of pending) {
        try {
          await this.summarizeAndStore(article.id);
          if (autoPublish) {
            await this.publisher.publishArticle(article.id);
            stats.published += 1;
          }
        } catch (err) {
          stats.failed += 1;
          const message = err instanceof Error ? err.message : String(err);
          await this.repo.updateArticle(article.id, {
            errorMessage: message.slice(0, 500),
          });
          await this.repo.createSyncLog({
            sourceId: article.sourceId,
            level: 'error',
            message: `فشل إعادة تلخيص/نشر: ${article.originalTitle}`,
            meta: { articleId: article.id, error: message },
          });
        }
      }

      await this.repo.createSyncLog({
        level: 'info',
        message: 'اكتملت مزامنة مركز المعرفة',
        meta: { ...stats, durationMs: Date.now() - startedAt },
      });
      this.logger.info(stats, 'Knowledge sync completed');
      return stats;
    } finally {
      this.syncRunning = false;
    }
  }

  private async syncSource(sourceId: string) {
    const source = await this.repo.findSourceById(sourceId);
    if (!source || !source.enabled) {
      return { fetched: 0, created: 0, published: 0, skipped: 0 };
    }

    const items =
      source.type === KnowledgeSourceType.API
        ? await this.fetcher.fetchFromApi(source.url)
        : await this.fetcher.fetchFromRss(source.url);

    const result = {
      fetched: items.length,
      created: 0,
      published: 0,
      skipped: 0,
    };
    const autoPublish = process.env.KNOWLEDGE_AUTO_PUBLISH !== 'false';
    const maxPerSource = Math.max(
      1,
      parseInt(process.env.KNOWLEDGE_MAX_ITEMS_PER_SOURCE || '10', 10) || 10,
    );

    for (const item of items.slice(0, maxPerSource)) {
      const existing = await this.repo.findArticleByUrl(item.url);
      if (existing) {
        result.skipped += 1;
        continue;
      }

      const article = await this.repo.createArticle({
        sourceId: source.id,
        originalTitle: item.title,
        originalUrl: item.url,
        publishedAt: item.publishedAt,
        status: 'PENDING',
      });
      result.created += 1;

      try {
        await this.summarizeAndStore(article.id, item.contentSnippet);
        if (autoPublish) {
          await this.publisher.publishArticle(article.id);
          result.published += 1;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await this.repo.updateArticle(article.id, {
          errorMessage: message.slice(0, 500),
        });
        await this.repo.createSyncLog({
          sourceId: source.id,
          level: 'error',
          message: `فشل تلخيص/نشر: ${item.title}`,
          meta: { articleId: article.id, error: message },
        });
        this.logger.error(
          { err, articleId: article.id },
          'Article summarize/publish failed',
        );
      }
    }

    await this.repo.createSyncLog({
      sourceId: source.id,
      level: 'info',
      message: `مزامنة ${source.name}: جلب ${result.fetched}، جديد ${result.created}، نشر ${result.published}`,
      meta: result,
    });

    return result;
  }

  private async summarizeAndStore(articleId: string, contentHint?: string) {
    const article = await this.repo.findArticleById(articleId);
    if (!article) throwApi(404, 'not_found', 'الخبر غير موجود');

    const summarized = await this.summarizer.summarize({
      title: article.originalTitle,
      content: contentHint || article.originalTitle,
      sourceName: article.source.name,
      sourceUrl: article.originalUrl,
    });

    return this.repo.updateArticle(articleId, {
      titleAr: summarized.titleAr,
      summary: summarized.summary,
      errorMessage: null,
    });
  }
}
