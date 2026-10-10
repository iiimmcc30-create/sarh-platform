import { CsQualityService } from './cs-quality';
import { csRolloutIncludes, parseCsRollout, stableBucket } from './cs-rollout';
import { SafeActionService } from '../tech/safe-action.service';
import { parseSafeAction } from '../tech/safe-actions';
import { AiAuditService } from '../core/audit.service';
import { evaluateHeuristic, loadGolden } from '../../support/ai/__eval__/evaluate-golden';

const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as never;

function auditOf() {
  const rows: Array<Record<string, unknown>> = [];
  const audit = new AiAuditService(
    {
      aiAuditLog: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          rows.push(data);
          return data;
        },
        findMany: async () => rows,
      },
    } as never,
    logger,
  );
  return { rows, audit };
}

describe('customer-service rollout', () => {
  it('maps known modes and treats anything else as off', () => {
    expect(parseCsRollout(undefined)).toEqual({ kind: 'off' });
    expect(parseCsRollout('off')).toEqual({ kind: 'off' });
    expect(parseCsRollout('true')).toEqual({ kind: 'off' });
    expect(parseCsRollout('nope')).toEqual({ kind: 'off' });
    expect(parseCsRollout('percent:101')).toEqual({ kind: 'off' });
    expect(parseCsRollout('percent:5')).toEqual({ kind: 'percent', percent: 5 });
    expect(parseCsRollout('staff_only')).toEqual({ kind: 'staff_only' });
    expect(parseCsRollout('on')).toEqual({ kind: 'on' });
  });

  it('serves the right audience for each mode', () => {
    const customer = { userId: 'user-a', role: 'USER', username: 'muteb' };
    const admin = { userId: 'admin-1', role: 'ADMIN', username: 'ops' };
    const founder = { userId: 'founder-1', role: 'USER', username: 'sarh' };
    expect(csRolloutIncludes({ kind: 'off' }, admin)).toBe(false);
    expect(csRolloutIncludes({ kind: 'on' }, customer)).toBe(true);
    expect(csRolloutIncludes({ kind: 'staff_only' }, customer)).toBe(false);
    expect(csRolloutIncludes({ kind: 'staff_only' }, admin)).toBe(true);
    expect(csRolloutIncludes({ kind: 'staff_only' }, founder)).toBe(true);
    const bucket = stableBucket('user-a');
    expect(csRolloutIncludes({ kind: 'percent', percent: 0 }, customer)).toBe(false);
    expect(csRolloutIncludes({ kind: 'percent', percent: bucket }, customer)).toBe(false);
    expect(csRolloutIncludes({ kind: 'percent', percent: bucket + 1 }, customer)).toBe(true);
    expect(stableBucket('user-a')).toBe(stableBucket('user-a'));
  });

  it('falls back to Sarhan after too many rejected or escalated replies', () => {
    const quality = new CsQualityService();
    expect(quality.shouldFallback()).toBe(false);
    for (let i = 0; i < 6; i += 1) quality.note('rejected');
    for (let i = 0; i < 4; i += 1) quality.note('escalated');
    expect(quality.snapshot().rejectedRate).toBeGreaterThanOrEqual(0.4);
    expect(quality.shouldFallback()).toBe(true);
  });

  it('scores all 60 golden questions against Sarhan', async () => {
    const golden = loadGolden();
    const rows = await evaluateHeuristic(golden.cases);
    const matched = rows.filter((row) => row.ok).length;
    expect(golden.cases).toHaveLength(60);
    expect(matched).toBe(60);
  });
});

describe('safe tech actions', () => {
  const env = { ...process.env };
  beforeEach(() => {
    process.env = { ...env };
    process.env.REDIS_ENABLED = 'false';
  });
  afterAll(() => {
    process.env = env;
  });

  it('rejects actions outside the whitelist', () => {
    expect(parseSafeAction({ action: 'restart_worker' })).toBeNull();
    expect(parseSafeAction({ action: 'retry_failed_jobs', queue: 'subscriptions' })).toBeNull();
    expect(parseSafeAction({ action: 'clear_known_cache', cacheKey: 'user:1' })).toBeNull();
    expect(parseSafeAction({ action: 'retry_failed_jobs', queue: 'notifications', max: 3 })).toEqual({
      action: 'retry_failed_jobs',
      queue: 'notifications',
      max: 3,
    });
  });

  it('does not execute a proposal until an admin approves it, and rejects an expired one', async () => {
    const { rows, audit } = auditOf();
    const retried: string[] = [];
    const notifications = {
      retryFailed: jest.fn(async (max: number) => {
        retried.push(`notifications:${max}`);
        return 1;
      }),
    };
    const service = new SafeActionService(
      audit,
      undefined,
      notifications as never,
    );
    const proposed = await service.propose('tech', {
      action: 'retry_failed_jobs',
      queue: 'notifications',
      max: 2,
    });
    expect(proposed.ok).toBe(true);
    expect(retried).toEqual([]);
    if (!proposed.ok) return;
    await expect(
      service.approve(
        { userId: 'u1', username: 'user', role: 'USER' },
        proposed.proposal.id,
      ),
    ).resolves.toEqual({ ok: false, reason: 'forbidden' });
    expect(retried).toEqual([]);
    await expect(
      service.approve(
        { userId: 'admin-1', username: 'muteb', role: 'ADMIN' },
        proposed.proposal.id,
        proposed.proposal.expiresAt + 1,
      ),
    ).resolves.toEqual({ ok: false, reason: 'expired' });
    expect(retried).toEqual([]);
    const fresh = await service.propose('tech', {
      action: 'retry_failed_jobs',
      queue: 'notifications',
      max: 2,
    });
    if (!fresh.ok) throw new Error('proposal');
    await expect(
      service.approve(
        { userId: 'admin-1', username: 'muteb', role: 'ADMIN' },
        fresh.proposal.id,
        fresh.proposal.createdAt,
      ),
    ).resolves.toEqual({ ok: true });
    expect(retried).toEqual(['notifications:2']);
    expect(rows.map((row) => `${row.tool}:${row.status}`)).toEqual([
      'propose_safe_action:ok',
      'approve_safe_action:denied',
      'approve_safe_action:denied',
      'propose_safe_action:ok',
      'approve_safe_action:ok',
      'execute_safe_action:ok',
    ]);
    await expect(
      service.propose('tech', { action: 'restart_worker' }),
    ).resolves.toEqual({ ok: false, reason: 'not_whitelisted' });
  });
});
