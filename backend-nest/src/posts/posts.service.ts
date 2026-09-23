import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { throwApi } from '../common/exceptions/api.exception';
import { RedisCacheService } from '../redis/services/redis-cache.service';
import { AppNotificationsService } from '../queue/services/app-notifications.service';
import type { JwtPayload } from '../common/types/jwt-payload.interface';
import {
  CreateCommentDto,
  CreatePostDto,
  ListPostsQueryDto,
  UpdatePostDto,
} from './dto/posts.dto';
import { PostsRepository } from './repositories/posts.repository';
import { UsersRepository } from '../users/repositories/users.repository';
import { notDeleted } from '../common/utils/soft-delete.util';

const PAGE_SIZE = 20;

type PostWithCount = Awaited<ReturnType<PostsRepository['findFeed']>>[number];

@Injectable()
export class PostsService {
  constructor(
    private readonly repo: PostsRepository,
    private readonly usersRepo: UsersRepository,
    private readonly cache: RedisCacheService,
    private readonly notifications: AppNotificationsService,
  ) {}

  private mapPost(
    post: PostWithCount,
    liked: boolean,
    reposted: boolean,
    bookmarked = false,
  ) {
    const { _count, ...rest } = post;
    return {
      ...rest,
      likesCount: _count.likes,
      repostsCount: _count.reposts,
      commentsCount: _count.comments,
      liked,
      reposted,
      bookmarked,
    };
  }

  async getFeed(query: ListPostsQueryDto, user?: JwtPayload) {
    const { cursor, userId: authorId, feed } = query;
    const followingOnly = feed === 'following';

    if (followingOnly && !user?.userId) {
      return { posts: [], nextCursor: null, hasMore: false };
    }

    const cacheKey = authorId
      ? `posts:user:${authorId}:${cursor || 'first'}`
      : followingOnly
        ? `posts:feed:following:${user!.userId}:${cursor || 'first'}`
        : `posts:feed:${cursor || 'first'}`;

    const cached = await this.cache.get<{
      posts: PostWithCount[];
      nextCursor: string | null;
      hasMore: boolean;
    }>(cacheKey);

    if (!cached) {
      let where: Prisma.PostWhereInput = authorId
        ? { authorId, ...notDeleted, isHidden: false }
        : { ...notDeleted, isHidden: false };

      if (followingOnly && user?.userId) {
        const followingIds = await this.repo.findFollowingIds(user.userId);
        const authorIds = [...followingIds, user.userId];
        where = {
          ...where,
          authorId: { in: authorIds },
        };
      }

      const posts = await this.repo.findFeed({
        where,
        take: PAGE_SIZE + 1,
        cursor,
      });

      const hasMore = posts.length > PAGE_SIZE;
      const items = hasMore ? posts.slice(0, -1) : posts;
      const nextCursor = hasMore ? (items[items.length - 1]?.id ?? null) : null;
      // Cache raw posts only — never liked/reposted or block-filtered rows.
      await this.cache.set(
        cacheKey,
        { posts: items, nextCursor, hasMore },
        followingOnly ? 30 : 60,
      );
      return this.personalizeFeed(items, nextCursor, hasMore, user, authorId);
    }

    return this.personalizeFeed(
      cached.posts,
      cached.nextCursor,
      cached.hasMore,
      user,
      authorId,
    );
  }

