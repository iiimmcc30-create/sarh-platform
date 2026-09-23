// src/lib/jwt.ts
// FIX: validate secrets at startup — refuse to boot if missing or weak
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import type { Role } from '@prisma/client';

function requireSecret(name: string, min = 32): string {
  const val = process.env[name];
  if (!val || val.length < min) {
    throw new Error(
      `[FATAL] ${name} is missing or too short (min ${min} chars). ` +
        `Server will not start with an insecure JWT secret.`,
    );
  }
  return val;
}

// Throws at module load time — prevents server from starting with bad config
const JWT_SECRET = requireSecret('JWT_SECRET', 32);
const JWT_REFRESH_SECRET = requireSecret('JWT_REFRESH_SECRET', 32);
const ACCESS_EXPIRES = process.env.JWT_EXPIRES_IN || '15m';
const REFRESH_EXPIRES = process.env.JWT_REFRESH_EXPIRES_IN || '3650d';

export interface JwtPayload {
  userId: string;
  username: string;
  role: Role;
  passwordVersion?: number; // absent on legacy tokens; validated in auth middleware
  iat?: number;
  exp?: number;
}

export type AccessTokenClaims = Omit<
  JwtPayload,
  'iat' | 'exp' | 'passwordVersion'
> & {
  passwordVersion: number;
};

export function signAccessToken(payload: AccessTokenClaims): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: ACCESS_EXPIRES,
  } as jwt.SignOptions);
}

export function signRefreshToken(userId: string): string {
  return jwt.sign({ userId, jti: uuidv4() }, JWT_REFRESH_SECRET, {
    expiresIn: REFRESH_EXPIRES,
  } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

export function verifyRefreshToken(token: string): {
  userId: string;
  jti: string;
} {
  return jwt.verify(token, JWT_REFRESH_SECRET) as {
    userId: string;
    jti: string;
  };
}

export function decodeToken(token: string): JwtPayload | null {
  try {
    return jwt.decode(token) as JwtPayload;
  } catch {
    return null;
  }
}
