import { apiClient } from '@/services/api.client';
import { platformLogin } from '@/services/auth.service';

jest.mock('@/services/api.client', () => ({
  apiClient: { post: jest.fn() },
  unwrap: (res: { data: { success: boolean; data: unknown } }) => res.data.data,
  ACCESS_TOKEN_KEY: 'butcher_access_token',
  REFRESH_TOKEN_KEY: 'butcher_refresh_token',
  USER_KEY: 'butcher_user',
  BUTCHER_KEY: 'butcher_profile',
  SESSION_COOKIE: 'butcher_token',
  getApiErrorMessage: () => 'x',
  isNoButcherProfileError: () => false,
}));

describe('platformLogin identifier', () => {
  it('sends Saudi 05 numbers as +966 to POST /auth/login', async () => {
    (apiClient.post as jest.Mock).mockResolvedValue({
      data: {
        success: true,
        data: { user: { id: 'u1' }, accessToken: 'a', refreshToken: 'r' },
      },
    });
    await platformLogin('0512345678', 'secret12');
    expect(apiClient.post).toHaveBeenCalledWith('/auth/login', {
      login: '+966512345678',
      password: 'secret12',
    });
  });
});
