import { Injectable } from '@nestjs/common';
import { errorCountsSince } from '../../ai-safety/http-error-counter';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationQueueService } from '../../queue/services/notification-queue.service';
import { RedisCacheService } from '../../redis/services/redis-cache.service';
import type { TechOps } from './tech-tools';

@Injectable()
export class TechOpsService implements TechOps {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: RedisCacheService,
    private readonly notifications: NotificationQueueService,
  ) {}

  async health() {
    let db = false;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      db = true;
    } catch {
      db = false;
    }
    let redis = false;
    try {
      redis = this.cache.isEnabled() && (await this.cache.ping());
    } catch {
      redis = false;
    }
    const queues = await this.queues();
    return {
      status: db ? 'ok' : 'degraded',
      checks: {
        api: true,
        db,
        redis,
        queue: queues.length > 0,
      },
    };
  }

  async queues() {
    if (!this.notifications.isEnabled()) return [];
    try {
      const counts = await this.notifications.getJobCounts();
      return [
        {
          name: 'notifications',
          waiting: Number(counts.waiting ?? 0),
          active: Number(counts.active ?? 0),
          failed: Number(counts.failed ?? 0),
          delayed: Number(counts.delayed ?? 0),
        },
      ];
    } catch {
      return [];
    }
  }

  async errors(minutes: number) {
    const window = Math.min(1440, Math.max(1, minutes)) * 60 * 1000;
    return errorCountsSince(Date.now() - window);
  }

  async sentry(hours: number) {
    const token = process.env.SENTRY_AUTH_TOKEN?.trim();
    const org = process.env.SENTRY_ORG?.trim();
    const project = process.env.SENTRY_PROJECT?.trim();
    if (!token || !org || !project) return { available: false, issues: [] };
    const window = Math.min(48, Math.max(1, hours));
    try {
      const response = await fetch(
        `https://sentry.io/api/0/projects/${encodeURIComponent(org)}/${encodeURIComponent(project)}/issues/?query=is:unresolved&limit=5&statsPeriod=${window}h`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(4000),
        },
      );
      if (!response.ok) return { available: true, issues: [] };
      const body = (await response.json()) as Array<{
        title?: string;
        count?: string;
      }>;
      return {
        available: true,
        issues: body.slice(0, 5).map((issue) => ({
          title: String(issue.title || '').slice(0, 120),
          count: Number(issue.count) || 0,
        })),
      };
    } catch {
      return { available: true, issues: [] };
    }
  }
}
