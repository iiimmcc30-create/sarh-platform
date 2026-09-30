/**
 * Regression: voice notes / images / videos "disappeared" after leaving the
 * chat and coming back. Root cause: REST sends were always upserted into the
 * pair's 'direct' thread, while the chat (opened from an inbox row or the
 * peer lookup) showed — and on return reloaded — a legacy scoped thread.
 * Uses an in-memory repository and the real MessageMediaService (only the
 * Cloudinary SDK boundary is stubbed) so send → reload goes through the
 * same presentation code as production.
 */
const mockSign = jest.fn(
  (ref: { publicId: string; resourceType: string }) =>
    `https://res.cloudinary.com/sarh/${ref.resourceType}/authenticated/s--SIGNED1--/${ref.publicId}`,
);

jest.mock('@/lib/storage', () => ({
  getStorageProvider: () => 'cloudinary',
  getCloudinaryCloudName: () => 'sarh',
  getCloudinaryBaseFolder: () => 'safat',
  inspectCloudinaryAsset: jest.fn(() =>
    Promise.resolve({ bytes: 1000, version: '17', format: undefined }),
  ),
  destroyCloudinaryAsset: jest.fn(),
  signedCloudinaryDeliveryUrl: (ref: {
    publicId: string;
    resourceType: string;
  }) => mockSign(ref),
  isOurUploadUrl: () => false,
  localUploadSizeBytes: () => null,
  s3KeyFromUrl: () => null,
  s3ObjectSizeBytes: jest.fn(),
  deleteS3Object: jest.fn(),
}));

import { MessagesService } from './messages.service';
import { MessageMediaService } from './services/message-media.service';
import { ApiException } from '../common/exceptions/api.exception';
import type { JwtPayload } from '../common/types/jwt-payload.interface';

const ALICE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BOB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const LEGACY = '11111111-1111-4111-8111-111111111111';
const alice: JwtPayload = { userId: ALICE, username: 'alice', role: 'USER' };

const VOICE_UPLOAD = `https://res.cloudinary.com/sarh/video/authenticated/s--abcdef12--/v17/safat/messages/${ALICE}/voice1.m4a`;
const IMAGE_UPLOAD = `https://res.cloudinary.com/sarh/image/authenticated/s--abcdef12--/v17/safat/messages/${ALICE}/photo1.jpg`;
const LEGACY_IMAGE =
  'https://res.cloudinary.com/sarh/image/upload/v16/safat/messages/old.jpg';
const LEGACY_VIDEO =
  'https://res.cloudinary.com/sarh/video/upload/v16/safat/messages/old.mp4';

type Row = Record<string, unknown> & {
  id: string;
  threadId: string;
  createdAt: Date;
};

function makeRepo() {
  const [p1, p2] = [ALICE, BOB].sort();
  const threads = [
    // Pre-pair conversation (listing-scoped) — the only one this pair has.
    {
      id: LEGACY,
      participant1: p1,
      participant2: p2,
      type: 'DIRECT',
      scopeKey: 'listing:42',
      lastMessageAt: new Date(0),
    },
  ];
  const messages: Row[] = [
    {
      id: 'old-img',
      threadId: LEGACY,
      senderId: BOB,
      receiverId: ALICE,
      text: 'صورة قديمة',
      imageUrl: LEGACY_IMAGE,
      videoUrl: null,
      audioUrl: null,
      type: 'IMAGE',
      mediaDurationMs: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      isRead: true,
    },
    {
      id: 'old-vid',
      threadId: LEGACY,
      senderId: BOB,
      receiverId: ALICE,
      text: null,
      imageUrl: null,
      videoUrl: LEGACY_VIDEO,
      audioUrl: null,
      type: 'VIDEO',
      mediaDurationMs: null,
      createdAt: new Date('2026-01-01T00:01:00Z'),
      isRead: true,
    },
  ];
  let seq = 0;
  const sender = {
    id: ALICE,
    displayName: 'Alice',
    arabicName: 'أليس',
    avatar: null,
  };
  const repo = {
    threads,
    messages,
    upsertThread: jest.fn(
      async (p: {
        participant1: string;
        participant2: string;
        type: string;
      }) => {
        let t = threads.find(
          (x) =>
            x.participant1 === p.participant1 &&
            x.participant2 === p.participant2 &&
            x.scopeKey === 'direct',
        );
        if (!t) {
          t = {
            id: `direct-${threads.length}`,
            ...p,
            scopeKey: 'direct',
            lastMessageAt: new Date(),
          };
          threads.push(t);
        }
        return t;
      },
    ),
    findThreadsForPair: jest.fn(async (a: string, b: string) => {
      const [x, y] = [a, b].sort();
      return threads
        .filter((t) => t.participant1 === x && t.participant2 === y)
        .sort((m, n) => n.lastMessageAt.getTime() - m.lastMessageAt.getTime());
    }),
    findThreadForUser: jest.fn(
      async (id: string, userId: string) =>
        threads.find(
          (t) =>
            t.id === id &&
            (t.participant1 === userId || t.participant2 === userId),
        ) ?? null,
    ),
    touchThread: jest.fn(async (id: string) => {
      const t = threads.find((x) => x.id === id);
      if (t) t.lastMessageAt = new Date();
      return t;
    }),
    createMessage: jest.fn(async (data: Record<string, unknown>) => {
      seq += 1;
      const row: Row = {
        id: `m${seq}`,
        text: null,
        imageUrl: null,
        videoUrl: null,
        audioUrl: null,
        mediaDurationMs: null,
        isRead: false,
        ...data,
        threadId: data.threadId as string,
        createdAt: new Date(Date.now() + seq),
      };
      messages.push(row);
      return { ...row, sender };
    }),
    clearHiddenForThread: jest.fn(async () => ({ count: 0 })),
    findMessages: jest.fn(async (threadId: string, take: number) =>
      messages
        .filter((m) => m.threadId === threadId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, take)
        .map((m) => ({ ...m, sender })),
    ),
    markThreadRead: jest.fn(async () => ({ count: 0 })),
  };
  return repo;
}

