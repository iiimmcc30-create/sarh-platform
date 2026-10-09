import { PrismaClient } from '@prisma/client';
import { CouncilsService } from './councils.service';
import { CouncilPresenceService } from './services/council-presence.service';
import { CouncilRealtimeService } from './services/council-realtime.service';
import { CouncilAgoraModerationService } from './services/council-agora-moderation.service';
import { RedisCacheService } from '../redis/services/redis-cache.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { JwtPayload } from '../common/types/jwt-payload.interface';

/**
 * Real-database suite for the council subscriber perks (followers-only for Gold
 * hosts, scheduling + «ذكّرني» for Blue+ / Gold). Same opt-in as the main suite:
 *   COUNCILS_TEST_DATABASE_URL=postgresql://... npx jest councils-perks
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

/** The scheduler claim is per tick; tests drive ticks explicitly. */
class TestCache extends RedisCacheService {
  async claimOnce(key: string, ttl?: number): Promise<boolean> {
    if (key === 'council:start-due') return true;
    return super.claimOnce(key, ttl);
  }
}

suite('Council subscriber perks (real Postgres)', () => {
  let prisma: PrismaClient;
  let service: CouncilsService;
  const notifyUsers = jest.fn().mockResolvedValue(undefined);
  const notifyUser = jest.fn().mockResolvedValue(undefined);
  const tag = `p${Date.now().toString(36)}`;
  const users: Record<string, string> = {};
  const slugs: Record<string, string> = {};
  const env = { ...process.env };
  const as = (name: string) =>
    ({ userId: users[name], username: name }) as unknown as JwtPayload;
  const inMinutes = (m: number) =>
    new Date(Date.now() + m * 60_000).toISOString();

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

  beforeAll(async () => {
    process.env.REDIS_ENABLED = 'false';
    process.env.AGORA_APP_ID = '0123456789abcdef0123456789abcdef';
    process.env.AGORA_APP_CERTIFICATE = 'fedcba9876543210fedcba9876543210';
    prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });
    const db = prisma as unknown as PrismaService;
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };
    const cache = new TestCache(logger as never);
    const presence = new CouncilPresenceService(cache);
    const bridge = { toCouncil: jest.fn(), toUser: jest.fn() };
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
      { notifyUsers, notifyUser } as never,
      logger as never,
      entitlements as never,
    );
    await makeUser('gold', 'gold-badge');
    await makeUser('plus', 'blue-plus-badge');
    await makeUser('blue', 'blue-badge');
    await makeUser('fan');
    await makeUser('stranger');
    await makeUser('guest');
    await prisma.follow.create({
      data: { followerId: users.fan, followingId: users.gold },
    });
  });

  afterAll(async () => {
    const ids = Object.values(users);
    await prisma.council.deleteMany({ where: { ownerId: { in: ids } } });
    await prisma.follow.deleteMany({ where: { followerId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
    process.env = env;
  });

  beforeEach(() => {
    notifyUsers.mockClear();
    notifyUser.mockClear();
  });

  it('perks follow the active subscription tier', async () => {
    await expect(service.perks(as('gold'))).resolves.toMatchObject({
      canFollowersOnly: true,
      canSchedule: true,
    });
    await expect(service.perks(as('plus'))).resolves.toMatchObject({
      canFollowersOnly: false,
      canSchedule: true,
    });
    await expect(service.perks(as('blue'))).resolves.toMatchObject({
      canFollowersOnly: false,
      canSchedule: false,
    });
    await expect(service.perks(as('fan'))).resolves.toMatchObject({
      tier: null,
      canSchedule: false,
    });
  });

  it('followers-only: Gold hosts only; server lets in followers + invited only', async () => {
    const denied = await apiError(() =>
      service.create(as('plus'), {
        name: `${tag} plus`,
        visibility: 'PUBLIC',
        rules: [],
        followersOnly: true,
      }),
    );
    expect(denied).toMatchObject({ status: 403, error: 'perk_required' });

    const res = await service.create(as('gold'), {
      name: `${tag} gold`,
      visibility: 'PUBLIC',
      rules: [],
      followersOnly: true,
    });
    const id = res.state.council.id;
    expect(res.state.council.followersOnly).toBe(true);

    const blocked = await apiError(() => service.join(as('stranger'), id, {}));
    expect(blocked).toMatchObject({
      status: 403,
      error: 'council_followers_only',
    });

    const joined = await service.join(as('fan'), id, {});
    expect(joined.state.me.joined).toBe(true);

    await service.invite(as('gold'), id, [users.guest]);
    const invited = await service.join(as('guest'), id, {});
    expect(invited.state.me.joined).toBe(true);

    // Still listed publicly (tagged), just not joinable for non-followers.
    const list = await service.list(as('stranger'));
    expect(list.councils.find((c) => c.id === id)?.followersOnly).toBe(true);
    await service.end(as('gold'), id);
  });

  it('scheduling: Blue+ / Gold only, validated, not joinable before start', async () => {
    const blue = await apiError(() =>
      service.create(as('blue'), {
        name: `${tag} b`,
        visibility: 'PUBLIC',
        rules: [],
        scheduledFor: inMinutes(30),
      }),
    );
    expect(blue).toMatchObject({ status: 403, error: 'perk_required' });

    const soon = await apiError(() =>
      service.create(as('plus'), {
        name: `${tag} s`,
        visibility: 'PUBLIC',
        rules: [],
        scheduledFor: inMinutes(1),
      }),
    );
    expect(soon).toMatchObject({ status: 400, error: 'schedule_too_soon' });

    const res = await service.create(as('plus'), {
      name: `${tag} upcoming`,
      visibility: 'PUBLIC',
      rules: [],
      scheduledFor: inMinutes(30),
    });
    expect(res.agora).toBeNull();
    expect(res.state.council.status).toBe('SCHEDULED');
    const id = res.state.council.id;

    const early = await apiError(() => service.join(as('fan'), id, {}));
    expect(early).toMatchObject({ status: 409, error: 'council_not_started' });

    // A scheduled council does not block going live now.
    const live = await service.create(as('plus'), {
      name: `${tag} live now`,
      visibility: 'PUBLIC',
      rules: [],
    });
    expect(live.state.council.status).toBe('LIVE');

    const up = await service.upcoming(as('fan'));
    const card = up.councils.find((c) => c.id === id);
    expect(card).toMatchObject({
      remindMe: false,
      reminderCount: 0,
      isOwner: false,
    });

    await expect(service.remind(as('fan'), id, true)).resolves.toEqual({
      remindMe: true,
      reminderCount: 1,
    });
    await expect(
      service.remind(as('stranger'), id, true),
    ).resolves.toMatchObject({
      reminderCount: 2,
    });
    await expect(
      service.remind(as('stranger'), id, false),
    ).resolves.toMatchObject({
      remindMe: false,
      reminderCount: 1,
    });

    // Due, but the host is live elsewhere: waits, host nudged, no reminders yet.
    const due = new Date(Date.now() + 31 * 60_000);
    await expect(service.startDueScheduled(due)).resolves.toBe(0);
    expect(notifyUsers).not.toHaveBeenCalled();
    expect(notifyUser).toHaveBeenCalledTimes(1);

    await service.end(as('plus'), live.state.council.id);
    await expect(service.startDueScheduled(due)).resolves.toBe(1);
    const row = await prisma.council.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe('LIVE');
    expect(row.remindersSentAt).not.toBeNull();
    expect(notifyUsers).toHaveBeenCalledTimes(1);
    expect(notifyUsers.mock.calls[0][0]).toEqual([users.fan]);
    expect(notifyUsers.mock.calls[0][1].data).toEqual({
      kind: 'council_live',
      councilId: id,
    });

    // Re-running never starts or notifies twice; now joinable.
    notifyUsers.mockClear();
    await expect(service.startDueScheduled(due)).resolves.toBe(0);
    expect(notifyUsers).not.toHaveBeenCalled();
    const joined = await service.join(as('fan'), id, {});
    expect(joined.state.me.joined).toBe(true);
    await service.end(as('plus'), id);
  });

  it('host can start early (reminders sent once) and the 3-upcoming limit holds', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const r = await service.create(as('gold'), {
        name: `${tag} g${i}`,
        visibility: 'PUBLIC',
        rules: [],
        scheduledFor: inMinutes(60 + i),
      });
      ids.push(r.state.council.id);
    }
    const limit = await apiError(() =>
      service.create(as('gold'), {
        name: `${tag} g4`,
        visibility: 'PUBLIC',
        rules: [],
        scheduledFor: inMinutes(90),
      }),
    );
    expect(limit).toMatchObject({
      status: 409,
      error: 'council_schedule_limit',
    });

    await service.remind(as('fan'), ids[0], true);
    const notOwner = await apiError(() => service.start(as('fan'), ids[0]));
    expect(notOwner.status).toBe(403);

    const started = await service.start(as('gold'), ids[0]);
    expect(started.state.council.status).toBe('LIVE');
    expect(started.agora).not.toBeNull();
    expect(notifyUsers).toHaveBeenCalledTimes(1);

    const busy = await apiError(() => service.start(as('gold'), ids[1]));
    expect(busy).toMatchObject({ status: 409, error: 'council_exists' });

    // Stale (24h past) scheduled councils are dropped by the tick.
    await prisma.council.update({
      where: { id: ids[2] },
      data: { scheduledFor: new Date(Date.now() - 25 * 3600_000) },
    });
    await service.end(as('gold'), ids[0]);
    await service.startDueScheduled(new Date());
    const stale = await prisma.council.findUniqueOrThrow({
      where: { id: ids[2] },
    });
    expect(stale.status).toBe('ENDED');
    await service.end(as('gold'), ids[1]);
  });
});
