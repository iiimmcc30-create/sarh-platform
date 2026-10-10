import { Injectable, Optional } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { RedisCacheService } from '../../redis/services/redis-cache.service';
import { EmailQueueService } from '../../queue/services/email-queue.service';
import { ImageQueueService } from '../../queue/services/image-queue.service';
import { NotificationQueueService } from '../../queue/services/notification-queue.service';
import { PushQueueService } from '../../queue/services/push-queue.service';
import { AiAuditService } from '../core/audit.service';
import { parseSafeAction, type SafeActionRequest } from './safe-actions';

export const PROPOSAL_TTL_MS = 30 * 60 * 1000;

export type SafeProposal = {
  id: string;
  action: SafeActionRequest;
  createdAt: number;
  expiresAt: number;
  status: 'pending' | 'executed' | 'expired' | 'rejected';
};

@Injectable()
export class SafeActionService {
  private readonly proposals = new Map<string, SafeProposal>();

  constructor(
    private readonly audit: AiAuditService,
    @Optional() private readonly cache?: RedisCacheService,
    @Optional() private readonly notifications?: NotificationQueueService,
    @Optional() private readonly emails?: EmailQueueService,
    @Optional() private readonly push?: PushQueueService,
    @Optional() private readonly images?: ImageQueueService,
  ) {}

  list(): SafeProposal[] {
    return [...this.proposals.values()].sort((a, b) => b.createdAt - a.createdAt);
  }

  async propose(
    actorId: string,
    input: { action?: string; queue?: string; cacheKey?: string; max?: number },
    now = Date.now(),
  ): Promise<{ ok: true; proposal: SafeProposal } | { ok: false; reason: 'not_whitelisted' }> {
    const action = parseSafeAction(input);
    if (!action) {
      await this.audit.append({
        agent: 'tech',
        actorKind: 'system',
        actorId,
        tool: 'propose_safe_action',
        inputJson: '{}',
        resultSummary: 'not_whitelisted',
        status: 'denied',
        durationMs: 0,
      });
      return { ok: false, reason: 'not_whitelisted' };
    }
    const proposal: SafeProposal = {
      id: randomUUID(),
      action,
      createdAt: now,
      expiresAt: now + PROPOSAL_TTL_MS,
      status: 'pending',
    };
    this.proposals.set(proposal.id, proposal);
    await this.audit.append({
      agent: 'tech',
      actorKind: 'system',
      actorId,
      tool: 'propose_safe_action',
      inputJson: JSON.stringify(action),
      resultSummary: proposal.id,
      status: 'ok',
      durationMs: 0,
    });
    return { ok: true, proposal };
  }

  async approve(
    admin: { userId: string; username: string; role: string },
    id: string,
    now = Date.now(),
  ): Promise<{ ok: boolean; reason?: string }> {
    if (admin.role !== 'ADMIN') {
      await this.audit.append({
        agent: 'tech',
        actorKind: 'admin',
        actorId: admin.userId,
        tool: 'approve_safe_action',
        inputJson: JSON.stringify({ id }),
        resultSummary: 'forbidden',
        status: 'denied',
        durationMs: 0,
      });
      return { ok: false, reason: 'forbidden' };
    }
    const proposal = this.proposals.get(id);
    if (!proposal || proposal.status !== 'pending') {
      return { ok: false, reason: 'missing' };
    }
    if (now > proposal.expiresAt) {
      proposal.status = 'expired';
      await this.audit.append({
        agent: 'tech',
        actorKind: 'admin',
        actorId: admin.userId,
        tool: 'approve_safe_action',
        inputJson: JSON.stringify({ id }),
        resultSummary: `expired:${admin.username}`.slice(0, 240),
        status: 'denied',
        durationMs: 0,
      });
      return { ok: false, reason: 'expired' };
    }
    await this.audit.append({
      agent: 'tech',
      actorKind: 'admin',
      actorId: admin.userId,
      tool: 'approve_safe_action',
      inputJson: JSON.stringify({ id }),
      resultSummary: `approved:${admin.username}`.slice(0, 240),
      status: 'ok',
      durationMs: 0,
    });
    try {
      const summary = await this.execute(proposal.action);
      proposal.status = 'executed';
      await this.audit.append({
        agent: 'tech',
        actorKind: 'admin',
        actorId: admin.userId,
        tool: 'execute_safe_action',
        inputJson: JSON.stringify(proposal.action),
        resultSummary: summary.slice(0, 240),
        status: 'ok',
        durationMs: 0,
      });
      return { ok: true };
    } catch {
      proposal.status = 'rejected';
      await this.audit.append({
        agent: 'tech',
        actorKind: 'admin',
        actorId: admin.userId,
        tool: 'execute_safe_action',
        inputJson: '{}',
        resultSummary: 'error',
        status: 'error',
        durationMs: 0,
      });
      return { ok: false, reason: 'error' };
    }
  }

  private async execute(action: SafeActionRequest): Promise<string> {
    if (action.action === 'clear_known_cache') {
      await this.cache?.del(action.cacheKey);
      return `cleared:${action.cacheKey}`;
    }
    const retried = await this.retryQueue(action.queue, action.max);
    return `retried:${action.queue}:${retried}`;
  }

  private async retryQueue(queue: string, max: number): Promise<number> {
    const service =
      queue === 'notifications'
        ? this.notifications
        : queue === 'emails'
          ? this.emails
          : queue === 'push-notifications'
            ? this.push
            : queue === 'image-processing'
              ? this.images
              : null;
    if (!service || !('retryFailed' in service)) return 0;
    return service.retryFailed(max);
  }
}
