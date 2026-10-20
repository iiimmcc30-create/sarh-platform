import { PrismaClient } from '@prisma/client';
import { CouncilsService } from './councils.service';
import { AdminCouncilsService } from './admin-councils.service';
import { CouncilPresenceService } from './services/council-presence.service';
import { CouncilRealtimeService } from './services/council-realtime.service';
import { CouncilAgoraModerationService } from './services/council-agora-moderation.service';
import { RedisCacheService } from '../redis/services/redis-cache.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { JwtPayload } from '../common/types/jwt-payload.interface';

/**
 * Real-Postgres suite for private councils (join code, code requests) and the golden
 * tier (verified-seller camera/gallery, admin toggle, force-close). Run with:
 *   COUNCILS_TEST_DATABASE_URL=postgresql://... npx jest councils-golden.integration
 */
jest.mock('../shared/lib/storage', () => ({
  ...jest.requireActual('../shared/lib/storage'),
  isOurUploadUrl: () => true,
}));
jest.mock('../shared/lib/media-ownership', () => ({
  assertUserMediaUrls: jest.fn().mockResolvedValue(undefined),
}));

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

function grants(token: string) {
  const payload = JSON.parse(
    Buffer.from(token.split('.')[1], 'base64url').toString(),
  ) as {
    video: { canPublish: boolean; canPublishSources?: string[]; room: string };
  };
  return payload.video;
}

