import { PrismaClient } from '@prisma/client';
import { CouncilsService } from './councils.service';
import { CouncilPresenceService } from './services/council-presence.service';
import { CouncilRealtimeService } from './services/council-realtime.service';
import { CouncilAgoraModerationService } from './services/council-agora-moderation.service';
import { RedisCacheService } from '../redis/services/redis-cache.service';
import { COUNCIL_MAX_SPEAKERS } from './lib/council-policy';
import type { PrismaService } from '../prisma/prisma.service';
import type { JwtPayload } from '../common/types/jwt-payload.interface';

/**
 * Real-database suite for «المجالس». Runs only against a disposable Postgres with
 * every migration applied:
 *   COUNCILS_TEST_DATABASE_URL=postgresql://... npx jest councils.integration
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

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { AccessToken2 } = require('agora-token/src/AccessToken2') as {
  AccessToken2: new () => {
    from_string(t: string): void;
    services: Record<number, { __privileges: Record<number, number> }>;
  };
};

function tokenPrivileges(token: string): string[] {
  const t = new AccessToken2();
  t.from_string(token);
  return Object.keys(t.services[1].__privileges).sort();
}

/** In-memory presence that claims to be shared so the stale-speaker sweep runs. */
class TestPresence extends CouncilPresenceService {
  isShared() {
    return true;
  }
}

