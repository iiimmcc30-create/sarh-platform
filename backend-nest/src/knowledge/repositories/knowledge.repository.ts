import { Injectable } from '@nestjs/common';
import {
  KnowledgeArticleStatus,
  KnowledgeSourceType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BATCH_ID_TAKE } from '../../common/utils/query-limits';

export const KNOWLEDGE_AUTHOR_USERNAME = 'knowledge_center';

@Injectable()
export class KnowledgeRepository {
  constructor(private readonly prisma: PrismaService) {}

  findKnowledgeUser() {
    return this.prisma.user.findFirst({
      where: { username: KNOWLEDGE_AUTHOR_USERNAME, deletedAt: null },
    });
  }

  createKnowledgeUser(data: { passwordHash: string; avatar?: string | null }) {
    return this.prisma.user.create({
      data: {
        username: KNOWLEDGE_AUTHOR_USERNAME,
        passwordHash: data.passwordHash,
        displayName: 'Knowledge Center',
        arabicName: 'مركز المعرفة',
        verified: true,
        isAI: true,
        emailVerified: true,
        role: 'USER',
        country: 'SA',
        bio: 'حساب رسمي مدعوم بالذكاء الاصطناعي لنشر الأخبار الموثوقة في قطاع الثروة الحيوانية والزراعة.',
        avatar: data.avatar ?? null,
        isActive: true,
      },
    });
  }

  updateKnowledgeUserFlags(id: string) {
    return this.prisma.user.update({
      where: { id },
      data: {
        isAI: true,
        verified: true,
        isActive: true,
        emailVerified: true,
        arabicName: 'مركز المعرفة',
        displayName: 'Knowledge Center',
        bio: 'حساب رسمي مدعوم بالذكاء الاصطناعي لنشر الأخبار الموثوقة في قطاع الثروة الحيوانية والزراعة.',
      },
    });
  }

  updateKnowledgeUserProfile(
    id: string,
    data: { avatar?: string; bio?: string },
  ) {
    return this.prisma.user.update({
      where: { id },
      data: {
        ...(data.avatar !== undefined ? { avatar: data.avatar } : {}),
        ...(data.bio !== undefined ? { bio: data.bio } : {}),
      },
      select: {
        id: true,
        username: true,
        arabicName: true,
        displayName: true,
        avatar: true,
        bio: true,
        isAI: true,
        verified: true,
      },
    });
  }

