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
    refreshAdminSession: () =>
      mockPost('/admin/auth/refresh').then(
        () => true,
        () => false,
      ),
  };
});

import {
  adminLogin,
  adminLogout,
  clearSession,
  getStoredUser,
  persistSession,
  tryRestoreSession,
  type AdminUser,
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

describe('admin auth session (HttpOnly cookie)', () => {
  beforeEach(() => {
    localStorage.clear();
    mockGet.mockReset();
    mockPost.mockReset();
  });

  it('persistSession stores only the profile — never tokens', () => {
    localStorage.setItem('admin_access_token', 'legacy');
    persistSession({ user });
    expect(getStoredUser()?.arabicName).toBe('مسؤول');
    expect(localStorage.getItem('admin_access_token')).toBeNull();
    expect(localStorage.getItem('admin_refresh_token')).toBeNull();
    expect(document.cookie).not.toContain('admin_token=');
  });

  it('clearSession removes the profile and legacy tokens', () => {
    persistSession({ user });
    localStorage.setItem('admin_refresh_token', 'legacy');
    clearSession();
    expect(getStoredUser()).toBeNull();
    expect(localStorage.getItem('admin_refresh_token')).toBeNull();
  });

  it('getStoredUser returns null for corrupt JSON', () => {
    localStorage.setItem('admin_user', '{not-json');
    expect(getStoredUser()).toBeNull();
  });

  it('adminLogin sends the OTP only when provided', async () => {
    mockPost.mockResolvedValue({ data: { success: true, data: { user } } });
    await adminLogin('admin', 'pw');
    expect(mockPost).toHaveBeenLastCalledWith('/admin/auth/login', {
      login: 'admin',
      password: 'pw',
    });
    await adminLogin('admin', 'pw', ' 123456 ');
    expect(mockPost).toHaveBeenLastCalledWith('/admin/auth/login', {
      login: 'admin',
      password: 'pw',
      otp: '123456',
    });
  });

  it('adminLogout calls the server and clears local state even on failure', async () => {
    persistSession({ user });
    mockPost.mockRejectedValueOnce(new Error('offline'));
    await adminLogout();
    expect(mockPost).toHaveBeenCalledWith('/admin/auth/logout');
    expect(getStoredUser()).toBeNull();
  });

  it('tryRestoreSession returns none without a stored profile', async () => {
    await expect(tryRestoreSession()).resolves.toBe('none');
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('tryRestoreSession restores when adminMe succeeds', async () => {
    persistSession({ user });
    mockGet.mockResolvedValueOnce({ data: { success: true, data: { user } } });
    await expect(tryRestoreSession()).resolves.toBe('restored');
    expect(mockGet).toHaveBeenCalledWith('/admin/auth/me');
  });

  it('tryRestoreSession refreshes the cookie once, then retries', async () => {
    persistSession({ user });
    mockGet
      .mockRejectedValueOnce(new Error('401'))
      .mockResolvedValueOnce({ data: { success: true, data: { user } } });
    mockPost.mockResolvedValueOnce({ data: { success: true, data: { user } } });
    await expect(tryRestoreSession()).resolves.toBe('restored');
    expect(mockPost).toHaveBeenCalledWith('/admin/auth/refresh');
  });

  it('tryRestoreSession clears a dead session', async () => {
    persistSession({ user });
    mockGet.mockRejectedValue(new Error('401'));
    mockPost.mockRejectedValue(new Error('401'));
    await expect(tryRestoreSession()).resolves.toBe('cleared');
    expect(getStoredUser()).toBeNull();
  });
});