  private async personalizeFeed(
    items: PostWithCount[],
    nextCursor: string | null,
    hasMore: boolean,
    user: JwtPayload | undefined,
    authorId?: string,
  ) {
    let visible = items;
    if (user?.userId) {
      const blockedIds = await this.usersRepo.findBlockedRelationshipIds(
        user.userId,
      );
      if (authorId && blockedIds.includes(authorId)) {
        return { posts: [], nextCursor: null, hasMore: false };
      }
      if (blockedIds.length > 0) {
        const blocked = new Set(blockedIds);
        visible = items.filter((p) => !blocked.has(p.authorId));
      }
    }

    let likedPostIds = new Set<string>();
    let repostedPostIds = new Set<string>();
    let bookmarkedPostIds = new Set<string>();
    if (user?.userId && visible.length > 0) {
      const postIds = visible.map((p) => p.id);
      const [likes, reposts, bookmarks] = await Promise.all([
        this.repo.findLikesByUser(user.userId, postIds),
        this.repo.findRepostsByUser(user.userId, postIds),
        this.repo.findBookmarksByUser(user.userId, postIds),
      ]);
      likedPostIds = new Set(likes.map((l) => l.postId));
      repostedPostIds = new Set(reposts.map((r) => r.postId));
      bookmarkedPostIds = new Set(bookmarks.map((b) => b.postId));
    }

    return {
      posts: visible.map((p) =>
        this.mapPost(
          p,
          likedPostIds.has(p.id),
          repostedPostIds.has(p.id),
          bookmarkedPostIds.has(p.id),
        ),
      ),
      nextCursor,
      hasMore,
    };
  }

  private normalizeImages(image?: string | null, images?: string[]): string[] {
    if (images?.length) return images.slice(0, 4);
    if (image) return [image];
    return [];
  }

  async createPost(user: JwtPayload, dto: CreatePostDto) {
    const images = this.normalizeImages(dto.image, dto.images);
    const post = await this.repo.create({
      content: dto.content,
      arabicContent: dto.arabicContent,
      image: images[0] ?? null,
      images,
      author: { connect: { id: user.userId } },
    });

    const followers = await this.repo.findFollowerIds(user.userId);
    if (followers.length > 0) {
      await this.notifications.notifyUsers(
        followers.map((f) => f.followerId),
        {
          type: 'system',
          titleAr: 'منشور جديد',
          bodyAr: `${post.author.arabicName} نشر منشوراً جديداً`,
          data: { postId: post.id, authorId: user.userId },
        },
      );
    }

    await this.cache.del('posts:feed:first');
    await this.cache.delPattern('posts:feed:following:*').catch(() => 0);
    return post;
  }

  async getPost(id: string, user?: JwtPayload) {
    if (!id) throwApi(400, 'invalid_id', 'معرّف غير صالح');

    const post = await this.repo.findById(id);
    if (!post) throwApi(404, 'not_found', 'المنشور غير موجود');

    if (user?.userId && user.userId !== post.authorId) {
      const blockedIds = await this.usersRepo.findBlockedRelationshipIds(
        user.userId,
      );
      if (blockedIds.includes(post.authorId)) {
        throwApi(403, 'blocked', 'لا يمكنك عرض هذا المنشور');
      }
    }

    this.repo.incrementViewsCount(id).catch(() => {});

    let liked = false;
    let reposted = false;
    let bookmarked = false;
    if (user?.userId) {
      const [likeRow, repostRow, bookmarkRow] = await Promise.all([
        this.repo.findLike(id, user.userId),
        this.repo.findRepost(id, user.userId),
        this.repo.findBookmark(id, user.userId),
      ]);
      liked = !!likeRow;
      reposted = !!repostRow;
      bookmarked = !!bookmarkRow;
    }

    return this.mapPost(
      { ...post, viewsCount: (post.viewsCount ?? 0) + 1 },
      liked,
      reposted,
      bookmarked,
    );
  }

  async updatePost(user: JwtPayload, id: string, dto: UpdatePostDto) {
    if (!id) throwApi(400, 'invalid_id', 'معرّف غير صالح');

    const post = await this.repo.findOwnerMeta(id);
    if (!post) throwApi(404, 'not_found', 'المنشور غير موجود');
    if (post.authorId !== user.userId && user.role !== 'ADMIN') {
      throwApi(403, 'forbidden', 'غير مسموح');
    }

    const updated = await this.repo.update(id, {
      content: dto.content,
      arabicContent: dto.arabicContent,
      ...(dto.images !== undefined
        ? {
            images: dto.images,
            image: dto.images[0] ?? null,
          }
        : dto.image !== undefined
          ? {
              image: dto.image,
              images: dto.image ? [dto.image] : [],
            }
          : {}),
    });
    await this.invalidatePostCaches(id, post.authorId);
    return updated;
  }