  createDirectPost(data: {
    authorId: string;
    content: string;
    arabicContent: string;
    image?: string | null;
  }) {
    return this.prisma.post.create({
      data: {
        authorId: data.authorId,
        content: data.content,
        arabicContent: data.arabicContent,
        image: data.image ?? null,
      },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            displayName: true,
            arabicName: true,
            avatar: true,
            verified: true,
            isAI: true,
          },
        },
      },
    });
  }

  listSources() {
    return this.prisma.knowledgeSource.findMany({
      take: 200,
      orderBy: { createdAt: 'desc' },
    });
  }

  listEnabledSources() {
    return this.prisma.knowledgeSource.findMany({
      take: 200,
      where: { enabled: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  findSourceById(id: string) {
    return this.prisma.knowledgeSource.findUnique({ where: { id } });
  }

  createSource(data: {
    name: string;
    url: string;
    type: KnowledgeSourceType;
    enabled?: boolean;
  }) {
    return this.prisma.knowledgeSource.create({
      data: {
        name: data.name,
        url: data.url,
        type: data.type,
        enabled: data.enabled ?? true,
      },
    });
  }

  updateSource(id: string, data: Prisma.KnowledgeSourceUpdateInput) {
    return this.prisma.knowledgeSource.update({ where: { id }, data });
  }

  deleteSource(id: string) {
    return this.prisma.knowledgeSource.delete({ where: { id } });
  }

  findArticleByUrl(originalUrl: string) {
    return this.prisma.knowledgeArticle.findUnique({
      where: { originalUrl },
    });
  }

  createArticle(data: {
    sourceId: string;
    originalTitle: string;
    originalUrl: string;
    publishedAt?: Date | null;
    status?: KnowledgeArticleStatus;
  }) {
    return this.prisma.knowledgeArticle.create({
      data: {
        sourceId: data.sourceId,
        originalTitle: data.originalTitle,
        originalUrl: data.originalUrl,
        publishedAt: data.publishedAt ?? null,
        status: data.status ?? 'PENDING',
      },
      include: { source: true },
    });
  }

  updateArticle(id: string, data: Prisma.KnowledgeArticleUpdateInput) {
    return this.prisma.knowledgeArticle.update({
      where: { id },
      data,
      include: { source: true, post: true },
    });
  }

  findArticleById(id: string) {
    return this.prisma.knowledgeArticle.findUnique({
      where: { id },
      include: { source: true, post: true },
    });
  }

  findPendingWithoutSummary(take = 20) {
    return this.prisma.knowledgeArticle.findMany({
      where: {
        status: 'PENDING',
        OR: [{ summary: null }, { titleAr: null }],
      },
      orderBy: { createdAt: 'asc' },
      take,
      include: { source: true },
    });
  }

  async listArticles(params: {
    status?: KnowledgeArticleStatus;
    sourceId?: string;
    page: number;
    pageSize: number;
  }) {
    const where: Prisma.KnowledgeArticleWhereInput = {
      ...(params.status ? { status: params.status } : {}),
      ...(params.sourceId ? { sourceId: params.sourceId } : {}),
    };
    const skip = (params.page - 1) * params.pageSize;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.knowledgeArticle.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: params.pageSize,
        include: { source: true, post: true },
      }),
      this.prisma.knowledgeArticle.count({ where }),
    ]);
    return { items, total };
  }

  createPost(data: {
    authorId: string;
    content: string;
    arabicContent: string;
  }) {
    return this.prisma.post.create({
      data: {
        authorId: data.authorId,
        content: data.content,
        arabicContent: data.arabicContent,
      },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            displayName: true,
            arabicName: true,
            avatar: true,
            verified: true,
            isAI: true,
          },
        },
      },
    });
  }

  findFollowerIds(userId: string) {
    return this.prisma.follow.findMany({
      take: 2000,
      where: { followingId: userId },
      select: { followerId: true },
    });
  }

  countSources() {
    return this.prisma.knowledgeSource.count();
  }

  findSourceByUrl(url: string) {
    return this.prisma.knowledgeSource.findFirst({ where: { url } });
  }

  /**
   * Ensure every active (non-AI) user follows the Knowledge Center account
   * so published posts appear in Following and are interactable in-app.
   */
  async ensureFollowedByAllActiveUsers(knowledgeUserId: string) {
    let users = 0;
    let followsCreated = 0;
    let cursor: string | undefined;

    for (;;) {
      const page = await this.prisma.user.findMany({
        where: {
          deletedAt: null,
          isActive: true,
          isAI: false,
          id: { not: knowledgeUserId },
        },
        select: { id: true },
        orderBy: { id: 'asc' },
        take: BATCH_ID_TAKE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (page.length === 0) break;
      users += page.length;

      const existing = await this.prisma.follow.findMany({
        where: {
          followingId: knowledgeUserId,
          followerId: { in: page.map((row) => row.id) },
        },
        select: { followerId: true },
        take: page.length,
      });
      const already = new Set(existing.map((row) => row.followerId));
      const missing = page.filter((row) => !already.has(row.id));
      if (missing.length > 0) {
        await this.prisma.follow.createMany({
          data: missing.map((row) => ({
            followerId: row.id,
            followingId: knowledgeUserId,
          })),
          skipDuplicates: true,
        });
        followsCreated += missing.length;
      }

      if (page.length < BATCH_ID_TAKE) break;
      cursor = page[page.length - 1].id;
    }

    return { users, followsCreated };
  }

  async ensureFollowedByUser(userId: string, knowledgeUserId: string) {
    if (userId === knowledgeUserId) return;
    await this.prisma.follow.upsert({
      where: {
        followerId_followingId: {
          followerId: userId,
          followingId: knowledgeUserId,
        },
      },
      create: {
        followerId: userId,
        followingId: knowledgeUserId,
      },
      update: {},
    });
  }

  softHidePost(postId: string) {
    return this.prisma.post.update({
      where: { id: postId },
      data: { isHidden: true },
    });
  }

  createSyncLog(data: {
    sourceId?: string | null;
    level: string;
    message: string;
    meta?: Prisma.InputJsonValue;
  }) {
    return this.prisma.knowledgeSyncLog.create({
      data: {
        sourceId: data.sourceId ?? null,
        level: data.level,
        message: data.message,
        meta: data.meta,
      },
    });
  }

  async listSyncLogs(params: { page: number; pageSize: number }) {
    const skip = (params.page - 1) * params.pageSize;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.knowledgeSyncLog.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: params.pageSize,
        include: { source: { select: { id: true, name: true } } },
      }),
      this.prisma.knowledgeSyncLog.count(),
    ]);
    return { items, total };
  }
}
