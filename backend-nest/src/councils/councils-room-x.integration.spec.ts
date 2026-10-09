import { PrismaClient } from '@prisma/client';
import { CouncilsService } from './councils.service';
import { CouncilPresenceService } from './services/council-presence.service';
import {
  COUNCIL_LISTENERS_PAGE,
  CouncilRealtimeService,
} from './services/council-realtime.service';
import { CouncilAgoraModerationService } from './services/council-agora-moderation.service';
import { COUNCIL_MAX_SPEAKERS } from './lib/council-policy';
import { RedisCacheService } from '../redis/services/redis-cache.service';
import { ReportsService } from '../reports/reports.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { JwtPayload } from '../common/types/jwt-payload.interface';

/**
 * Real-database suite for the X Spaces style room: every present participant in the
 * grid (paged, moderators first), the 12-seat stage cap, and «عرض صورة» (Gold).
 *   COUNCILS_TEST_DATABASE_URL=postgresql://... npx jest councils-room-x
 */
const DB_URL = process.env.COUNCILS_TEST_DATABASE_URL;
const suite = DB_URL ? describe : describe.skip;

type ApiErr = { status: number; error: string };
async function apiError(fn: () => Promise<unknown>): Promise<ApiErr> {
  try {
    await fn();
  } catch (err) {
    return err as ApiErr;
  }
  throw new Error('expected an ApiException');
}

const IMG = 'https://res.cloudinary.com/demo/image/upload/v1/posts/a.jpg';
const IMG2 = 'https://res.cloudinary.com/demo/image/upload/v1/posts/b.jpg';
const LISTING_IMG =
  'https://res.cloudinary.com/demo/image/upload/v1/listings/camel.jpg';

