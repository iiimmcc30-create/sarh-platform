import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import type {
  AccessTokenClaims,
  JwtPayload,
} from '../../common/types/jwt-payload.interface';

@Injectable()
export class JwtTokenService implements OnModuleInit {
  private jwtSecret!: string;
  private jwtRefreshSecret!: string;
  private accessExpires!: string;
  private refreshExpires!: string;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.jwtSecret = this.requireSecret('JWT_SECRET', 32);
    this.jwtRefreshSecret = this.requireSecret('JWT_REFRESH_SECRET', 32);
    this.accessExpires = this.config.get<string>('JWT_EXPIRES_IN') || '15m';
    this.refreshExpires =
      this.config.get<string>('JWT_REFRESH_EXPIRES_IN') || '30d';
  }

  private requireSecret(name: string, min: number): string {
    const val = this.config.get<string>(name);
    if (!val || val.length < min) {
      throw new Error(
        `[FATAL] ${name} is missing or too short (min ${min} chars). ` +
          'Server will not start with an insecure JWT secret.',
      );
    }
    return val;
  }

  signAccessToken(payload: AccessTokenClaims): string {
    return jwt.sign(payload, this.jwtSecret, {
      expiresIn: this.accessExpires,
    } as jwt.SignOptions);
  }

  signRefreshToken(userId: string): string {
    return jwt.sign({ userId, jti: uuidv4() }, this.jwtRefreshSecret, {
      expiresIn: this.refreshExpires,
    } as jwt.SignOptions);
  }

  verifyAccessToken(token: string): JwtPayload {
    return jwt.verify(token, this.jwtSecret) as JwtPayload;
  }

  verifyRefreshToken(token: string): { userId: string; jti: string } {
    return jwt.verify(token, this.jwtRefreshSecret) as {
      userId: string;
      jti: string;
    };
  }

  getAccessSecret(): string {
    return this.jwtSecret;
  }
}