  async deletePost(user: JwtPayload, id: string) {
    if (!id) throwApi(400, 'invalid_id', 'معرّف غير صالح');

    const post = await this.repo.findOwnerMeta(id);
    if (!post) throwApi(404, 'not_found', 'المنشور غير موجود');
    if (post.authorId !== user.userId && user.role !== 'ADMIN') {
      throwApi(403, 'forbidden', 'غير مسموح');
    }

    await this.repo.softDelete(id);
    await this.invalidatePostCaches(id, post.authorId);
    return { deleted: true };
  }

  private async assertNotBlockedWithAuthor(viewerId: string, authorId: string) {
    if (viewerId === authorId) return;
    const blockedIds =
      await this.usersRepo.findBlockedRelationshipIds(viewerId);
    if (blockedIds.includes(authorId)) {
      throwApi(403, 'blocked', 'لا يمكنك التفاعل مع هذا المستخدم');
    }
  }

  async toggleLike(user: JwtPayload, postId: string) {
    if (!postId) throwApi(400, 'invalid_id', 'معرّف غير صالح');

    const post = await this.repo.findOwnerMeta(postId);
    if (!post) throwApi(404, 'not_found', 'المنشور غير موجود');
    await this.assertNotBlockedWithAuthor(user.userId, post.authorId);

    const existing = await this.repo.findLike(postId, user.userId);
    const liked = await this.repo.toggleLike(postId, user.userId, !!existing);

    if (liked && post.authorId !== user.userId) {
      void this.notifications
        .notifyUser({
          userId: post.authorId,
          type: 'like',
          titleAr: 'إعجاب جديد',
          bodyAr: `أعجب ${user.username} بمنشورك`,
          data: { postId },
        })
        .catch(() => {});
    }

    await this.cache.del(this.cache.keys.post(postId));
    return { liked };
  }

  async toggleRepost(user: JwtPayload, postId: string) {
    if (!postId) throwApi(400, 'invalid_id', 'معرّف غير صالح');

    const post = await this.repo.findOwnerMeta(postId);
    if (!post) throwApi(404, 'not_found', 'المنشور غير موجود');
    await this.assertNotBlockedWithAuthor(user.userId, post.authorId);

    const existing = await this.repo.findRepost(postId, user.userId);
    const reposted = await this.repo.toggleRepost(
      postId,
      user.userId,
      !!existing,
    );

    if (reposted && post.authorId !== user.userId) {
      void this.notifications
        .notifyUser({
          userId: post.authorId,
          type: 'repost',
          titleAr: 'إعادة نشر',
          bodyAr: `أعاد ${user.username} نشر منشورك`,
          data: { postId },
        })
        .catch(() => {});
    }

    await this.cache.del(this.cache.keys.post(postId));
    await this.cache.del('posts:feed:first');
    return { reposted };
  }

  async toggleBookmark(user: JwtPayload, postId: string) {
    if (!postId) throwApi(400, 'invalid_id', 'معرّف غير صالح');

    const post = await this.repo.findOwnerMeta(postId);
    if (!post) throwApi(404, 'not_found', 'المنشور غير موجود');
    await this.assertNotBlockedWithAuthor(user.userId, post.authorId);

    const existing = await this.repo.findBookmark(postId, user.userId);
    const bookmarked = await this.repo.toggleBookmark(
      postId,
      user.userId,
      !!existing,
    );

    await this.cache.del(this.cache.keys.post(postId));
    return { bookmarked };
  }

