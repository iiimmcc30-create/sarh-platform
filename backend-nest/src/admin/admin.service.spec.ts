import { AdminService } from './admin.service';
import { ApiException } from '../common/exceptions/api.exception';
import type { JwtPayload } from '../common/types/jwt-payload.interface';

function actor(role: JwtPayload['role'], userId = 'staff-1'): JwtPayload {
  return { userId, username: userId, role };
}

describe('AdminService.updateUser role authorization', () => {
  const repo = {
    updateUser: jest.fn().mockResolvedValue({ id: 'user-1', role: 'USER' }),
  };

  let service: AdminService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AdminService(
      repo as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { del: jest.fn(), delPattern: jest.fn() } as never,
    );
  });

  it('rejects MODERATOR changing role to ADMIN', async () => {
    await expect(
      service.updateUser('user-1', { role: 'ADMIN' }, actor('MODERATOR')),
    ).rejects.toMatchObject({
      status: 403,
      error: 'forbidden',
    } satisfies Partial<ApiException>);
    expect(repo.updateUser).not.toHaveBeenCalled();
  });

  it('rejects MODERATOR changing role to USER', async () => {
    await expect(
      service.updateUser('user-1', { role: 'USER' }, actor('MODERATOR')),
    ).rejects.toBeInstanceOf(ApiException);
    expect(repo.updateUser).not.toHaveBeenCalled();
  });

  it('allows ADMIN to change role', async () => {
    await service.updateUser('user-1', { role: 'MODERATOR' }, actor('ADMIN'));
    expect(repo.updateUser).toHaveBeenCalledWith('user-1', {
      role: 'MODERATOR',
    });
  });

  it('allows MODERATOR to toggle verified without touching role', async () => {
    await service.updateUser('user-1', { verified: true }, actor('MODERATOR'));
    expect(repo.updateUser).toHaveBeenCalledWith('user-1', { verified: true });
  });
});
