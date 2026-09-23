import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  notDeleted,
  softDeleteFields,
} from '../../common/utils/soft-delete.util';

export const POST_AUTHOR_SELECT = {
  id: true,
  username: true,
  displayName: true,
  arabicName: true,
  avatar: true,
  verified: true,
  isAI: true,
} as const;

const POST_INCLUDE = {
  author: { select: POST_AUTHOR_SELECT },
  _count: { select: { likes: true, reposts: true, comments: true } },
} as const;

@Injectable()
export class PostsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findFeed(params: {
    where: Prisma.PostWhereInput;
    take: number;
    cursor?: string;
  }) {
    return this.prisma.post.findMany({
      where: params.where,
      take: params.take,
      cursor: params.cursor ? { id: params.cursor } : undefined,
      skip: params.cursor ? 1 : 0,
      orderBy: { createdAt: 'desc' },
      include: POST_INCLUDE,
    });
  }

  findLikesByUser(userId: string, postIds: string[]) {
    return this.prisma.postLike.findMany({
      take: Math.max(postIds.length, 1),
      where: { userId, postId: { in: postIds } },
      select: { postId: true },
    });
  }

  findRepostsByUser(userId: string, postIds: string[]) {
    return this.prisma.postRepost.findMany({
      take: Math.max(postIds.length, 1),
      where: { userId, postId: { in: postIds } },
      select: { postId: true },
    });
  }

  findBookmarksByUser(userId: string, postIds: string[]) {
    return this.prisma.postBookmark.findMany({
      take: Math.max(postIds.length, 1),
      where: { userId, postId: { in: postIds } },
      select: { postId: true },
    });
  }

  create(data: Prisma.PostCreateInput) {
    return this.prisma.post.create({
      data,
      include: { author: { select: POST_AUTHOR_SELECT } },
    });
  }

  findFollowerIds(userId: string) {
    return this.prisma.follow.findMany({
      where: { followingId: userId },
      select: { followerId: true },
      take: 500,
    });
  }

  /** IDs of users that `userId` is following. */
  async findFollowingIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.follow.findMany({
      where: { followerId: userId },
      select: { followingId: true },
      take: 2000,
    });
    return rows.map((r) => r.followingId);
  }

  findById(id: string) {
    return this.prisma.post.findFirst({
      where: { id, ...notDeleted },
      include: POST_INCLUDE,
    });
  }

  incrementViewsCount(id: string) {
    return this.prisma.post.update({
      where: { id },
      data: { viewsCount: { increment: 1 } },
      select: { viewsCount: true },
    });
  }

  findOwnerMeta(id: string) {
    return this.prisma.post.findFirst({
      where: { id, ...notDeleted },
      select: { id: true, authorId: true },
    });
  }

  update(id: string, data: Prisma.PostUpdateInput) {
    return this.prisma.post.update({
      where: { id },
      data,
      include: { author: { select: POST_AUTHOR_SELECT } },
    });
  }

  softDelete(id: string) {
    return this.prisma.post.update({
      where: { id },
      data: { ...softDeleteFields(), isHidden: true },
    });
  }

  findLike(postId: string, userId: string) {
    return this.prisma.postLike.findUnique({
      where: { postId_userId: { postId, userId } },
      select: { id: true },
    });
  }

  findRepost(postId: string, userId: string) {
    return this.prisma.postRepost.findUnique({
      where: { postId_userId: { postId, userId } },
      select: { id: true },
    });
  }

  findBookmark(postId: string, userId: string) {
    return this.prisma.postBookmark.findUnique({
      where: { postId_userId: { postId, userId } },
      select: { id: true },
    });
  }

  toggleLike(postId: string, userId: string, existing: boolean) {
    return this.prisma.$transaction(async (tx) => {
      if (existing) {
        await tx.postLike.delete({
          where: { postId_userId: { postId, userId } },
        });
        await tx.post.update({
          where: { id: postId },
          data: { likesCount: { decrement: 1 } },
        });
        return false;
      }
      await tx.postLike.create({ data: { postId, userId } });
      await tx.post.update({
        where: { id: postId },
        data: { likesCount: { increment: 1 } },
      });
      return true;
    });
  }

  toggleRepost(postId: string, userId: string, existing: boolean) {
    return this.prisma.$transaction(async (tx) => {
      if (existing) {
        await tx.postRepost.delete({
          where: { postId_userId: { postId, userId } },
        });
        await tx.post.update({
          where: { id: postId },
          data: { repostsCount: { decrement: 1 } },
        });
        return false;
      }
      await tx.postRepost.create({ data: { postId, userId } });
      await tx.post.update({
        where: { id: postId },
        data: { repostsCount: { increment: 1 } },
      });
      return true;
    });
  }

  toggleBookmark(postId: string, userId: string, existing: boolean) {
    return this.prisma.$transaction(async (tx) => {
      if (existing) {
        await tx.postBookmark.delete({
          where: { postId_userId: { postId, userId } },
        });
        return false;
      }
      await tx.postBookmark.create({ data: { postId, userId } });
      return true;
    });
  }

  findComments(postId: string) {
    return this.prisma.postComment.findMany({
      where: { postId },
      orderBy: { createdAt: 'asc' },
      take: 100,
      include: { author: { select: POST_AUTHOR_SELECT } },
    });
  }

  createComment(postId: string, authorId: string, content: string) {
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.postComment.create({
        data: { postId, authorId, content },
        include: { author: { select: POST_AUTHOR_SELECT } },
      });
      await tx.post.update({
        where: { id: postId },
        data: { commentsCount: { increment: 1 } },
      });
      return created;
    });
  }

  findCommentMeta(commentId: string, postId: string) {
    return this.prisma.postComment.findFirst({
      where: { id: commentId, postId },
      select: { id: true, authorId: true, postId: true },
    });
  }

  findPostAuthorId(postId: string) {
    return this.prisma.post.findFirst({
      where: { id: postId, ...notDeleted },
      select: { authorId: true },
    });
  }

  deleteComment(commentId: string, postId: string) {
    return this.prisma.$transaction(async (tx) => {
      const deleted = await tx.postComment.deleteMany({
        where: { id: commentId, postId },
      });
      if (deleted.count === 0) {
        throw new Error('COMMENT_NOT_FOUND');
      }

      const commentsCount = await tx.postComment.count({ where: { postId } });
      await tx.post.update({
        where: { id: postId },
        data: { commentsCount },
      });
      return true;
    });
  }
}