function makeService(repo: ReturnType<typeof makeRepo>) {
  return new MessagesService(
    repo as never,
    { info: jest.fn(), warn: jest.fn() } as never,
    { notifyUser: jest.fn() } as never,
    {
      assertCanSendMessage: jest.fn().mockResolvedValue(undefined),
      isThreadMuted: jest.fn().mockResolvedValue(false),
    } as never,
    { emitToThread: jest.fn(), emitToUser: jest.fn() } as never,
    new MessageMediaService({ warn: jest.fn(), info: jest.fn() } as never),
  );
}

describe('leave → return keeps voice notes and attachments', () => {
  it('reloading the opened (legacy) thread returns the voice + image just sent, and old media', async () => {
    const repo = makeRepo();
    const service = makeService(repo);

    // Chat opened from the inbox on the legacy thread; the app sends its id.
    await service.sendMessage(alice, {
      receiverId: BOB,
      threadId: LEGACY,
      messageType: 'VOICE',
      audioUrl: VOICE_UPLOAD,
      durationMs: 4200,
    });
    await service.sendMessage(alice, {
      receiverId: BOB,
      threadId: LEGACY,
      imageUrl: IMAGE_UPLOAD,
    });

    // Leave, come back: the screen reloads the same thread from REST.
    const { messages } = await service.getThreadMessages(alice, LEGACY, {});
    expect(messages.map((m) => m.id)).toEqual([
      'old-img',
      'old-vid',
      'm1',
      'm2',
    ]);
    const [oldImg, oldVid, voice, image] = messages as unknown as Record<
      string,
      unknown
    >[];
    expect(voice).toMatchObject({ type: 'VOICE', mediaDurationMs: 4200 });
    expect(voice.audioUrl).toContain('/video/authenticated/s--SIGNED1--/');
    expect(image).toMatchObject({ type: 'IMAGE' });
    expect(image.imageUrl).toContain('/image/authenticated/s--SIGNED1--/');
    // Legacy public media is returned unchanged.
    expect(oldImg.imageUrl).toBe(LEGACY_IMAGE);
    expect(oldVid.videoUrl).toBe(LEGACY_VIDEO);
    // Stored canonical (unsigned) — signatures are only added on read.
    expect(repo.messages.find((m) => m.id === 'm1')?.audioUrl).toBe(
      `https://res.cloudinary.com/sarh/video/authenticated/v17/safat/messages/${ALICE}/voice1.m4a`,
    );
    expect(repo.upsertThread).not.toHaveBeenCalled();
    expect(repo.threads).toHaveLength(1);
  });

  it('without a threadId (direct entry) sends go to the conversation the peer lookup returns', async () => {
    const repo = makeRepo();
    const service = makeService(repo);
    const peer = await (async () => {
      (
        repo as unknown as { findActiveParticipant: jest.Mock }
      ).findActiveParticipant = jest
        .fn()
        .mockResolvedValue({ id: BOB, verified: false });
      return service.getPeerConversation(alice, BOB);
    })();
    expect(peer.threadId).toBe(LEGACY);

    const sent = await service.sendMessage(alice, {
      receiverId: BOB,
      messageType: 'VOICE',
      audioUrl: VOICE_UPLOAD,
      durationMs: 3000,
    });
    expect(sent.threadId).toBe(LEGACY);
    const { messages } = await service.getThreadMessages(
      alice,
      peer.threadId as string,
      {},
    );
    expect(messages.some((m) => m.id === sent.message.id)).toBe(true);
    expect(repo.upsertThread).not.toHaveBeenCalled();
  });

  it('a brand-new pair still gets the single direct thread', async () => {
    const repo = makeRepo();
    repo.threads.length = 0;
    const service = makeService(repo);
    const first = await service.sendMessage(alice, {
      receiverId: BOB,
      text: 'مرحبا',
    });
    const second = await service.sendMessage(alice, {
      receiverId: BOB,
      imageUrl: IMAGE_UPLOAD,
    });
    expect(first.threadId).toBe(second.threadId);
    expect(repo.upsertThread).toHaveBeenCalledTimes(1);
    const { messages } = await service.getThreadMessages(
      alice,
      first.threadId,
      {},
    );
    expect(messages.map((m) => m.id)).toEqual([
      first.message.id,
      second.message.id,
    ]);
  });

  it('rejects a threadId the sender is not part of, or with another receiver', async () => {
    const repo = makeRepo();
    const service = makeService(repo);
    await expect(
      service.sendMessage(
        {
          userId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          username: 'c',
          role: 'USER',
        },
        { receiverId: BOB, threadId: LEGACY, text: 'x' },
      ),
    ).rejects.toBeInstanceOf(ApiException);
    await expect(
      service.sendMessage(alice, {
        receiverId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        threadId: LEGACY,
        text: 'x',
      }),
    ).rejects.toBeInstanceOf(ApiException);
    expect(repo.createMessage).not.toHaveBeenCalled();
  });
});
