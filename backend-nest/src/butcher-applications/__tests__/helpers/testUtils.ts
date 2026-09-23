import type { Request, Response } from 'express';
import type { JwtPayload } from '../../../common/types/jwt-payload.interface';

export const TEST_USER_ID = '11111111-1111-1111-1111-111111111111';
export const TEST_ADMIN_ID = '22222222-2222-2222-2222-222222222222';
export const TEST_OTHER_USER_ID = '33333333-3333-3333-3333-333333333333';
export const TEST_APP_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
export const TEST_DOC_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
export const TEST_BUTCHER_USER_ID = '44444444-4444-4444-4444-444444444444';
export const TEST_ACCOUNT_HASH = '$2b$12$abcdefghijklmnopqrstuv';

export function userPayload(
  userId = TEST_USER_ID,
  role: JwtPayload['role'] = 'USER',
): JwtPayload {
  return { userId, username: 'testuser', role, passwordVersion: 1 };
}

export function createMockReq(
  overrides: Partial<Request> & { user?: JwtPayload } = {},
): Request & { user?: JwtPayload } {
  return {
    method: 'GET',
    headers: {},
    query: {},
    body: {},
    ...overrides,
  } as Request & { user?: JwtPayload };
}

export function createMockRes(): Response & {
  _status: number;
  _json: unknown;
} {
  const res = {
    _status: 200,
    _json: undefined as unknown,
  } as Response & { _status: number; _json: unknown };

  (res as Response).status = jest.fn((code: number) => {
    res._status = code;
    return res;
  }) as Response['status'];

  (res as Response).json = jest.fn((body: unknown) => {
    res._json = body;
    return res;
  }) as Response['json'];

  (res as Response).end = jest.fn(() => res) as Response['end'];
  (res as Response).setHeader = jest.fn() as Response['setHeader'];

  return res;
}

export function getResponseBody<T = Record<string, unknown>>(
  res: ReturnType<typeof createMockRes>,
): T {
  return res._json as T;
}
