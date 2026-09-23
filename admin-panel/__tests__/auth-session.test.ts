/**
 * @jest-environment jsdom
 */

const mockGet = jest.fn();
const mockPost = jest.fn();

jest.mock('@/services/api.client', () => {
  const actual = jest.requireActual('@/services/api.client');
  return {
    ...actual,
    apiClient: {
      get: (...args: unknown[]) => mockGet(...args),
      post: (...args: unknown[]) => mockPost(...args),
    },
  };
});

import {
  clearSession,
  getStoredUser,
  persistSession,
  setSessionCookie,
  tryRestoreSession,
  type AdminUser,
  type LoginResult,
} from '@/services/auth.service';

const user: AdminUser = {
  id: 'u1',
  username: 'admin',
  email: 'a@example.com',
  displayName: 'Admin',
  arabicName: 'مسؤول',
  avatar: null,
  role: 'ADMIN',
};

const session: LoginResult = {
  user,
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
};

describe('admin auth session', () => {
  beforeEach(() => {
    localStorage.clear();
    document.cookie.split(';').forEach((c) => {
      const name = c.split('=')[0]?.trim();
      if (name) document.cookie = `${name}=; path=/; max-age=0`;
    });
    mockGet.mockReset();
    mockPost.mockReset();
  });

  it('persistSession stores tokens, user, and cookie', () => {
    persistSession(session);
    expect(localStorage.getItem('admin_access_token')).toBe('access-token');
    expect(localStorage.getItem('admin_refresh_token')).toBe('refresh-token');
    expect(getStoredUser()?.arabicName).toBe('مسؤول');
    expect(document.cookie).toContain('admin_token=');
  });

  it('clearSession removes storage and cookie', () => {
    persistSession(session);
    clearSession();
    expect(localStorage.getItem('admin_access_token')).toBeNull();
    expect(getStoredUser()).toBeNull();
  });

  it('getStoredUser returns null for corrupt JSON', () => {
    localStorage.setItem('admin_user', '{not-json');
    expect(getStoredUser()).toBeNull();
  });

  it('setSessionCookie writes encoded token', () => {
    setSessionCookie('tok+1');
    expect(document.cookie).toContain('admin_token=');
  });

  it('tryRestoreSession returns none without token', async () => {
    await expect(tryRestoreSession()).resolves.toBe('none');
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('tryRestoreSession restores when adminMe succeeds', async () => {
    localStorage.setItem('admin_access_token', 'access-token');
    mockGet.mockResolvedValueOnce({
      data: { success: true, data: { user } },
    });
    await expect(tryRestoreSession()).resolves.toBe('restored');
    expect(getStoredUser()?.id).toBe('u1');
    expect(mockGet).toHaveBeenCalledWith('/admin/auth/me');
  });

  it('tryRestoreSession clears broken session when adminMe fails', async () => {
    localStorage.setItem('admin_access_token', 'bad');
    localStorage.setItem('admin_user', JSON.stringify(user));
    mockGet.mockRejectedValueOnce(new Error('401'));
    await expect(tryRestoreSession()).resolves.toBe('cleared');
    expect(getStoredUser()).toBeNull();
  });
});
