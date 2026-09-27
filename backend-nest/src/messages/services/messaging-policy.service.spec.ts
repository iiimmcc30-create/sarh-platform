import { MessagingPolicyService } from './messaging-policy.service';
import { ApiException } from '../../common/exceptions/api.exception';

describe('MessagingPolicyService', () => {
  const repo = {
    findBlock: jest.fn(),
    findUserById: jest.fn(),
    findFollow: jest.fn(),
  };

  let policy: MessagingPolicyService;

  beforeEach(() => {
    jest.clearAllMocks();
    repo.findBlock.mockResolvedValue(null);
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
      }),
    ).resolves.toBeUndefined();
  });
});
