import { readFileSync } from 'fs';
import { join } from 'path';
import { ApiException } from '../../common/exceptions/api.exception';
import { UserReviewsRepository } from './user-reviews.repository';
import {
  REVIEW_CREATE_LIMIT,
  UserReviewsService,
} from './user-reviews.service';

type Person = {
  id: string;
  username: string;
  displayName: string;
  arabicName: string;
  avatar: string | null;
  isActive: boolean;
  deletedAt: Date | null;
  rating: number;
  reviewCount: number;
};

type Review = {
  id: string;
  targetId: string;
  reviewerId: string;
  rating: number;
  comment: string;
  purchased: boolean;
  recommend: boolean;
  oathAcceptedAt: Date | null;
  hiddenAt: Date | null;
  hiddenReason: string | null;
  hiddenById: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type Ticket = {
  id: string;
  type: string;
  deletedAt: Date | null;
  metadata: { targetType?: string; targetId?: string };
  ticketNumber: string;
  status: string;
  subject: string;
  description: string;
  createdAt: Date;
  reporterId: string;
};

function person(id: string, extra: Partial<Person> = {}): Person {
  return {
    id,
    username: id,
    displayName: id,
    arabicName: `الاسم ${id}`,
    avatar: null,
    isActive: true,
    deletedAt: null,
    rating: 0,
    reviewCount: 0,
    ...extra,
  };
}

function matchesReview(
  row: Review,
  where: Record<string, unknown> | undefined,
): boolean {
  if (!where) return true;
  if (typeof where.id === 'string' && row.id !== where.id) return false;
  if (typeof where.targetId === 'string' && row.targetId !== where.targetId)
    return false;
  if (where.hiddenAt === null && row.hiddenAt !== null) return false;
  const hidden = where.hiddenAt as { not?: null } | null | undefined;
  if (
    hidden &&
    typeof hidden === 'object' &&
    'not' in hidden &&
    hidden.not === null &&
    row.hiddenAt === null
  ) {
    return false;
  }
  if (typeof where.recommend === 'boolean' && row.recommend !== where.recommend)
    return false;
  const pair = where.targetId_reviewerId as
    { targetId: string; reviewerId: string } | undefined;
  if (
    pair &&
    (row.targetId !== pair.targetId || row.reviewerId !== pair.reviewerId)
  )
    return false;
  const or = where.OR as Record<string, unknown>[] | undefined;
  if (or && !or.some((clause) => matchesOr(row, clause))) return false;
  return true;
}

function matchesOr(row: Review, clause: Record<string, unknown>): boolean {
  const comment = clause.comment as { contains?: string } | undefined;
  if (
    comment?.contains &&
    row.comment.toLowerCase().includes(comment.contains.toLowerCase())
  ) {
    return true;
  }
  return false;
}

function isOlder(cursor: Review, row: Review): boolean {
  const delta = row.createdAt.getTime() - cursor.createdAt.getTime();
  if (delta !== 0) return delta < 0;
  return row.id < cursor.id;
}

function makeHarness() {
  const users = new Map<string, Person>();
  const reviews: Review[] = [];
  const blocks: { blockerId: string; blockedId: string }[] = [];
  const actions: Record<string, unknown>[] = [];
  const tickets: Ticket[] = [];
  let seq = 0;

  const hydrate = (row: Review, include?: Record<string, unknown>) => {
    const copy: Record<string, unknown> = { ...row };
    if (include?.reviewer) copy.reviewer = users.get(row.reviewerId);
    if (include?.target) copy.target = users.get(row.targetId);
    if (include?.hiddenBy) {
      const hider = row.hiddenById ? users.get(row.hiddenById) : undefined;
      copy.hiddenBy = hider ? { id: hider.id, username: hider.username } : null;
    }
    return copy;
  };

  const client = {
    user: {
      findFirst: async ({
        where,
      }: {
        where: { id: string; isActive?: boolean; deletedAt?: null };
      }) => {
        const user = users.get(where.id);
        if (!user) return null;
        if (where.isActive === true && !user.isActive) return null;
        if (where.deletedAt === null && user.deletedAt) return null;
        return user;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<Person>;
      }) => {
        const user = users.get(where.id);
        if (!user) throw new Error('missing user');
        Object.assign(user, data);
        return user;
      },
    },
    userBlock: {
      findUnique: async ({
        where,
      }: {
        where: {
          blockerId_blockedId: { blockerId: string; blockedId: string };
        };
      }) => {
        const key = where.blockerId_blockedId;
        return (
          blocks.find(
            (b) =>
              b.blockerId === key.blockerId && b.blockedId === key.blockedId,
          ) ?? null
        );
      },
    },
    userReview: {
      findUnique: async ({
        where,
        include,
      }: {
        where: Record<string, unknown>;
        include?: Record<string, unknown>;
      }) => {
        const row = reviews.find((r) => matchesReview(r, where)) ?? null;
        return row ? hydrate(row, include) : null;
      },
      create: async ({
        data,
        include,
      }: {
        data: Omit<
          Review,
          | 'id'
          | 'hiddenAt'
          | 'hiddenReason'
          | 'hiddenById'
          | 'createdAt'
          | 'updatedAt'
        > & { createdAt?: Date };
        include?: Record<string, unknown>;
      }) => {
        if (
          reviews.some(
            (r) =>
              r.targetId === data.targetId && r.reviewerId === data.reviewerId,
          )
        ) {
          const error = new Error('Unique constraint failed');
          (error as { code?: string }).code = 'P2002';
          throw error;
        }
        const row: Review = {
          id: `rev-${++seq}`,
          hiddenAt: null,
          hiddenReason: null,
          hiddenById: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        reviews.push(row);
        return hydrate(row, include);
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const row = reviews.find((r) => r.id === where.id);
        if (!row) throw new Error('missing review');
        const frozen = [
          'rating',
          'comment',
          'purchased',
          'recommend',
          'oathAcceptedAt',
          'targetId',
          'reviewerId',
        ];
        for (const key of frozen) {
          if (key in data && data[key] !== row[key as keyof Review]) {
            throw new Error('user_review_immutable');
          }
        }
        if (
          row.hiddenAt &&
          ('hiddenAt' in data || 'hiddenReason' in data || 'hiddenById' in data)
        ) {
          throw new Error('user_review_hide_final');
        }
        Object.assign(row, data, { updatedAt: new Date() });
        return { id: row.id, targetId: row.targetId, hiddenAt: row.hiddenAt };
      },
      delete: async () => {
        throw new Error('user_review_immutable');
      },
      aggregate: async ({ where }: { where: Record<string, unknown> }) => {
        const rows = reviews.filter((r) => matchesReview(r, where));
        const sum = rows.reduce((total, row) => total + row.rating, 0);
        return {
          _avg: { rating: rows.length ? sum / rows.length : null },
          _count: { _all: rows.length },
        };
      },
      count: async ({ where }: { where: Record<string, unknown> }) =>
        reviews.filter((r) => matchesReview(r, where)).length,
      findMany: async (args: {
        where?: Record<string, unknown>;
        take?: number;
        skip?: number;
        cursor?: { id: string };
        include?: Record<string, unknown>;
      }) => {
        let rows = reviews.filter((r) => matchesReview(r, args.where));
        rows.sort(
          (a, b) =>
            b.createdAt.getTime() - a.createdAt.getTime() ||
            (a.id < b.id ? 1 : -1),
        );
        if (args.cursor?.id) {
          const cursor = reviews.find((r) => r.id === args.cursor?.id);
          if (!cursor) {
            const error = new Error('cursor missing');
            (error as { code?: string }).code = 'P2025';
            throw error;
          }
          rows = rows.filter((row) => isOlder(cursor, row));
        } else if (args.skip) {
          rows = rows.slice(args.skip);
        }
        if (args.take) rows = rows.slice(0, args.take);
        return rows.map((row) => hydrate(row, args.include));
      },
    },
    supportTicket: {
      findMany: async ({
        where,
      }: {
        where: { metadata?: { equals?: string } };
      }) => {
        const id = where.metadata?.equals;
        return tickets.filter(
          (ticket) =>
            ticket.deletedAt == null && ticket.metadata?.targetId === id,
        );
      },
    },
    adminAccountAction: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        actions.push(data);
        return data;
      },
    },
  };

  const repo = new UserReviewsRepository(client as never);
  const deleteReview = () => client.userReview.delete();
  const reports = {
    create: jest
      .fn()
      .mockResolvedValue({ id: 'ticket-1', ticketNumber: 'RPT-1' }),
  };
  const redis = {
    isEnabled: () => false,
    cacheDel: jest.fn().mockResolvedValue(1),
    getRedis: () => null,
  };
  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  const service = new UserReviewsService(
    repo,
    reports as never,
    redis as never,
    logger as never,
  );

  const input = (
    over: Partial<{
      rating: number;
      purchased: boolean;
      recommend: boolean;
      comment: string;
      oathAccepted: boolean;
    }> = {},
  ) => ({
    rating: 5,
    purchased: true,
    recommend: true,
    comment: 'تعامل واضح وسريع',
    oathAccepted: true as const,
    ...over,
  });

  return {
    users,
    reviews,
    blocks,
    actions,
    tickets,
    service,
    reports,
    redis,
    input,
    person,
    deleteReview,
  };
}

