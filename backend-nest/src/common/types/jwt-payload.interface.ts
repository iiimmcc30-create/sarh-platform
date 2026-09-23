import type { Role } from '@prisma/client';

export interface JwtPayload {
  userId: string;
  username: string;
  role: Role;
  passwordVersion?: number;
  iat?: number;
  exp?: number;
}

export type AccessTokenClaims = Omit<
  JwtPayload,
  'iat' | 'exp' | 'passwordVersion'
> & {
  passwordVersion: number;
};
