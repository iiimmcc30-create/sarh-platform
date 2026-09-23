import { MessagingPolicyService } from './messaging-policy.service';
import { ApiException } from '../../common/exceptions/api.exception';

describe('MessagingPolicyService', () => {
  const repo = {
    findBlock: jest.fn(),
    findUserById: jest.fn(),
    findFollow: jest.fn(),
    findButcherById: jest.fn(),
    findButcherByUserId: jest.fn(),
    findAcceptedButcherOrderForChat: jest.fn(),
  };

  let policy: MessagingPolicyService;

  beforeEach(() => {
    jest.clearAllMocks();
    repo.findBlock.mockResolvedValue(null);
    repo.findButcherByUserId.mockResolvedValue(null);
    policy = new MessagingPolicyService(repo as never);
  });

  it('blocks send when either party blocked the other', async () => {
    repo.findBlock.mockImplementation(async (a: string, b: string) =>
      a === 'victim' && b === 'blocked' ? { id: 'blk' } : null,
    );

    await expect(
      policy.assertCanSendMessage({
        senderId: 'blocked',
        receiverId: 'victim',
        type: 'DIRECT',
      }),
    ).rejects.toMatchObject({ status: 403, error: 'blocked' });
  });

  it('blocks send when sender blocked the receiver', async () => {
    repo.findBlock.mockImplementation(async (a: string, b: string) =>
      a === 'alice' && b === 'bob' ? { id: 'blk' } : null,
    );

    await expect(
      policy.assertNotBlocked('alice', 'bob'),
    ).rejects.toBeInstanceOf(ApiException);
  });

  it('enforces privateMessagesAudience=following', async () => {
    repo.findUserById.mockResolvedValue({
      id: 'recv',
      allowPrivateMessages: true,
      privateMessagesAudience: 'following',
    });
    repo.findFollow.mockResolvedValue(null);

    await expect(
      policy.assertCanSendMessage({
        senderId: 'stranger',
        receiverId: 'recv',
        type: 'DIRECT',
      }),
    ).rejects.toMatchObject({ error: 'messages_restricted' });
  });

  it('allows direct message when not blocked and audience is everyone', async () => {
    repo.findUserById.mockResolvedValue({
      id: 'recv',
      allowPrivateMessages: true,
      privateMessagesAudience: 'everyone',
    });

    await expect(
      policy.assertCanSendMessage({
        senderId: 'alice',
        receiverId: 'recv',
        type: 'DIRECT',
      }),
    ).resolves.toBeUndefined();
  });

  it('forbids customer creating/sending a BUTCHER thread', async () => {
    await expect(
      policy.assertCanSendMessage({
        senderId: 'customer',
        receiverId: 'butcher-user',
        type: 'BUTCHER',
        butcherId: 'shop-1',
      }),
    ).rejects.toMatchObject({ status: 403, error: 'forbidden' });
  });

  it('forbids butcher creating/sending a BUTCHER thread to a customer', async () => {
    await expect(
      policy.assertCanSendMessage({
        senderId: 'butcher-user',
        receiverId: 'customer',
        type: 'BUTCHER',
        butcherId: 'shop-1',
      }),
    ).rejects.toMatchObject({ status: 403, error: 'forbidden' });
  });

  it('forbids send on an existing Customer↔Butcher thread (customer)', async () => {
    await expect(
      policy.assertCanSendMessage({
        senderId: 'customer',
        receiverId: 'butcher-user',
        type: 'BUTCHER',
        butcherId: 'shop-1',
      }),
    ).rejects.toMatchObject({ status: 403, error: 'forbidden' });
  });

  it('forbids send on an existing Customer↔Butcher thread (butcher)', async () => {
    await expect(
      policy.assertCanSendMessage({
        senderId: 'butcher-user',
        receiverId: 'customer',
        type: 'BUTCHER',
        butcherId: 'shop-1',
      }),
    ).rejects.toMatchObject({ status: 403, error: 'forbidden' });
  });

  it('forbids DIRECT send when exactly one participant owns a butcher shop', async () => {
    repo.findButcherByUserId.mockImplementation(async (userId: string) =>
      userId === 'butcher-user' ? { id: 'shop-1', userId } : null,
    );

    await expect(
      policy.assertCanSendMessage({
        senderId: 'customer',
        receiverId: 'butcher-user',
        type: 'DIRECT',
      }),
    ).rejects.toMatchObject({ status: 403, error: 'forbidden' });
  });

  it('allows DIRECT send between two shop owners', async () => {
    repo.findButcherByUserId.mockResolvedValue({ id: 'shop', userId: 'x' });
    repo.findUserById.mockResolvedValue({
      id: 'other-owner',
      allowPrivateMessages: true,
      privateMessagesAudience: 'everyone',
    });

    await expect(
      policy.assertCanSendMessage({
        senderId: 'owner-a',
        receiverId: 'owner-b',
        type: 'DIRECT',
      }),
    ).resolves.toBeUndefined();
  });
});
