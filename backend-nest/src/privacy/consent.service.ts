import { Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { RateLimitService } from '../common/services/rate-limit.service';
import { PRIVACY_POLICY, PRIVACY_POLICY_VERSION } from './privacy-policy';

export type ConsentSource = 'signup' | 'policy_update';

@Injectable()
export class ConsentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rateLimit: RateLimitService,
  ) {}

  private requestMeta(req?: Request): { ip?: string; userAgent?: string } {
    if (!req) return {};
    const ip = this.rateLimit.getClientIp(req);
    const ua = req.headers?.['user-agent'];
    return {
      ip: ip && ip !== 'unknown' ? ip.slice(0, 64) : undefined,
      userAgent: typeof ua === 'string' ? ua.slice(0, 200) : undefined,
    };
  }

  /** Idempotent: one row per user × policy × version (first acceptance kept). */
  async record(
    userId: string,
    source: ConsentSource,
    req?: Request,
    policyVersion = PRIVACY_POLICY_VERSION,
  ) {
    const meta = this.requestMeta(req);
    return this.prisma.consentRecord.upsert({
      where: {
        userId_policy_policyVersion: {
          userId,
          policy: PRIVACY_POLICY,
          policyVersion,
        },
      },
      update: {},
      create: {
        userId,
        policy: PRIVACY_POLICY,
        policyVersion,
        source,
        ...meta,
      },
      select: { policyVersion: true, acceptedAt: true },
    });
  }

  async status(userId: string) {
    const row = await this.prisma.consentRecord.findUnique({
      where: {
        userId_policy_policyVersion: {
          userId,
          policy: PRIVACY_POLICY,
          policyVersion: PRIVACY_POLICY_VERSION,
        },
      },
      select: { acceptedAt: true },
    });
    return {
      policyVersion: PRIVACY_POLICY_VERSION,
      accepted: Boolean(row),
      acceptedAt: row?.acceptedAt ?? null,
    };
  }
}