suite('Private councils + golden tier (real Postgres)', () => {
  let prisma: PrismaClient;
  let service: CouncilsService;
  let admin: AdminCouncilsService;
  const notifyUsers = jest.fn().mockResolvedValue(undefined);
  const tag = `g${Date.now().toString(36)}`;
  const users: Record<string, string> = {};
  const env = { ...process.env };
  const as = (name: string) =>
    ({ userId: users[name], username: name }) as unknown as JwtPayload;
  const staff = () => ({ userId: users.owner, role: 'ADMIN' }) as never;

  async function makeUser(name: string, verified = false) {
    const user = await prisma.user.create({
      data: {
        username: `${tag}_${name}`,
        passwordHash: 'x',
        displayName: name,
        arabicName: name,
        verified,
      },
    });
    users[name] = user.id;
  }

  async function open(
    owner: string,
    extra: Partial<Parameters<CouncilsService['create']>[1]> = {},
  ) {
    await prisma.council.updateMany({
      where: { ownerId: users[owner], status: 'LIVE' },
      data: { status: 'ENDED', endedAt: new Date() },
    });
    const res = await service.create(as(owner), {
      name: `${tag} ${owner}`,
      visibility: 'PUBLIC',
      ...extra,
    });
    return { id: res.state.council.id, res };
  }

  async function seat(councilId: string, name: string) {
    await service.join(as(name), councilId, {});
    const r = await service.requestToSpeak(as(name), councilId);
    await service.decideRequest(as('owner'), councilId, r.requestId, true);
  }

  beforeAll(async () => {
    process.env.REDIS_ENABLED = 'false';
    process.env.RTC_PROVIDER = 'livekit';
    process.env.LIVEKIT_URL = 'ws://127.0.0.1:1';
    process.env.LIVEKIT_API_KEY = 'devkey';
    process.env.LIVEKIT_API_SECRET = 'devsecret-devsecret-devsecret-12345';
    prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });
    const db = prisma as unknown as PrismaService;
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };
    const cache = new RedisCacheService(logger as never);
    const presence = new CouncilPresenceService(cache);
    const bridge = { toCouncil: jest.fn(), toUser: jest.fn() };
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
    admin = new AdminCouncilsService(db, service, presence, logger as never);
    await makeUser('owner', true); // verified host
    await makeUser('unverifiedHost', false);
    await makeUser('vsp', true); // verified speaker
    await makeUser('usp', false); // unverified speaker
    await makeUser('listener');
    await makeUser('asker');
    await makeUser('asker2');
  });

  afterAll(async () => {
    process.env = env;
    if (!prisma) return;
    const ids = Object.values(users);
    await prisma.council.deleteMany({ where: { ownerId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  beforeEach(() => notifyUsers.mockClear());

  describe('token grants (canPublishSources)', () => {
    it('non-golden council: host and speakers are audio-only', async () => {
      const { id, res } = await open('owner');
      expect(res.livekit).toBeTruthy();
      expect(grants(res.livekit!.token).canPublishSources).toEqual([
        'microphone',
      ]);
      expect(res.livekit!.canCamera).toBe(false);
      expect(res.livekit!.videoProfile).toBeNull();
      await seat(id, 'vsp');
      const t = await service.token(as('vsp'), id);
      expect(grants(t.token).canPublishSources).toEqual(['microphone']);
      expect(
        await apiError(() =>
          service.memberAction(as('owner'), id, users.vsp, 'allow_camera'),
        ),
      ).toMatchObject({ status: 409, error: 'golden_required' });
    });

    it('golden council: verified host gets camera+mic with the capped video profile; listeners get nothing', async () => {
      const { id } = await open('owner');
      await admin.setGolden(staff(), id, true);
      const t = await service.token(as('owner'), id);
      expect(grants(t.token).canPublishSources?.sort()).toEqual([
        'camera',
        'microphone',
      ]);
      expect(t).toMatchObject({
        canCamera: true,
        videoProfile: { maxHeight: 540, simulcast: true },
      });
      await service.join(as('listener'), id, {});
      const l = await service.token(as('listener'), id);
      expect(grants(l.token).canPublish).toBe(false);
      expect(grants(l.token).canPublishSources ?? []).toEqual([]);
    });

    it('golden council: an UNVERIFIED host stays audio-only', async () => {
      const { id } = await open('unverifiedHost');
      await admin.setGolden(staff(), id, true);
      const t = await service.token(as('unverifiedHost'), id);
      expect(grants(t.token).canPublishSources).toEqual(['microphone']);
      expect('canCamera' in t && t.canCamera).toBe(false);
      expect(
        await apiError(() =>
          service.presentImages(as('unverifiedHost'), id, [
            { imageUrl: 'https://x/y.jpg' },
          ]),
        ),
      ).toMatchObject({ status: 403, error: 'seller_not_verified' });
    });

    it('speaker camera needs host approval AND verified seller status', async () => {
      const { id } = await open('owner');
      await admin.setGolden(staff(), id, true);
      await seat(id, 'vsp');
      await seat(id, 'usp');
      // Not approved yet: audio only, even though verified.
      expect(
        grants((await service.token(as('vsp'), id)).token).canPublishSources,
      ).toEqual(['microphone']);
      // Unverified speaker cannot be approved.
      expect(
        await apiError(() =>
          service.memberAction(as('owner'), id, users.usp, 'allow_camera'),
        ),
      ).toMatchObject({ status: 409, error: 'seller_not_verified' });
      // Only the host can approve.
      expect(
        await apiError(() =>
          service.memberAction(as('vsp'), id, users.vsp, 'allow_camera'),
        ),
      ).toMatchObject({ status: 403 });
      const out = await service.memberAction(
        as('owner'),
        id,
        users.vsp,
        'allow_camera',
      );
      expect(out.member.cameraAllowed).toBe(true);
      const t = await service.token(as('vsp'), id);
      expect(grants(t.token).canPublishSources?.sort()).toEqual([
        'camera',
        'microphone',
      ]);
      // Verification revoked after approval: the next token is audio-only again.
      await prisma.user.update({
        where: { id: users.vsp },
        data: { verified: false },
      });
      expect(
        grants((await service.token(as('vsp'), id)).token).canPublishSources,
      ).toEqual(['microphone']);
      await prisma.user.update({
        where: { id: users.vsp },
        data: { verified: true },
      });
      // Demote then re-promote: approval does not survive leaving the stage.
      await service.memberAction(as('owner'), id, users.vsp, 'demote');
      await seat(id, 'vsp').catch(() => undefined);
      const again = await prisma.councilMember.findFirst({
        where: { councilId: id, userId: users.vsp },
      });
      expect(again?.cameraAllowed).toBe(false);
    });

    it('admin revoking golden strips camera approvals and the stage gallery', async () => {
      const { id } = await open('owner');
      await admin.setGolden(staff(), id, true);
      await seat(id, 'vsp');
      await service.memberAction(as('owner'), id, users.vsp, 'allow_camera');
      await admin.setGolden(staff(), id, false);
      const m = await prisma.councilMember.findFirst({
        where: { councilId: id, userId: users.vsp },
      });
      expect(m?.cameraAllowed).toBe(false);
      const t = await service.token(as('owner'), id);
      expect(grants(t.token).canPublishSources).toEqual(['microphone']);
    });
  });

  describe('code requests', () => {
    it('request -> host notified -> host sends the code; rate limited per user/council', async () => {
      const { id } = await open('owner', { visibility: 'PRIVATE' });
      expect(await service.requestCode(as('asker'), id)).toEqual({
        requested: true,
      });
      expect(notifyUsers).toHaveBeenCalledWith(
        [users.owner],
        expect.objectContaining({
          data: expect.objectContaining({
            kind: 'council_code_request',
            councilId: id,
            requesterId: users.asker,
          }),
        }),
      );
      expect(
        await apiError(() => service.requestCode(as('asker'), id)),
      ).toMatchObject({ status: 429, error: 'code_request_rate_limited' });
      const pending = await service.codeRequests(as('owner'), id);
      expect(pending.requests.map((r) => r.userId)).toEqual([users.asker]);
      expect(
        await apiError(() => service.codeRequests(as('asker'), id)),
      ).toMatchObject({ status: 403 });
      notifyUsers.mockClear();
      await service.respondCodeRequest(
        as('owner'),
        id,
        users.asker,
        'send_code',
      );
      const joinCode = (await prisma.council.findUnique({ where: { id } }))!
        .joinCode;
      expect(notifyUsers).toHaveBeenCalledWith(
        [users.asker],
        expect.objectContaining({
          data: { kind: 'council_code', councilId: id, code: joinCode },
        }),
      );
      const joined = await service.join(as('asker'), id, { code: joinCode! });
      expect(joined.state.me.role).toBe('LISTENER');
    });

    it('host can answer with a one-time invite (consumed on join) or ignore', async () => {
      const { id } = await open('owner', { visibility: 'PRIVATE' });
      await service.requestCode(as('asker2'), id);
      await service.respondCodeRequest(as('owner'), id, users.asker2, 'invite');
      expect(
        await prisma.councilInvite.count({
          where: { councilId: id, userId: users.asker2, oneTime: true },
        }),
      ).toBe(1);
      await service.join(as('asker2'), id, {});
      expect(
        await prisma.councilInvite.count({
          where: { councilId: id, userId: users.asker2 },
        }),
      ).toBe(0);
      // Leaving and coming back without code/invite is locked again.
      await service.leave(as('asker2'), id);
      await prisma.councilMember.deleteMany({
        where: { councilId: id, userId: users.asker2 },
      });
      expect(
        await apiError(() => service.join(as('asker2'), id, {})),
      ).toMatchObject({ error: 'council_code_required' });
      // Ignore: no notification to the requester, status IGNORED.
      await service.requestCode(as('listener'), id);
      notifyUsers.mockClear();
      await service.respondCodeRequest(
        as('owner'),
        id,
        users.listener,
        'ignore',
      );
      expect(notifyUsers).not.toHaveBeenCalled();
      expect(
        await apiError(() =>
          service.respondCodeRequest(as('owner'), id, users.listener, 'invite'),
        ),
      ).toMatchObject({ status: 404 });
    });

    it('code requests are for locked private councils only', async () => {
      const { id } = await open('owner');
      expect(
        await apiError(() => service.requestCode(as('asker'), id)),
      ).toMatchObject({ status: 409, error: 'not_private' });
    });

    it('5 wrong codes lock the user out (even the right code is refused during the lock)', async () => {
      const { id } = await open('owner', { visibility: 'PRIVATE' });
      const joinCode = (await prisma.council.findUnique({ where: { id } }))!
        .joinCode!;
      for (let i = 0; i < 5; i++) {
        expect(
          await apiError(() =>
            service.join(as('listener'), id, { code: 'NOPE99' }),
          ),
        ).toMatchObject({ error: 'council_code_invalid' });
      }
      expect(
        await apiError(() =>
          service.join(as('listener'), id, { code: joinCode }),
        ),
      ).toMatchObject({ status: 429, error: 'council_code_locked' });
      expect(
        (await service.join(as('asker'), id, { code: joinCode })).state.me.role,
      ).toBe('LISTENER');
    });
  });

  describe('stage gallery (golden, verified host)', () => {
    const img = (n: number) => ({ imageUrl: `https://cdn.test/u/${n}.jpg` });

    it('host presents, steps next/prev with wrap-around, and stops; everyone sees the current image', async () => {
      const { id } = await open('owner');
      await admin.setGolden(staff(), id, true);
      const shown = await service.presentImages(as('owner'), id, [
        img(1),
        img(2),
        img(3),
      ]);
      expect(shown.image).toMatchObject({
        url: 'https://cdn.test/u/1.jpg',
        gallery: { count: 3, index: 0 },
      });
      await service.join(as('listener'), id, {});
      const seen = await service.getState(as('listener'), id);
      expect('image' in seen && seen.image).toMatchObject({
        gallery: { count: 3, index: 0 },
      });
      expect(
        (await service.stepImages(as('owner'), id, 'next')).image,
      ).toMatchObject({ url: 'https://cdn.test/u/2.jpg' });
      await service.stepImages(as('owner'), id, 'next');
      expect(
        (await service.stepImages(as('owner'), id, 'next')).image,
      ).toMatchObject({ url: 'https://cdn.test/u/1.jpg' });
      expect(
        (await service.stepImages(as('owner'), id, 'prev')).image,
      ).toMatchObject({
        url: 'https://cdn.test/u/3.jpg',
        gallery: { index: 2 },
      });
      // Only the host controls the stage.
      expect(
        await apiError(() => service.stepImages(as('listener'), id, 'next')),
      ).toMatchObject({ status: 403 });
      expect(
        await apiError(() =>
          service.presentImages(as('listener'), id, [img(9)]),
        ),
      ).toMatchObject({ status: 403 });
      await service.removeImage(as('owner'), id);
      const after = await prisma.council.findUnique({ where: { id } });
      expect(after).toMatchObject({ imageUrl: null, stageImages: [] });
      expect(
        await apiError(() => service.stepImages(as('owner'), id, 'next')),
      ).toMatchObject({ error: 'no_stage_images' });
    });

    it('non-golden councils cannot present a gallery', async () => {
      const { id } = await open('owner');
      expect(
        await apiError(() => service.presentImages(as('owner'), id, [img(1)])),
      ).toMatchObject({ status: 409, error: 'golden_required' });
    });
  });

  describe('admin', () => {
    it('lists councils with filters and force-closes a live one', async () => {
      const { id } = await open('owner');
      await admin.setGolden(staff(), id, true);
      const live = await admin.list({ status: 'LIVE', golden: true });
      expect(live.councils.map((c) => c.id)).toContain(id);
      expect(await admin.forceClose(staff(), id, 'test')).toMatchObject({
        closed: true,
        alreadyEnded: false,
      });
      expect((await prisma.council.findUnique({ where: { id } }))!.status).toBe(
        'ENDED',
      );
      expect(await admin.forceClose(staff(), id)).toMatchObject({
        alreadyEnded: true,
      });
      expect(
        await apiError(() =>
          admin.setGolden(
            staff(),
            '00000000-0000-4000-8000-000000000000',
            true,
          ),
        ),
      ).toMatchObject({ status: 404 });
    });
  });
});