suite('Council room X Spaces grid + «عرض صورة» (real Postgres)', () => {
  let prisma: PrismaClient;
  let service: CouncilsService;
  let presence: CouncilPresenceService;
  let reports: ReportsService;
  const bridge = { toCouncil: jest.fn(), toUser: jest.fn() };
  const tag = `x${Date.now().toString(36)}`;
  const users: Record<string, string> = {};
  const slugs: Record<string, string> = {};
  const listingIds: string[] = [];
  const env = { ...process.env };
  const as = (name: string) =>
    ({ userId: users[name], username: name }) as unknown as JwtPayload;

  async function makeUser(name: string, slug = 'free') {
    const user = await prisma.user.create({
      data: {
        username: `${tag}_${name}`,
        passwordHash: 'x',
        displayName: `${name} user`,
        arabicName: `مستخدم ${name}`,
      },
    });
    users[name] = user.id;
    slugs[user.id] = slug;
  }

  async function makeListing(owner: string, images: string[]) {
    const l = await prisma.listing.create({
      data: {
        sellerId: users[owner],
        title: 'Camel',
        arabicTitle: 'ناقة',
        description: 'd',
        arabicDescription: 'd',
        price: 1000,
        category: 'camels',
        location: 'Riyadh',
        arabicLocation: 'الرياض',
        country: 'SA',
        images,
      },
    });
    listingIds.push(l.id);
    return l.id;
  }

  /** Joins through REST and marks the user present (socket heartbeat). */
  async function enter(councilId: string, name: string) {
    await service.join(as(name), councilId, { acceptRules: true });
    await presence.touch(councilId, users[name]);
  }

  beforeAll(async () => {
    process.env.REDIS_ENABLED = 'false';
    delete process.env.AGORA_APP_ID;
    prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });
    const db = prisma as unknown as PrismaService;
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };
    const cache = new RedisCacheService(logger as never);
    presence = new CouncilPresenceService(cache);
    const realtime = new CouncilRealtimeService(
      db,
      cache,
      presence,
      bridge as never,
    );
    const entitlements = {
      getEffectivePlanSlugForUser: jest.fn(
        async (id: string) => slugs[id] ?? 'free',
      ),
    };
    service = new CouncilsService(
      db,
      cache,
      presence,
      realtime,
      new CouncilAgoraModerationService(logger as never, cache),
      { notifyUsers: jest.fn(), notifyUser: jest.fn() } as never,
      logger as never,
      entitlements as never,
    );
    reports = new ReportsService(db);
    await makeUser('host', 'gold-badge');
    await makeUser('plainhost');
    await makeUser('goldspk', 'gold-badge');
    await makeUser('goldlis', 'gold-badge');
    await makeUser('mod');
    for (let i = 0; i < 75; i++) await makeUser(`u${i}`);
  });

  afterAll(async () => {
    const ids = Object.values(users);
    await prisma.supportTicket.deleteMany({
      where: { reporterId: { in: ids } },
    });
    await prisma.listing.deleteMany({ where: { id: { in: listingIds } } });
    await prisma.council.deleteMany({ where: { ownerId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
    process.env = env;
  });

  let councilId = '';

  it('shows every present participant, paged, moderators first, speakers excluded', async () => {
    const created = await service.create(as('host'), {
      name: 'مجلس الحلال',
      visibility: 'PUBLIC',
      rules: [],
    } as never);
    councilId = created.state.council.id;
    await presence.touch(councilId, users.host);
    for (let i = 0; i < 70; i++) await enter(councilId, `u${i}`);
    await enter(councilId, 'mod');
    await service.memberAction(
      as('host'),
      councilId,
      users.mod,
      'make_moderator',
    );
    // Joined but no heartbeat (closed the app): not in the grid.
    await service.join(as('u70'), councilId, { acceptRules: true });

    const state = await service.getState(as('u0'), councilId);
    expect(state.listeners).toHaveLength(COUNCIL_LISTENERS_PAGE);
    expect(state.listeners[0]).toMatchObject({
      userId: users.mod,
      role: 'MODERATOR',
    });
    expect(state.listenersNextCursor).toBe(String(COUNCIL_LISTENERS_PAGE));
    expect(state.listeners.some((l) => l.userId === users.host)).toBe(false);

    const next = await service.listeners(
      as('u0'),
      councilId,
      state.listenersNextCursor!,
    );
    expect(next.nextCursor).toBeNull();
    const all = [...state.listeners, ...next.listeners].map((l) => l.userId);
    expect(all).toHaveLength(71);
    expect(new Set(all).size).toBe(71);
    expect(all).not.toContain(users.u70);

    // Non-members cannot page the room.
    const err = await apiError(() =>
      service.listeners(as('u74'), councilId, '0'),
    );
    expect(err.status).toBe(404);
  });

  it('keeps 12 stage seats (owner included) and enforces it server-side', async () => {
    for (let i = 0; i < COUNCIL_MAX_SPEAKERS - 1; i++) {
      await service.memberAction(
        as('host'),
        councilId,
        users[`u${i}`],
        'promote',
      );
    }
    const full = await service.getState(as('u20'), councilId);
    expect(full.speakersCount).toBe(COUNCIL_MAX_SPEAKERS);
    expect(full.isFull).toBe(true);
    // Speakers leave the participants grid's off-stage list.
    expect(full.listeners.some((l) => l.userId === users.u0)).toBe(false);
    const err = await apiError(() =>
      service.memberAction(as('host'), councilId, users.u20, 'promote'),
    );
    expect(err).toMatchObject({ status: 409, error: 'council_full' });
    const req = await apiError(() =>
      service.requestToSpeak(as('u21'), councilId),
    );
    expect(req).toMatchObject({ status: 409, error: 'council_full' });
    // Demote frees a seat for the next one.
    await service.memberAction(as('host'), councilId, users.u10, 'demote');
    await service.memberAction(as('host'), councilId, users.u20, 'promote');
    for (let i = 0; i < COUNCIL_MAX_SPEAKERS - 1; i++) {
      const id = i === 10 ? users.u20 : users[`u${i}`];
      await service.memberAction(as('host'), councilId, id, 'demote');
    }
  });

  it('«عرض صورة» is Gold only, for the owner or a speaker on stage', async () => {
    const plain = await service.create(as('plainhost'), {
      name: 'مجلس عادي',
      visibility: 'PUBLIC',
      rules: [],
    } as never);
    const notGold = await apiError(() =>
      service.showImage(as('plainhost'), plain.state.council.id, {
        imageUrl: IMG,
      }),
    );
    expect(notGold).toMatchObject({
      status: 403,
      error: 'council_image_gold_only',
    });

    await enter(councilId, 'goldlis');
    const listener = await apiError(() =>
      service.showImage(as('goldlis'), councilId, { imageUrl: IMG }),
    );
    expect(listener).toMatchObject({ status: 403, error: 'forbidden' });

    const host = await service.getState(as('host'), councilId);
    expect(host.me.canShowImage).toBe(true);
    const gl = await service.getState(as('goldlis'), councilId);
    expect(gl.me.canShowImage).toBe(false);
  });

  it('pins, broadcasts and persists the image; the owner replaces, others wait', async () => {
    bridge.toCouncil.mockClear();
    const out = await service.showImage(as('host'), councilId, {
      imageUrl: IMG,
    });
    expect(out.image).toMatchObject({
      url: IMG,
      listingId: null,
      by: { id: users.host },
    });
    expect(bridge.toCouncil).toHaveBeenCalledWith(
      councilId,
      'council:image',
      expect.objectContaining({ image: expect.objectContaining({ url: IMG }) }),
    );

    // Late joiner sees it from the state.
    await enter(councilId, 'u72');
    const late = await service.getState(as('u72'), councilId);
    expect(late.image?.url).toBe(IMG);

    // A Gold speaker cannot replace the owner's image…
    await enter(councilId, 'goldspk');
    await service.memberAction(as('host'), councilId, users.goldspk, 'promote');
    const busy = await apiError(() =>
      service.showImage(as('goldspk'), councilId, { imageUrl: IMG2 }),
    );
    expect(busy).toMatchObject({ status: 409, error: 'council_image_busy' });

    // …a listing photo must come from the poster's own listing…
    const foreign = await makeListing('u30', [LISTING_IMG]);
    const notMine = await apiError(() =>
      service.showImage(as('host'), councilId, {
        imageUrl: LISTING_IMG,
        listingId: foreign,
      }),
    );
    expect(notMine).toMatchObject({ status: 400, error: 'invalid_image' });

    // …and the owner replaces with a photo from their listing («عرض الإعلان»).
    const mine = await makeListing('host', [LISTING_IMG, IMG2]);
    const replaced = await service.showImage(as('host'), councilId, {
      imageUrl: IMG2,
      listingId: mine,
    });
    expect(replaced.image).toMatchObject({
      url: IMG2,
      listingId: mine,
      listing: { id: mine, title: 'Camel' },
    });
    const sources = await service.imageSources(as('host'));
    expect(sources.canShowImages).toBe(true);
    expect(sources.listings.find((l) => l.id === mine)?.images).toEqual([
      LISTING_IMG,
      IMG2,
    ]);
  });

  it('reports capture the current image; removal is owner / moderator / poster only', async () => {
    const ticket = await reports.create(as('u40') as never, {
      targetType: 'council_image',
      targetId: councilId,
      reason: 'محتوى غير لائق',
    });
    const row = await prisma.supportTicket.findUniqueOrThrow({
      where: { id: ticket.id },
    });
    expect(row.description).toContain(IMG2);
    const own = await apiError(() =>
      reports.create(as('host') as never, {
        targetType: 'council_image',
        targetId: councilId,
        reason: 'x x x',
      }),
    );
    expect(own.status).toBe(400);

    const listener = await apiError(() =>
      service.removeImage(as('u41'), councilId),
    );
    expect(listener.status).toBe(403);

    bridge.toCouncil.mockClear();
    await expect(service.removeImage(as('mod'), councilId)).resolves.toEqual({
      removed: true,
    });
    expect(bridge.toCouncil).toHaveBeenCalledWith(
      councilId,
      'council:image',
      expect.objectContaining({ image: null }),
    );
    const after = await service.getState(as('u41'), councilId);
    expect(after.image).toBeNull();

    // Now the Gold speaker may show one, and remove their own.
    await service.showImage(as('goldspk'), councilId, { imageUrl: IMG });
    await expect(
      service.removeImage(as('goldspk'), councilId),
    ).resolves.toEqual({ removed: true });
    const none = await apiError(() =>
      reports.create(as('u40') as never, {
        targetType: 'council_image',
        targetId: councilId,
        reason: 'x x x',
      }),
    );
    expect(none.status).toBe(404);
  });
});