suite('CouncilsService (real Postgres)', () => {
  let prisma: PrismaClient;
  let service: CouncilsService;
  let presence: TestPresence;
  const emits: Array<{ to: string; event: string; data: unknown }> = [];
  const notifyUsers = jest.fn().mockResolvedValue(undefined);
  const tag = `k${Date.now().toString(36)}`;
  const users: Record<string, string> = {};
  const env = { ...process.env };
  const jwt = (userId: string): JwtPayload =>
    ({ userId, username: userId }) as unknown as JwtPayload;
  const as = (name: string) => jwt(users[name]);

  async function makeUser(name: string) {
    const user = await prisma.user.create({
      data: {
        username: `${tag}_${name}`,
        passwordHash: 'x',
        displayName: `${name} user`,
        arabicName: `مستخدم ${name}`,
      },
    });
    users[name] = user.id;
    return user.id;
  }

  async function newCouncil(
    owner: string,
    extra: Partial<Parameters<CouncilsService['create']>[1]> = {},
  ) {
    const res = await service.create(as(owner), {
      name: `${tag} مجلس ${owner}`,
      visibility: 'PUBLIC',
      rules: [],
      ...extra,
    });
    return res.state.council.id;
  }

  /** Joins `name` as listener and opens a speak request; returns the request id. */
  async function listenerWithRequest(councilId: string, name: string) {
    await service.join(as(name), councilId, { acceptRules: true });
    const r = await service.requestToSpeak(as(name), councilId);
    return r.requestId;
  }

  async function seated(councilId: string) {
    return prisma.councilMember.count({
      where: { councilId, seatIndex: { not: null } },
    });
  }

  beforeAll(async () => {
    process.env.REDIS_ENABLED = 'false';
    process.env.AGORA_APP_ID = '0123456789abcdef0123456789abcdef';
    process.env.AGORA_APP_CERTIFICATE = 'fedcba9876543210fedcba9876543210';
    delete process.env.AGORA_CUSTOMER_ID;
    delete process.env.AGORA_CUSTOMER_SECRET;

    prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });
    const db = prisma as unknown as PrismaService;
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };
    const cache = new RedisCacheService(logger as never);
    presence = new TestPresence(cache);
    const bridge = {
      toCouncil: (id: string, event: string, data: unknown) =>
        emits.push({ to: `council:${id}`, event, data }),
      toUser: (id: string, event: string, data: unknown) =>
        emits.push({ to: `user:${id}`, event, data }),
    };
    const realtime = new CouncilRealtimeService(
      db,
      cache,
      presence,
      bridge as never,
    );
    service = new CouncilsService(
      db,
      cache,
      presence,
      realtime,
      new CouncilAgoraModerationService(logger as never, cache),
      { notifyUsers } as never,
      logger as never,
    );

    for (const name of [
      'owner',
      'owner2',
      'owner3',
      'owner4',
      'mod',
      'mod2',
      'listener',
      'speaker',
      'outsider',
      'invited',
      'coder',
      ...Array.from({ length: 16 }, (_, i) => `l${i}`),
    ]) {
      await makeUser(name);
    }
  });

  afterAll(async () => {
    process.env = env;
    if (!prisma) return;
    const ids = Object.values(users);
    await prisma.council.deleteMany({ where: { ownerId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  beforeEach(() => {
    emits.length = 0;
  });

  // Isolate scenarios: a failed test must not leave its owner with a live council.
  afterEach(async () => {
    await prisma.council.updateMany({
      where: {
        ownerId: { in: ['owner2', 'owner3', 'owner4'].map((n) => users[n]) },
        status: 'LIVE',
      },
      data: { status: 'ENDED', endedAt: new Date() },
    });
  });

  // 1 + 19
  it('creates a council: owner on seat 0 with a publisher (audio-only) token; one live council per owner', async () => {
    const res = await service.create(as('owner'), {
      name: `  ${tag} مجلس الحلال  `.trim(),
      description: 'وصف',
      visibility: 'PUBLIC',
      rules: ['الاحترام واجب', 'يمنع الإساءة'],
    });
    expect(res.state.council).toMatchObject({
      name: `${tag} مجلس الحلال`,
      status: 'LIVE',
      visibility: 'PUBLIC',
      maxSpeakers: 12,
      rules: ['الاحترام واجب', 'يمنع الإساءة'],
    });
    expect(res.state.me).toMatchObject({
      role: 'OWNER',
      seatIndex: 0,
      onStage: true,
      rtcRole: 'publisher',
    });
    expect(res.state.speakers).toHaveLength(1);
    expect(res.agora?.role).toBe('publisher');
    expect(res.agora?.channel).toMatch(/^council_[0-9a-f]{32}$/);
    expect(tokenPrivileges(res.agora!.token)).toEqual(['1', '2']); // join + audio only

    const dup = await apiError(() =>
      service.create(as('owner'), { name: 'ثاني', visibility: 'PUBLIC' }),
    );
    expect(dup).toMatchObject({ status: 409, error: 'council_exists' });
  });

  // 2 + 4 + 13 + 19
  it('public council: discoverable, rules must be accepted, listener joins as Agora audience', async () => {
    const { councils } = await service.list(as('listener'));
    const c = councils.find((x) => x.name === `${tag} مجلس الحلال`);
    expect(c).toBeDefined();
    const id = c!.id;

    const rules = await apiError(() => service.join(as('listener'), id, {}));
    expect(rules).toMatchObject({ status: 412, error: 'rules_required' });

    const joined = await service.join(as('listener'), id, {
      acceptRules: true,
    });
    expect(joined.state.me).toMatchObject({
      role: 'LISTENER',
      onStage: false,
      rulesAccepted: true,
      rtcRole: 'subscriber',
    });
    expect(joined.agora?.role).toBe('subscriber');
    expect(tokenPrivileges(joined.agora!.token)).toEqual(['1']); // join only
    // Listeners never get the pending-requests list or the invite code.
    expect(joined.state.pendingRequests).toEqual([]);
    expect(joined.state.council).not.toHaveProperty('inviteCode');

    // Listener cannot "unmute" (send audio) nor moderate.
    expect(
      await apiError(() => service.setMic(as('listener'), id, false)),
    ).toMatchObject({
      status: 403,
      error: 'not_on_stage',
    });
    const tok = await service.token(as('listener'), id);
    expect(tok.role).toBe('subscriber');
  });

  // 5 + 6 + 7 + 8
  it('speak requests: request → accept makes a speaker (publisher), reject keeps a listener', async () => {
    const id = await newCouncil('owner2');
    const req = await listenerWithRequest(id, 'speaker');
    const again = await service.requestToSpeak(as('speaker'), id);
    expect(again.requestId).toBe(req); // idempotent

    const ownerView = await service.getState(as('owner2'), id);
    expect(ownerView.pendingRequests.map((r) => r.id)).toContain(req);
    expect(
      emits.some(
        (e) =>
          e.to === `user:${users.owner2}` && e.event === 'council:requests',
      ),
    ).toBe(true);

    const accepted = await service.decideRequest(as('owner2'), id, req, true);
    expect(accepted).toMatchObject({ status: 'ACCEPTED', seatIndex: 1 });
    expect(
      emits.some(
        (e) => e.to === `user:${users.speaker}` && e.event === 'council:role',
      ),
    ).toBe(true);
    expect(emits.some((e) => e.event === 'council:speakers')).toBe(true);
    const speakerTok = await service.token(as('speaker'), id);
    expect(speakerTok).toMatchObject({
      role: 'publisher',
      seatIndex: 1,
      memberRole: 'SPEAKER',
    });

    const twice = await apiError(() =>
      service.decideRequest(as('owner2'), id, req, true),
    );
    expect(twice).toMatchObject({ status: 409, error: 'request_not_pending' });

    // Reject path
    const req2 = await listenerWithRequest(id, 'listener');
    const rejected = await service.decideRequest(as('owner2'), id, req2, false);
    expect(rejected.status).toBe('REJECTED');
    const s = await service.getState(as('listener'), id);
    expect(s.me).toMatchObject({
      role: 'LISTENER',
      onStage: false,
      pendingRequestId: null,
    });
    expect(
      await apiError(() => service.requestToSpeak(as('listener'), id)),
    ).toMatchObject({
      status: 429,
      error: 'request_cooldown',
    });

    // Speaker → Listener (self) and via the host
    await service.leaveStage(as('speaker'), id);
    expect((await service.token(as('speaker'), id)).role).toBe('subscriber');
    await service.memberAction(as('owner2'), id, users.speaker, 'promote');
    expect((await service.token(as('speaker'), id)).role).toBe('publisher');
    const demoted = await service.memberAction(
      as('owner2'),
      id,
      users.speaker,
      'demote',
    );
    expect(demoted.member).toMatchObject({ role: 'LISTENER', seatIndex: null });
    expect((await service.token(as('speaker'), id)).role).toBe('subscriber');

    const own = await apiError(() => service.leaveStage(as('owner2'), id));
    expect(own).toMatchObject({ status: 400, error: 'owner_stays_on_stage' });
  });

  // 9 + 10
  it('caps the stage at 12 (owner included) and refuses the 13th speaker', async () => {
    const id = await newCouncil('owner3');
    for (let i = 0; i < 11; i++) {
      await service.join(as(`l${i}`), id, {});
      await service.memberAction(as('owner3'), id, users[`l${i}`], 'promote');
    }
    expect(await seated(id)).toBe(COUNCIL_MAX_SPEAKERS);
    const state = await service.getState(as('owner3'), id);
    expect(state).toMatchObject({ speakersCount: 12, isFull: true });

    await service.join(as('l11'), id, {});
    expect(
      await apiError(() => service.requestToSpeak(as('l11'), id)),
    ).toMatchObject({
      status: 409,
      error: 'council_full',
    });
    expect(
      await apiError(() =>
        service.memberAction(as('owner3'), id, users.l11, 'promote'),
      ),
    ).toMatchObject({ status: 409, error: 'council_full' });
    expect(await seated(id)).toBe(12);

    // Database backstop: no 13th seat even if application logic were bypassed.
    const member = await prisma.councilMember.findFirstOrThrow({
      where: { councilId: id, userId: users.l11 },
    });
    await expect(
      prisma.councilMember.update({
        where: { id: member.id },
        data: { seatIndex: 12 },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.councilMember.update({
        where: { id: member.id },
        data: { seatIndex: 3 },
      }),
    ).rejects.toThrow();
    await service.end(as('owner3'), id);
  });

  it('race: concurrent accepts with one seat left → exactly one succeeds', async () => {
    const id = await newCouncil('owner3');
    // owner + 10 speakers = 11 seats taken, 1 left.
    for (let i = 0; i < 10; i++) {
      await service.join(as(`l${i}`), id, {});
      await service.memberAction(as('owner3'), id, users[`l${i}`], 'promote');
    }
    const requests: string[] = [];
    for (let i = 10; i < 15; i++)
      requests.push(await listenerWithRequest(id, `l${i}`));

    const results = await Promise.allSettled(
      requests.map((r) => service.decideRequest(as('owner3'), id, r, true)),
    );
    const ok = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter(
      (r) => r.status === 'rejected',
    ) as PromiseRejectedResult[];
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(4);
    for (const f of failed) {
      expect(f.reason).toMatchObject({ status: 409, error: 'council_full' });
    }
    expect(await seated(id)).toBe(12);
    // Losers keep their pending requests (can be accepted when a seat frees up).
    expect(
      await prisma.councilSpeakRequest.count({
        where: { councilId: id, status: 'PENDING' },
      }),
    ).toBe(4);
    await service.end(as('owner3'), id);
  });

  it('race: concurrent direct promotions with two seats left → exactly two succeed', async () => {
    const id = await newCouncil('owner3');
    for (let i = 0; i < 9; i++) {
      await service.join(as(`l${i}`), id, {});
      await service.memberAction(as('owner3'), id, users[`l${i}`], 'promote');
    }
    const candidates = Array.from({ length: 6 }, (_, k) => `l${9 + k}`);
    for (const c of candidates) await service.join(as(c), id, {});
    const results = await Promise.allSettled(
      candidates.map((c) =>
        service.memberAction(as('owner3'), id, users[c], 'promote'),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
    expect(await seated(id)).toBe(12);
    const seats = await prisma.councilMember.findMany({
      where: { councilId: id, seatIndex: { not: null } },
      select: { seatIndex: true },
    });
    expect(new Set(seats.map((s) => s.seatIndex)).size).toBe(12);
    await service.end(as('owner3'), id);
  });

  // 11 + 12
  it('host and moderator permissions are enforced on the server', async () => {
    const id = await newCouncil('owner4', { modCanRemove: false });
    for (const n of ['mod', 'mod2', 'speaker', 'listener']) {
      await service.join(as(n), id, {});
    }
    // Listener cannot moderate
    expect(
      await apiError(() =>
        service.memberAction(as('listener'), id, users.speaker, 'promote'),
      ),
    ).toMatchObject({ status: 403 });

    await service.memberAction(as('owner4'), id, users.mod, 'make_moderator');
    await service.memberAction(as('owner4'), id, users.mod2, 'make_moderator');

    // Moderator defaults: manage requests + mute yes; remove/ban no.
    const req = await service.requestToSpeak(as('speaker'), id);
    const modView = await service.getState(as('mod'), id);
    expect(modView.me.permissions).toMatchObject({
      isModerator: true,
      canManageRequests: true,
      canRemove: false,
      canBan: false,
      canEnd: false,
    });
    expect(modView.pendingRequests.map((r) => r.id)).toContain(req.requestId);
    await service.decideRequest(as('mod'), id, req.requestId, true);
    await service.memberAction(as('mod'), id, users.speaker, 'mute');
    expect(
      await apiError(() =>
        service.memberAction(as('mod'), id, users.speaker, 'kick'),
      ),
    ).toMatchObject({ status: 403 });
    expect(
      await apiError(() =>
        service.memberAction(as('mod'), id, users.listener, 'ban'),
      ),
    ).toMatchObject({ status: 403 });
    // Never against the owner or another moderator; no owner-only powers.
    expect(
      await apiError(() =>
        service.memberAction(as('mod'), id, users.owner4, 'mute'),
      ),
    ).toMatchObject({ status: 403 });
    expect(
      await apiError(() =>
        service.memberAction(as('mod'), id, users.mod2, 'mute'),
      ),
    ).toMatchObject({ status: 403 });
    expect(
      await apiError(() =>
        service.memberAction(as('mod'), id, users.listener, 'make_moderator'),
      ),
    ).toMatchObject({ status: 403 });
    expect(await apiError(() => service.end(as('mod'), id))).toMatchObject({
      status: 403,
    });
    expect(
      await apiError(() => service.update(as('mod'), id, { name: 'x y' })),
    ).toMatchObject({
      status: 403,
    });

    // The host grants ban power → the moderator can now ban.
    await service.update(as('owner4'), id, {
      modCanBan: true,
      rules: ['قاعدة'],
    });
    await service.memberAction(as('mod'), id, users.listener, 'ban');
    expect(
      emits.some(
        (e) =>
          e.to === `user:${users.listener}` && e.event === 'council:kicked',
      ),
    ).toBe(true);

    // Moderators can also speak (seat) and keep the role.
    await service.memberAction(as('owner4'), id, users.mod, 'promote');
    const m = await prisma.councilMember.findFirstOrThrow({
      where: { councilId: id, userId: users.mod },
    });
    expect(m).toMatchObject({ role: 'MODERATOR' });
    expect(m.seatIndex).not.toBeNull();
    await service.memberAction(as('owner4'), id, users.mod, 'remove_moderator');
    expect(
      (
        await prisma.councilMember.findFirstOrThrow({
          where: { councilId: id, userId: users.mod },
        })
      ).role,
    ).toBe('SPEAKER');
    await service.end(as('owner4'), id);
  });

  // 16
  it('mute: a muted speaker gets no publish token and cannot unmute until the host lifts it', async () => {
    const id = await newCouncil('owner4');
    await service.join(as('speaker'), id, {});
    await service.memberAction(as('owner4'), id, users.speaker, 'promote');
    await service.setMic(as('speaker'), id, false);
    expect(emits.some((e) => e.event === 'council:mic')).toBe(true);

    await service.memberAction(as('owner4'), id, users.speaker, 'mute');
    expect((await service.token(as('speaker'), id)).role).toBe('subscriber');
    expect(
      await apiError(() => service.setMic(as('speaker'), id, false)),
    ).toMatchObject({
      status: 403,
      error: 'muted_by_moderator',
    });
    await service.setMic(as('speaker'), id, true); // muting self is always allowed

    await service.memberAction(as('owner4'), id, users.speaker, 'unmute');
    expect((await service.token(as('speaker'), id)).role).toBe('publisher');
    expect(await service.setMic(as('speaker'), id, false)).toEqual({
      micMuted: false,
    });
    await service.end(as('owner4'), id);
  });

  // 14 + 15
  it('ban and remove: kicked users wait, banned users stay out until unbanned', async () => {
    const id = await newCouncil('owner4');
    await service.join(as('speaker'), id, {});
    await service.memberAction(as('owner4'), id, users.speaker, 'promote');
    await service.join(as('listener'), id, {});

    await service.memberAction(as('owner4'), id, users.speaker, 'kick');
    expect(await seated(id)).toBe(1);
    expect(
      await apiError(() => service.join(as('speaker'), id, {})),
    ).toMatchObject({
      status: 403,
      error: 'council_kicked',
    });
    expect(
      await apiError(() => service.token(as('speaker'), id)),
    ).toMatchObject({
      status: 403,
      error: 'council_kicked',
    });

    await service.memberAction(as('owner4'), id, users.listener, 'ban');
    for (const fn of [
      () => service.join(as('listener'), id, {}),
      () => service.token(as('listener'), id),
      () => service.requestToSpeak(as('listener'), id),
    ]) {
      expect(await apiError(fn)).toMatchObject({
        status: 403,
        error: 'council_banned',
      });
    }
    const view = await service.getState(as('listener'), id);
    expect(view.me).toMatchObject({ banned: true, joined: false });
    const banned = await service.banned(as('owner4'), id);
    expect(banned.banned.map((b) => b.user.id)).toContain(users.listener);

    await service.memberAction(as('owner4'), id, users.listener, 'unban');
    const back = await service.join(as('listener'), id, {});
    expect(back.state.me.role).toBe('LISTENER');
    await service.end(as('owner4'), id);
  });

  // 17
  it('ending a council clears the stage, cancels requests and blocks joins', async () => {
    const id = await newCouncil('owner4');
    const req = await listenerWithRequest(id, 'listener');
    expect(await apiError(() => service.end(as('listener'), id))).toMatchObject(
      { status: 403 },
    );
    const ended = await service.end(as('owner4'), id);
    expect(ended.ended).toBe(true);
    expect(
      emits.some(
        (e) => e.to === `council:${id}` && e.event === 'council:ended',
      ),
    ).toBe(true);
    expect(await seated(id)).toBe(0);
    expect(
      (
        await prisma.councilSpeakRequest.findUniqueOrThrow({
          where: { id: req },
        })
      ).status,
    ).toBe('CANCELLED');
    expect(
      await apiError(() => service.join(as('outsider'), id, {})),
    ).toMatchObject({
      status: 410,
      error: 'council_ended',
    });
    expect(
      await apiError(() => service.token(as('listener'), id)),
    ).toMatchObject({ status: 410 });
    expect((await service.getState(as('listener'), id)).council.status).toBe(
      'ENDED',
    );
    // Idempotent
    expect((await service.end(as('owner4'), id)).ended).toBe(true);
  });

  // 18
  it('disconnected users: stale speakers lose their seat, present ones and the owner keep it; absent hosts end the council', async () => {
    const id = await newCouncil('owner4');
    for (const n of ['speaker', 'mod']) {
      await service.join(as(n), id, {});
      await service.memberAction(as('owner4'), id, users[n], 'promote');
    }
    await prisma.$executeRaw`UPDATE "CouncilMember" SET "updatedAt" = (now() AT TIME ZONE 'UTC') - interval '5 minutes' WHERE "councilId" = ${id}`;
    await presence.touch(id, users.mod); // still connected
    // speaker + owner have no heartbeat
    const freed = await service.sweepStaleSpeakers(id);
    expect(freed).toBe(1);
    const speakers = (await service.getState(as('owner4'), id)).speakers.map(
      (s) => s.userId,
    );
    expect(speakers).toEqual(expect.arrayContaining([users.owner4, users.mod]));
    expect(speakers).not.toContain(users.speaker);
    expect(
      emits.some(
        (e) => e.to === `user:${users.speaker}` && e.event === 'council:role',
      ),
    ).toBe(true);

    // Listener count = present users not on stage.
    await presence.touch(id, users.listener);
    await presence.touch(id, users.outsider);
    const s = await service.getState(as('owner4'), id);
    expect(s.listenerCount).toBe(2);

    await prisma.$executeRaw`UPDATE "Council" SET "hostLastSeenAt" = (now() AT TIME ZONE 'UTC') - interval '31 minutes' WHERE id = ${id}`;
    const after = await service.getState(as('speaker'), id);
    expect(after.council.status).toBe('ENDED');
  });

  // 3 + 20
  it('private councils never leak: 404 for outsiders, access via invite or invite code', async () => {
    const created = await service
      .create(as('owner'), {
        name: `${tag} مجلس خاص`,
        visibility: 'PRIVATE',
      })
      .catch(async () => {
        // `owner` already has a live public council from the first test.
        const mine = await service.accessible(as('owner'));
        await service.end(as('owner'), mine.mine!.id);
        return service.create(as('owner'), {
          name: `${tag} مجلس خاص`,
          visibility: 'PRIVATE',
        });
      });
    const id = created.state.council.id;
    const code = created.state.council.inviteCode!;
    expect(code).toMatch(/^[A-Za-z0-9]{12}$/);

    const pub = await service.list(as('outsider'));
    expect(pub.councils.map((c) => c.id)).not.toContain(id);
    expect((await service.accessible(as('outsider'))).private).toHaveLength(0);
    for (const fn of [
      () => service.getState(as('outsider'), id),
      () => service.join(as('outsider'), id, {}),
      () => service.token(as('outsider'), id),
      () => service.requestToSpeak(as('outsider'), id),
      () => service.getState(as('outsider'), id, 'WRONGCODE123'),
    ]) {
      expect(await apiError(fn)).toMatchObject({
        status: 404,
        error: 'not_found',
      });
    }

    // Invited user
    expect(
      await service.invite(as('owner'), id, [users.invited, users.owner]),
    ).toEqual({ invited: 1 });
    expect(notifyUsers).toHaveBeenCalledWith(
      [users.invited],
      expect.objectContaining({
        type: 'system',
        data: { kind: 'council_invite', councilId: id },
      }),
    );
    expect(
      (await service.accessible(as('invited'))).private.map((c) => c.id),
    ).toContain(id);
    const invitedView = await service.getState(as('invited'), id);
    expect(invitedView.council).not.toHaveProperty('inviteCode');
    await service.join(as('invited'), id, {});

    // Invite link code
    expect(await service.resolveInvite(as('coder'), code)).toEqual({
      councilId: id,
      code,
    });
    const viaCode = await service.join(as('coder'), id, { code });
    expect(viaCode.state.me.role).toBe('LISTENER');
    // Membership persists access without the code.
    expect((await service.getState(as('coder'), id)).council.id).toBe(id);

    // Rotating the code invalidates the old link for new users.
    await service.rotateInvite(as('owner'), id);
    expect(
      await apiError(() => service.join(as('outsider'), id, { code })),
    ).toMatchObject({
      status: 404,
    });
    await service.end(as('owner'), id);
  });
});