const viewer = (userId: string) => ({
  userId,
  username: userId,
  role: 'USER' as const,
});

describe('user reviews', () => {
  it('rejects a second review and leaves the first comment unchanged', async () => {
    const h = makeHarness();
    h.users.set('seller', h.person('seller'));
    h.users.set('buyer', h.person('buyer'));

    const created = await h.service.create('seller', 'buyer', h.input());
    expect(created.review.comment).toBe('تعامل واضح وسريع');
    expect(created.reviewCount).toBe(1);
    expect(created.positiveCount).toBe(1);

    await expect(
      h.service.create(
        'seller',
        'buyer',
        h.input({ comment: 'نص معدّل', rating: 1, recommend: false }),
      ),
    ).rejects.toMatchObject({ status: 409, error: 'review_exists' });

    expect(h.reviews).toHaveLength(1);
    expect(h.reviews[0].comment).toBe('تعامل واضح وسريع');
    expect(h.reviews[0].rating).toBe(5);
    await expect(h.deleteReview()).rejects.toThrow('user_review_immutable');
  });

  it('validates oath, length, self-review and blocks', async () => {
    const h = makeHarness();
    h.users.set('seller', h.person('seller'));
    h.users.set('buyer', h.person('buyer'));

    await expect(
      h.service.create('buyer', 'buyer', h.input()),
    ).rejects.toMatchObject({
      status: 400,
      error: 'invalid_action',
    });
    await expect(
      h.service.create(
        'seller',
        'buyer',
        h.input({ oathAccepted: false as never }),
      ),
    ).rejects.toMatchObject({ status: 400, error: 'oath_required' });
    await expect(
      h.service.create('seller', 'buyer', h.input({ comment: '   ' })),
    ).rejects.toMatchObject({ status: 400, error: 'comment_required' });
    await expect(
      h.service.create(
        'seller',
        'buyer',
        h.input({ comment: 'ا'.repeat(1001) }),
      ),
    ).rejects.toMatchObject({ status: 400, error: 'comment_too_long' });
    await expect(
      h.service.create('seller', 'buyer', h.input({ rating: 0 })),
    ).rejects.toMatchObject({ status: 400, error: 'invalid_rating' });
    await expect(
      h.service.create(
        'seller',
        'buyer',
        h.input({ purchased: 'yes' as never }),
      ),
    ).rejects.toMatchObject({ status: 400, error: 'validation_error' });

    h.blocks.push({ blockerId: 'seller', blockedId: 'buyer' });
    await expect(
      h.service.create('seller', 'buyer', h.input()),
    ).rejects.toMatchObject({
      status: 403,
      error: 'blocked',
    });
    expect(h.reviews).toHaveLength(0);
  });

  it('excludes hidden reviews from counts and the average, and refuses a second hide', async () => {
    const h = makeHarness();
    h.users.set('seller', h.person('seller'));
    h.users.set('fan', h.person('fan'));
    h.users.set('critic', h.person('critic'));
    h.users.set('mod', h.person('mod'));

    await h.service.create(
      'seller',
      'fan',
      h.input({ rating: 5, recommend: true }),
    );
    await h.service.create(
      'seller',
      'critic',
      h.input({ rating: 1, recommend: false, comment: 'تجربة سيئة' }),
    );

    let page = await h.service.list('seller', undefined, 10, viewer('fan'));
    expect(page.reviewCount).toBe(2);
    expect(page.positiveCount).toBe(1);
    expect(page.negativeCount).toBe(1);
    expect(page.average).toBe(3);
    expect(h.users.get('seller')?.rating).toBe(3);
    expect(h.users.get('seller')?.reviewCount).toBe(2);

    const negative = h.reviews.find((row) => row.recommend === false)!;
    const hidden = await h.service.adminHide(
      negative.id,
      viewer('mod'),
      'إساءة',
    );
    expect(hidden.reviewCount).toBe(1);
    expect(hidden.average).toBe(5);
    expect(negative.comment).toBe('تجربة سيئة');
    expect(negative.hiddenReason).toBe('إساءة');
    expect(h.actions).toEqual([
      expect.objectContaining({
        action: 'hide_user_review',
        userId: 'seller',
        actorId: 'mod',
        reason: 'إساءة',
      }),
    ]);

    page = await h.service.list('seller', undefined, 10);
    expect(page.reviews.map((row) => row.id)).toEqual([
      h.reviews.find((row) => row.recommend)?.id,
    ]);
    expect(page.positiveCount).toBe(1);
    expect(page.negativeCount).toBe(0);
    expect(page.reviewCount).toBe(1);

    await expect(
      h.service.adminHide(negative.id, viewer('mod'), 'مرة ثانية'),
    ).rejects.toMatchObject({
      status: 409,
      error: 'already_hidden',
    });
    expect(h.actions).toHaveLength(1);
  });

  it('pages with a cursor and skips hidden rows', async () => {
    const h = makeHarness();
    h.users.set('seller', h.person('seller'));
    const reviewers = ['a', 'b', 'c', 'd', 'e'];
    for (const id of reviewers) h.users.set(id, h.person(id));

    for (let i = 0; i < reviewers.length; i += 1) {
      await h.service.create(
        'seller',
        reviewers[i],
        h.input({ comment: `تعليق ${i}`, rating: (i % 5) + 1 }),
      );
      h.reviews[h.reviews.length - 1].createdAt = new Date(
        Date.UTC(2026, 0, 1, 0, i),
      );
    }
    h.reviews[0].hiddenAt = new Date();

    const seen: string[] = [];
    let cursor: string | undefined;
    let guard = 0;
    do {
      const page = await h.service.list('seller', cursor, 2);
      expect(page.reviews.length).toBeGreaterThan(0);
      expect(page.reviews.length).toBeLessThanOrEqual(2);
      for (const row of page.reviews) {
        expect(seen).not.toContain(row.id);
        expect(row.comment).not.toBe('تعليق 0');
        seen.push(row.id);
      }
      cursor = page.nextCursor ?? undefined;
      expect(page.hasMore).toBe(Boolean(cursor));
      guard += 1;
    } while (cursor && guard < 10);

    expect(seen).toHaveLength(4);
    expect(guard).toBeLessThan(10);
  });

  it('rate-limits review creation per reviewer', async () => {
    const h = makeHarness();
    h.users.set('buyer', h.person('buyer'));
    for (let i = 0; i < REVIEW_CREATE_LIMIT + 1; i += 1) {
      h.users.set(`t${i}`, h.person(`t${i}`));
    }
    for (let i = 0; i < REVIEW_CREATE_LIMIT; i += 1) {
      await h.service.create(
        `t${i}`,
        'buyer',
        h.input({ comment: `تعليق ${i}` }),
      );
    }
    await expect(
      h.service.create(`t${REVIEW_CREATE_LIMIT}`, 'buyer', h.input()),
    ).rejects.toBeInstanceOf(ApiException);
    await expect(
      h.service.create(`t${REVIEW_CREATE_LIMIT}`, 'buyer', h.input()),
    ).rejects.toMatchObject({ status: 429, error: 'rate_limited' });
    expect(h.reviews).toHaveLength(REVIEW_CREATE_LIMIT);
  });

  it('reports a visible review through the reports flow and refuses own or hidden reviews', async () => {
    const h = makeHarness();
    h.users.set('seller', h.person('seller'));
    h.users.set('buyer', h.person('buyer'));
    h.users.set('other', h.person('other'));
    const created = await h.service.create('seller', 'buyer', h.input());

    await expect(
      h.service.report('seller', created.review.id, viewer('buyer'), {
        reason: 'إساءة',
      }),
    ).rejects.toMatchObject({ status: 400, error: 'invalid_action' });

    const ticket = await h.service.report(
      'seller',
      created.review.id,
      viewer('other'),
      {
        reason: 'محتوى مسيء',
      },
    );
    expect(ticket).toMatchObject({ id: 'ticket-1' });
    expect(h.reports.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'other' }),
      expect.objectContaining({
        targetType: 'review',
        targetId: created.review.id,
        reason: 'محتوى مسيء',
      }),
    );

    await h.service.adminHide(created.review.id, viewer('seller'), 'مخالفة');
    await expect(
      h.service.report('seller', created.review.id, viewer('other'), {
        reason: 'مرة أخرى',
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('keeps the database guard and has no edit or delete route', () => {
    const migration = readFileSync(
      join(
        __dirname,
        '../../../prisma/migrations/20261020150000_immutable_user_reviews/migration.sql',
      ),
      'utf8',
    );
    expect(migration).toContain('user_review_immutable');
    expect(migration).toContain('user_review_hide_final');
    expect(migration).toContain('BEFORE DELETE');
    expect(migration).toContain('SET "recommend" = ("rating" >= 4)');

    const controller = readFileSync(
      join(__dirname, 'user-reviews.controller.ts'),
      'utf8',
    );
    const admin = readFileSync(
      join(__dirname, 'admin-user-reviews.controller.ts'),
      'utf8',
    );
    const repo = readFileSync(
      join(__dirname, 'user-reviews.repository.ts'),
      'utf8',
    );
    expect(controller).not.toMatch(/@(Patch|Put|Delete)\(/);
    expect(admin).not.toMatch(/@(Patch|Put|Delete)\(/);
    expect(admin).toContain("@Post(':id/hide')");
    expect(repo).toContain('hiddenAt: null');
    expect(repo).not.toMatch(
      /userReview\.(delete|upsert|updateMany|deleteMany)\(/,
    );
    expect(repo).toContain('userReview.create(');

    const methods = Object.getOwnPropertyNames(UserReviewsService.prototype);
    expect(
      methods.filter((name) => /delete|update|edit|remove/i.test(name)),
    ).toEqual([]);
  });
});