  async recordView(postId: string, user?: JwtPayload) {
    if (!postId) throwApi(400, 'invalid_id', 'معرّف غير صالح');

    const post = await this.repo.findOwnerMeta(postId);
    if (!post) throwApi(404, 'not_found', 'المنشور غير موجود');

    if (user?.userId && user.userId !== post.authorId) {
      const blockedIds = await this.usersRepo.findBlockedRelationshipIds(
        user.userId,
      );
      if (blockedIds.includes(post.authorId)) {
        throwApi(403, 'blocked', 'لا يمكنك عرض هذا المنشور');
      }
    }

    if (user?.userId && user.userId === post.authorId) {
      const current = await this.repo.findById(postId);
      return {
        recorded: false,
        viewsCount: current?.viewsCount ?? 0,
      };
    }

    const updated = await this.repo.incrementViewsCount(postId);
    return { recorded: true, viewsCount: updated.viewsCount };
  }

  async listComments(postId: string) {
    if (!postId) throwApi(400, 'invalid_id', 'معرّف غير صالح');

    const post = await this.repo.findOwnerMeta(postId);
    if (!post) throwApi(404, 'not_found', 'المنشور غير موجود');

    const comments = await this.repo.findComments(postId);
    return { comments };
  }

  async createComment(user: JwtPayload, postId: string, dto: CreateCommentDto) {
    if (!postId) throwApi(400, 'invalid_id', 'معرّف غير صالح');

    const post = await this.repo.findOwnerMeta(postId);
    if (!post) throwApi(404, 'not_found', 'المنشور غير موجود');
    await this.assertNotBlockedWithAuthor(user.userId, post.authorId);

    if (post.authorId !== user.userId) {
      const owner = await this.usersRepo.findUserCommentsAudience(
        post.authorId,
      );
      if (owner?.commentsAudience === 'followers') {
        const follows = await this.usersRepo.findFollow(
          user.userId,
          post.authorId,
        );
        if (!follows) {
          throwApi(
            403,
            'comments_restricted',
            'صاحب المنشور يقبل التعليقات من المتابعين فقط',
          );
        }
      }
    }

    const comment = await this.repo.createComment(
      postId,
      user.userId,
      dto.content,
    );

    if (post.authorId !== user.userId) {
      void this.notifications
        .notifyUser({
          userId: post.authorId,
          type: 'comment',
          titleAr: 'تعليق جديد',
          bodyAr: `علّق ${user.username} على منشورك`,
          data: { postId, commentId: comment.id },
        })
        .catch(() => {});
    }

    await this.cache.del(this.cache.keys.post(postId));
    await this.cache.del('posts:feed:first');
    return comment;
  }

  async deleteComment(user: JwtPayload, postId: string, commentId: string) {
    if (!postId || !commentId) throwApi(400, 'invalid_id', 'معرّف غير صالح');

    const post = await this.repo.findPostAuthorId(postId);
    if (!post) throwApi(404, 'not_found', 'المنشور غير موجود');

    const comment = await this.repo.findCommentMeta(commentId, postId);
    if (!comment) throwApi(404, 'not_found', 'التعليق غير موجود');

    const isCommentAuthor = comment.authorId === user.userId;
    const isPostOwner = post.authorId === user.userId;
    const isAdmin = user.role === 'ADMIN';

    if (!isCommentAuthor && !isPostOwner && !isAdmin) {
      throwApi(403, 'forbidden', 'غير مسموح');
    }

    await this.repo.deleteComment(commentId, postId);
    await this.cache.del(this.cache.keys.post(postId));
    await this.cache.del('posts:feed:first');
    return { deleted: true };
  }

  private async invalidatePostCaches(postId: string, authorId: string) {
    await this.cache.del(this.cache.keys.post(postId));
    await this.cache.del('posts:feed:first');
    await this.cache.del(`posts:user:${authorId}:first`);
  }
}
