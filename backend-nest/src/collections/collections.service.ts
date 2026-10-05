import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { throwApi } from '../common/exceptions/api.exception';
import type { JwtPayload } from '../common/types/jwt-payload.interface';
import { UsersRepository } from '../users/repositories/users.repository';
import { PostsService } from '../posts/posts.service';
import { ListingsService } from '../listings/listings.service';
import { searchTextVariants } from '../search/lib/arabic-search.util';
import type {
  AddCollectionMemberDto,
  CreateCollectionDto,
  UpdateCollectionDto,
} from './dto/collections.dto';

export const COLLECTIONS_PAGE_SIZE = 20;
export const COLLECTION_USERS_LIMIT = 20;
export const MAX_COLLECTIONS_PER_OWNER = 100;
export const MAX_MEMBERS_PER_COLLECTION = 500;

/** Same public identity fields the feeds use for authors. */
const COLLECTION_USER_SELECT = {
  id: true,
  username: true,
  displayName: true,
  arabicName: true,
  avatar: true,
  verified: true,
  verifiedTier: true,
} as const;

const ACTIVE_USER: Prisma.UserWhereInput = { isActive: true, deletedAt: null };

const PAGE_ORDER: Prisma.CollectionOrderByWithRelationInput[] = [
  { createdAt: 'desc' },
  { id: 'desc' },
];

/** One query per page: owner, counts and "do I follow it" ride on the row (no N+1). */
function collectionInclude(viewerId?: string) {
  return {
    owner: { select: COLLECTION_USER_SELECT },
    _count: { select: { members: true, followers: true } },
    // Anonymous viewers match nothing ('' is never a user id).
    followers: {
      where: { userId: viewerId ?? '' },
      select: { id: true },
      take: 1,
    },
  } satisfies Prisma.CollectionInclude;
}

type CollectionRow = Prisma.CollectionGetPayload<{
  include: ReturnType<typeof collectionInclude>;
}>;

type Page<K extends string, T> = {
  [key in K]: T[];
} & { nextCursor: string | null; hasMore: boolean };

function emptyPage<K extends string>(key: K) {
  return { [key]: [], nextCursor: null, hasMore: false } as unknown as Page<
    K,
    never
  >;
}

