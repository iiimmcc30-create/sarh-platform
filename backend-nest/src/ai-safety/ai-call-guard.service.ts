import { Injectable, Optional } from '@nestjs/common';
import { LoggerService } from '../common/services/logger.service';
import { AiBudgetService } from './ai-budget.service';
import { aiMaxRetries, aiTimeoutMs, isAiEnabled } from './ai-flags';
import {
  AiUsageLogService,
  type AiUsageOutcome,
} from './ai-usage-log.service';

export type AiUsage = {
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  total_tokens?: number | null;
  prompt_tokens_details?: { cached_tokens?: number | null } | null;
} | null;

export type AiRequestControls = {
  /** Aborts the HTTP request when the deadline passes. */
  signal: AbortSignal;
  /** Per-attempt timeout to hand to the SDK (ms). */
  timeout: number;
  maxRetries: number;
};

export type AiCallFailure = 'disabled' | 'budget' | 'timeout' | 'error';

export type AiCallResult<T> =
  | { ok: true; value: T; latencyMs: number }
  | { ok: false; reason: AiCallFailure; latencyMs: number };

export class AiDeadlineError extends Error {
  constructor() {
    super('ai_deadline_exceeded');
    this.name = 'AiDeadlineError';
  }
}

const TIMEOUT_ERROR_NAMES = new Set([
  'AiDeadlineError',
  'APIConnectionTimeoutError',
  'APIUserAbortError',
  'AbortError',
  'TimeoutError',
]);

function errName(err: unknown): string {
  return err instanceof Error ? err.name : typeof err;
}

function errStatus(err: unknown): number | undefined {
  const s = (err as { status?: unknown } | null)?.status;
  return typeof s === 'number' ? s : undefined;
}

/** Rough upper estimate: ~3 chars per token for Arabic/JSON, plus overhead. */
export function estimateInputTokens(chars: number): number {
  return Math.ceil(Math.max(0, chars) / 3) + 50;
}

/**
 * One entry point for every outbound model call:
 * master switch → shared daily budget (reservation) → hard deadline →
 * metadata-only logging → budget settle. Never logs prompts, answers,
 * API keys or provider error messages (they can echo key fragments).
 */
@Injectable()
export class AiCallGuardService {
  constructor(
    private readonly budget: AiBudgetService,
    private readonly logger: LoggerService,
    @Optional() private readonly usageLog?: AiUsageLogService,
  ) {}

  private async persistUsage(input: {
    agent: string;
    model: string;
    latencyMs: number;
    outcome: AiUsageOutcome;
    usage?: AiUsage;
  }) {
    const inputTokens = Number(input.usage?.prompt_tokens ?? 0);
    const outputTokens = Number(input.usage?.completion_tokens ?? 0);
    const cachedTokens = Number(
      input.usage?.prompt_tokens_details?.cached_tokens ?? 0,
    );
    try {
      await this.usageLog?.record({
        agent: input.agent,
        model: input.model,
        inputTokens: Number.isFinite(inputTokens) ? inputTokens : 0,
        cachedTokens: Number.isFinite(cachedTokens) ? cachedTokens : 0,
        outputTokens: Number.isFinite(outputTokens) ? outputTokens : 0,
        latencyMs: input.latencyMs,
        outcome: input.outcome,
      });
    } catch (err) {
      this.logger.warn(
        { errorName: err instanceof Error ? err.name : undefined },
        'AI usage log write failed',
      );
    }
  }

  async run<T>(opts: {
    feature: string;
    model: string;
    inputChars: number;
    maxOutputTokens: number;
    call: (
      controls: AiRequestControls,
    ) => Promise<{ value: T; usage?: AiUsage }>;
  }): Promise<AiCallResult<T>> {
    const started = Date.now();
    const base = { feature: opts.feature, model: opts.model };

    if (!isAiEnabled()) {
      return { ok: false, reason: 'disabled', latencyMs: 0 };
    }

    const reservation = await this.budget.reserve(
      estimateInputTokens(opts.inputChars) + opts.maxOutputTokens,
      opts.feature,
    );
    if (!reservation.ok) {
      this.logger.warn(
        { event: 'AI_BUDGET_BLOCKED', ...base, reason: reservation.reason },
        'AI call skipped — daily budget reached or budget store unavailable',
      );
      await this.persistUsage({
        agent: opts.feature,
        model: opts.model,
        latencyMs: 0,
        outcome: 'fallback',
      });
      return { ok: false, reason: 'budget', latencyMs: 0 };
    }

    const timeoutMs = aiTimeoutMs();
    const controller = new AbortController();
    let timer: NodeJS.Timeout | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new AiDeadlineError());
      }, timeoutMs);
      timer.unref?.();
    });

    try {
      const res = await Promise.race([
        opts.call({
          signal: controller.signal,
          timeout: timeoutMs,
          maxRetries: aiMaxRetries(),
        }),
        deadline,
      ]);
      const latencyMs = Date.now() - started;
      const input = Number(res.usage?.prompt_tokens ?? NaN);
      const output = Number(res.usage?.completion_tokens ?? NaN);
      const total = Number(
        res.usage?.total_tokens ??
          (Number.isFinite(input) && Number.isFinite(output)
            ? input + output
            : NaN),
      );
      await this.budget.settle(
        reservation,
        Number.isFinite(total) ? total : null,
      );
      this.logger.info(
        {
          event: 'AI_USAGE',
          ...base,
          outcome: 'ok',
          inputTokens: Number.isFinite(input) ? input : undefined,
          outputTokens: Number.isFinite(output) ? output : undefined,
          latencyMs,
        },
        'AI call completed',
      );
      await this.persistUsage({
        agent: opts.feature,
        model: opts.model,
        latencyMs,
        outcome: 'answered',
        usage: res.usage,
      });
      return { ok: true, value: res.value, latencyMs };
    } catch (err) {
      const latencyMs = Date.now() - started;
      const timedOut =
        controller.signal.aborted || TIMEOUT_ERROR_NAMES.has(errName(err));
      const status = errStatus(err);
      // An HTTP error response (4xx/5xx) means the provider rejected the
      // request → nothing billed → refund. Timeouts / network: keep the
      // reservation (the provider may still bill).
      await this.budget.settle(reservation, null, {
        refund: !timedOut && status !== undefined,
      });
      this.logger.warn(
        {
          event: 'AI_USAGE',
          ...base,
          outcome: timedOut ? 'timeout' : 'error',
          errorName: errName(err),
          status,
          latencyMs,
        },
        timedOut ? 'AI call timed out' : 'AI call failed',
      );
      await this.persistUsage({
        agent: opts.feature,
        model: opts.model,
        latencyMs,
        outcome: 'error',
      });
      return { ok: false, reason: timedOut ? 'timeout' : 'error', latencyMs };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
