import { OfficialServicesService } from './official-services.service';

describe('OfficialServicesService MEWA account', () => {
  const user = {
    id: 'mewa-id',
    username: 'mewa',
    arabicName: 'وزارة البيئة والمياه والزراعة',
    displayName: 'Ministry of Environment, Water and Agriculture',
    bio: 'الحساب الرسمي للوزارة في منصة سرح',
    about: 'وصف الوزارة',
    avatar: '/uploads/mewa/avatar.jpg',
    coverImage: '/uploads/mewa/cover.jpg',
    website: 'https://www.mewa.gov.sa',
    publicPhone: '939',
    publicEmail: 'E-Services@mewa.gov.sa',
    verified: true,
    isActive: true,
    allowPrivateMessages: false,
    emailVerified: true,
    isAI: false,
    passwordHash: '$2a$12$fakehash',
  };

  function makeService(repo: Record<string, unknown>) {
    return new OfficialServicesService(
      repo as never,
      { del: jest.fn(), delPattern: jest.fn() } as never,
    );
  }

  it('returns the existing verified MEWA user with follow and service counts', async () => {
    const repo = {
      findMewaUser: jest.fn().mockResolvedValue(user),
      countFollowers: jest.fn().mockResolvedValue(12),
      countActive: jest.fn().mockResolvedValue(6),
      findFollow: jest.fn().mockResolvedValue({ id: 'f1' }),
    };
    const service = makeService(repo);
    jest.spyOn(service, 'ensureDefaultMediaFiles').mockReturnValue();
    const account = await service.getAccount('viewer-1');
    expect(account).toMatchObject({
      id: 'mewa-id',
      username: 'mewa',
      verified: true,
      allowPrivateMessages: false,
      followersCount: 12,
      servicesCount: 6,
      isFollowing: true,
      website: 'https://www.mewa.gov.sa',
      publicPhone: '939',
    });
    expect(repo.findFollow).toHaveBeenCalledWith('viewer-1', 'mewa-id');
  });

  it('does not look up follow state for anonymous viewers', async () => {
    const repo = {
      findMewaUser: jest.fn().mockResolvedValue(user),
      countFollowers: jest.fn().mockResolvedValue(0),
      countActive: jest.fn().mockResolvedValue(3),
      findFollow: jest.fn(),
    };
    const service = makeService(repo);
    jest.spyOn(service, 'ensureDefaultMediaFiles').mockReturnValue();
    const account = await service.getAccount();
    expect(account.isFollowing).toBe(false);
    expect(repo.findFollow).not.toHaveBeenCalled();
  });
});