@Injectable()
export class CollectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersRepo: UsersRepository,
    private readonly posts: PostsService,
    private readonly listings: ListingsService,
  ) {}

  present(row: CollectionRow, viewerId?: string) {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      coverUrl: row.coverUrl,
      type: row.type,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      owner: row.owner,
      membersCount: row._count.members,
      followersCount: row._count.followers,
      isFollowing: row.followers.length > 0,
      isOwner: Boolean(viewerId) && row.ownerId === viewerId,
    };
  }

  private async blockedUserIds(viewerId?: string): Promise<string[]> {
    if (!viewerId) return [];
    return this.usersRepo.findBlockedRelationshipIds(viewerId);
  }

  /**
   * What a viewer may see: the owner account is active, the viewer did not hide the
   * collection («حظر القائمة») and there is no user block either way with the owner.
   */
  private visibleWhere(
    viewerId: string | undefined,
    blockedIds: string[],
  ): Prisma.CollectionWhereInput[] {
    const where: Prisma.CollectionWhereInput[] = [{ owner: ACTIVE_USER }];
    if (viewerId) {
      where.push({ blocks: { none: { userId: viewerId } } });
      if (blockedIds.length > 0) {
        where.push({ ownerId: { notIn: blockedIds } });
      }
    }
    return where;
  }

  private async pageOf(
    and: Prisma.CollectionWhereInput[],
    cursor: string | undefined,
    viewerId: string | undefined,
  ) {
    const rows = await this.prisma.collection.findMany({
      where: { AND: and },
      include: collectionInclude(viewerId),
      orderBy: PAGE_ORDER,
      take: COLLECTIONS_PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > COLLECTIONS_PAGE_SIZE;
    const items = hasMore ? rows.slice(0, COLLECTIONS_PAGE_SIZE) : rows;
    return {
      collections: items.map((row) => this.present(row, viewerId)),
      nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
      hasMore,
    };
  }

  private async findVisible(id: string, viewerId?: string) {
    const blockedIds = await this.blockedUserIds(viewerId);
    const row = await this.prisma.collection.findFirst({
      where: { AND: [{ id }, ...this.visibleWhere(viewerId, blockedIds)] },
      include: collectionInclude(viewerId),
    });
    if (!row) throwApi(404, 'not_found', 'القائمة غير موجودة');
    return row;
  }

  private async requireOwner(id: string, userId: string) {
    const row = await this.prisma.collection.findUnique({
      where: { id },
      select: { id: true, ownerId: true, type: true },
    });
    if (!row) throwApi(404, 'not_found', 'القائمة غير موجودة');
    if (row.ownerId !== userId) {
      throwApi(403, 'forbidden', 'لا تملك صلاحية إدارة هذه القائمة');
    }
    return row;
  }

  private async reload(id: string, viewerId: string) {
    const row = await this.prisma.collection.findUniqueOrThrow({
      where: { id },
      include: collectionInclude(viewerId),
    });
    return this.present(row, viewerId);
  }

  // ── Collections ──────────────────────────────────────────────────────────

  async create(user: JwtPayload, dto: CreateCollectionDto) {
    const name = dto.name?.trim() ?? '';
    if (!name) throwApi(400, 'invalid_name', 'اسم القائمة مطلوب');
    const owned = await this.prisma.collection.count({
      where: { ownerId: user.userId },
    });
    if (owned >= MAX_COLLECTIONS_PER_OWNER) {
      throwApi(400, 'limit_reached', 'وصلت إلى الحد الأقصى لعدد القوائم');
    }
    const row = await this.prisma.collection.create({
      data: {
        ownerId: user.userId,
        name,
        description: dto.description?.trim() || null,
        coverUrl: dto.coverUrl || null,
        type: dto.type,
      },
      include: collectionInclude(user.userId),
    });
    return this.present(row, user.userId);
  }

  async detail(id: string, viewer?: JwtPayload) {
    const row = await this.findVisible(id, viewer?.userId);
    return this.present(row, viewer?.userId);
  }

  /**
   * Edits cover / name / description and, since the feed is computed live from the
   * members, the type too (switching only changes which of their content is shown).
   */
  async update(user: JwtPayload, id: string, dto: UpdateCollectionDto) {
    await this.requireOwner(id, user.userId);
    const data: Prisma.CollectionUpdateInput = {};
    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) throwApi(400, 'invalid_name', 'اسم القائمة مطلوب');
      data.name = name;
    }
    if (dto.description !== undefined) {
      data.description = dto.description.trim() || null;
    }
    if (dto.coverUrl !== undefined) data.coverUrl = dto.coverUrl || null;
    if (dto.type !== undefined) data.type = dto.type;
    if (Object.keys(data).length > 0) {
      await this.prisma.collection.update({ where: { id }, data });
    }
    return this.reload(id, user.userId);
  }

  async remove(user: JwtPayload, id: string) {
    await this.requireOwner(id, user.userId);
    // Members / followers / blocks cascade with the row.
    await this.prisma.collection.delete({ where: { id } });
    return { deleted: true };
  }

  /** «اكتشف القوائم الجديدة»: newest collections the viewer neither owns nor follows. */
  async suggested(cursor: string | undefined, viewer?: JwtPayload) {
    const viewerId = viewer?.userId;
    const and = this.visibleWhere(
      viewerId,
      await this.blockedUserIds(viewerId),
    );
    if (viewerId) {
      and.push({ ownerId: { not: viewerId } });
      and.push({ followers: { none: { userId: viewerId } } });
    }
    return this.pageOf(and, cursor, viewerId);
  }

  /** «قوائمي»: collections the user owns or follows. */
  async mine(user: JwtPayload, cursor: string | undefined) {
    const viewerId = user.userId;
    const and = this.visibleWhere(
      viewerId,
      await this.blockedUserIds(viewerId),
    );
    and.push({
      OR: [
        { ownerId: viewerId },
        { followers: { some: { userId: viewerId } } },
      ],
    });
    return this.pageOf(and, cursor, viewerId);
  }

  async search(
    q: string | undefined,
    cursor: string | undefined,
    viewer?: JwtPayload,
  ) {
    const variants = searchTextVariants(q ?? '');
    if (variants.length === 0) return emptyPage('collections');
    const viewerId = viewer?.userId;
    const and = this.visibleWhere(
      viewerId,
      await this.blockedUserIds(viewerId),
    );
    and.push({
      OR: variants.map((v) => ({
        name: { contains: v, mode: 'insensitive' as const },
      })),
    });
    return this.pageOf(and, cursor, viewerId);
  }

  /**
   * «القوائم المضاف إليها»: collections where `userId` is a MEMBER (not owned-only,
   * not followed-only). Same visibility rules as every list; a user block either way
   * between the viewer and that user yields an empty list.
   */
  async memberOf(
    userId: string,
    cursor: string | undefined,
    viewer?: JwtPayload,
  ) {
    const viewerId = viewer?.userId;
    const target = await this.prisma.user.findFirst({
      where: { id: userId, ...ACTIVE_USER },
      select: { id: true },
    });
    if (!target) throwApi(404, 'user_not_found', 'الحساب غير موجود');
    const blockedIds = await this.blockedUserIds(viewerId);
    if (blockedIds.includes(userId)) return emptyPage('collections');
    const and = this.visibleWhere(viewerId, blockedIds);
    and.push({ members: { some: { userId } } });
    return this.pageOf(and, cursor, viewerId);
  }

  // ── Members ──────────────────────────────────────────────────────────────

  async addMember(user: JwtPayload, id: string, dto: AddCollectionMemberDto) {
    await this.requireOwner(id, user.userId);
    const target = await this.prisma.user.findFirst({
      where: { id: dto.userId, ...ACTIVE_USER },
      select: { id: true },
    });
    if (!target) throwApi(404, 'user_not_found', 'الحساب غير موجود');
    const blockedIds = await this.blockedUserIds(user.userId);
    if (blockedIds.includes(dto.userId)) {
      throwApi(403, 'blocked', 'لا يمكن إضافة هذا الحساب');
    }
    const count = await this.prisma.collectionMember.count({
      where: { collectionId: id },
    });
    if (count >= MAX_MEMBERS_PER_COLLECTION) {
      throwApi(
        400,
        'limit_reached',
        'وصلت القائمة إلى الحد الأقصى من الأعضاء',
      );
    }
    try {
      await this.prisma.collectionMember.create({
        data: { collectionId: id, userId: dto.userId },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throwApi(409, 'already_member', 'الحساب مضاف بالفعل إلى القائمة');
      }
      throw err;
    }
    return { added: true, membersCount: count + 1 };
  }

  async removeMember(user: JwtPayload, id: string, memberId: string) {
    await this.requireOwner(id, user.userId);
    const { count } = await this.prisma.collectionMember.deleteMany({
      where: { collectionId: id, userId: memberId },
    });
    const membersCount = await this.prisma.collectionMember.count({
      where: { collectionId: id },
    });
    return { removed: count > 0, membersCount };
  }

  async listMembers(
    id: string,
    cursor: string | undefined,
    viewer?: JwtPayload,
  ) {
    const viewerId = viewer?.userId;
    await this.findVisible(id, viewerId);
    const blockedIds = await this.blockedUserIds(viewerId);
    const rows = await this.prisma.collectionMember.findMany({
      where: {
        collectionId: id,
        user: ACTIVE_USER,
        ...(blockedIds.length > 0 ? { userId: { notIn: blockedIds } } : {}),
      },
      include: { user: { select: COLLECTION_USER_SELECT } },
      orderBy: [{ addedAt: 'desc' }, { id: 'desc' }],
      take: COLLECTIONS_PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > COLLECTIONS_PAGE_SIZE;
    const items = hasMore ? rows.slice(0, COLLECTIONS_PAGE_SIZE) : rows;
    return {
      users: items.map((row) => ({ ...row.user, addedAt: row.addedAt })),
      nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
      hasMore,
    };
  }

  /**
   * Accounts to add. With `q`: name / @username search. Without: «حسابات مقترحة» —
   * accounts the owner follows first, then the most-followed active accounts.
   */
  async searchUsers(
    user: JwtPayload,
    q: string | undefined,
    collectionId?: string,
  ) {
    if (collectionId) await this.requireOwner(collectionId, user.userId);
    const blockedIds = await this.blockedUserIds(user.userId);
    const base: Prisma.UserWhereInput = {
      ...ACTIVE_USER,
      showInSearch: true,
      ...(blockedIds.length > 0 ? { id: { notIn: blockedIds } } : {}),
    };
    const term = (q ?? '').trim().replace(/^@+/, '');
    let users: Array<
      Prisma.UserGetPayload<{ select: typeof COLLECTION_USER_SELECT }>
    >;
    if (term) {
      const variants = searchTextVariants(term);
      users = await this.prisma.user.findMany({
        where: {
          AND: [
            base,
            {
              OR: variants.flatMap((v) => [
                { username: { contains: v, mode: 'insensitive' as const } },
                { displayName: { contains: v, mode: 'insensitive' as const } },
                { arabicName: { contains: v } },
              ]),
            },
          ],
        },
        select: COLLECTION_USER_SELECT,
        orderBy: [{ verified: 'desc' }, { followers: { _count: 'desc' } }],
        take: COLLECTION_USERS_LIMIT,
      });
    } else {
      const followed = await this.prisma.follow.findMany({
        where: { followerId: user.userId, following: base },
        select: { following: { select: COLLECTION_USER_SELECT } },
        orderBy: { createdAt: 'desc' },
        take: COLLECTION_USERS_LIMIT,
      });
      users = followed.map((row) => row.following);
      if (users.length < COLLECTION_USERS_LIMIT) {
        const exclude = [user.userId, ...users.map((u) => u.id)];
        const popular = await this.prisma.user.findMany({
          where: { AND: [base, { id: { notIn: exclude } }] },
          select: COLLECTION_USER_SELECT,
          orderBy: [{ followers: { _count: 'desc' } }, { createdAt: 'desc' }],
          take: COLLECTION_USERS_LIMIT - users.length,
        });
        users = [...users, ...popular];
      }
    }
    let memberIds = new Set<string>();
    if (collectionId && users.length > 0) {
      const rows = await this.prisma.collectionMember.findMany({
        where: { collectionId, userId: { in: users.map((u) => u.id) } },
        select: { userId: true },
      });
      memberIds = new Set(rows.map((r) => r.userId));
    }
    return {
      users: users.map((u) => ({ ...u, isMember: memberIds.has(u.id) })),
    };
  }

  // ── Followers ────────────────────────────────────────────────────────────

  async follow(user: JwtPayload, id: string) {
    const row = await this.findVisible(id, user.userId);
    if (row.ownerId === user.userId) {
      throwApi(400, 'invalid_action', 'لا يمكنك متابعة قائمتك');
    }
    // Idempotent: the unique pair keeps a single row.
    await this.prisma.collectionFollower.createMany({
      data: [{ collectionId: id, userId: user.userId }],
      skipDuplicates: true,
    });
    const followersCount = await this.prisma.collectionFollower.count({
      where: { collectionId: id },
    });
    return { following: true, followersCount };
  }

  async unfollow(user: JwtPayload, id: string) {
    await this.prisma.collectionFollower.deleteMany({
      where: { collectionId: id, userId: user.userId },
    });
    const followersCount = await this.prisma.collectionFollower.count({
      where: { collectionId: id },
    });
    return { following: false, followersCount };
  }

  async listFollowers(
    id: string,
    cursor: string | undefined,
    viewer?: JwtPayload,
  ) {
    const viewerId = viewer?.userId;
    await this.findVisible(id, viewerId);
    const blockedIds = await this.blockedUserIds(viewerId);
    const rows = await this.prisma.collectionFollower.findMany({
      where: {
        collectionId: id,
        user: ACTIVE_USER,
        ...(blockedIds.length > 0 ? { userId: { notIn: blockedIds } } : {}),
      },
      include: { user: { select: COLLECTION_USER_SELECT } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: COLLECTIONS_PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > COLLECTIONS_PAGE_SIZE;
    const items = hasMore ? rows.slice(0, COLLECTIONS_PAGE_SIZE) : rows;
    return {
      users: items.map((row) => row.user),
      nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
      hasMore,
    };
  }

  // ── Block (per-user hide) ────────────────────────────────────────────────

  async block(user: JwtPayload, id: string) {
    const row = await this.prisma.collection.findUnique({
      where: { id },
      select: { ownerId: true },
    });
    if (!row) throwApi(404, 'not_found', 'القائمة غير موجودة');
    if (row.ownerId === user.userId) {
      throwApi(400, 'invalid_action', 'لا يمكنك حظر قائمتك');
    }
    await this.prisma.$transaction([
      this.prisma.collectionBlock.createMany({
        data: [{ collectionId: id, userId: user.userId }],
        skipDuplicates: true,
      }),
      this.prisma.collectionFollower.deleteMany({
        where: { collectionId: id, userId: user.userId },
      }),
    ]);
    return { blocked: true };
  }

  async unblock(user: JwtPayload, id: string) {
    await this.prisma.collectionBlock.deleteMany({
      where: { collectionId: id, userId: user.userId },
    });
    return { blocked: false };
  }

  // ── Feed ─────────────────────────────────────────────────────────────────

  /**
   * Live feed: members' own posts (POSTS) or listings (ADS) through the main feeds'
   * visibility filters, selects, block filter and cursor — nothing is copied, so new
   * content shows up by itself. The member filter is a single sub-select
   * (authorId/sellerId IN members of this collection).
   */
  async feed(id: string, cursor: string | undefined, viewer?: JwtPayload) {
    const row = await this.findVisible(id, viewer?.userId);
    const members = { collectionMemberships: { some: { collectionId: id } } };
    if (row.type === 'ADS') {
      const page = await this.listings.listScoped(
        { seller: members },
        cursor,
        viewer?.userId,
      );
      return { type: row.type, ...page };
    }
    const page = await this.posts.listFeedScoped(
      { author: members },
      cursor,
      viewer,
    );
    return { type: row.type, ...page };
  }
}
