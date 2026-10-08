import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { LoggerService } from '../../common/services/logger.service';
import { CouncilsService } from '../councils.service';

/** How often due scheduled councils are started (API process). */
export const COUNCIL_SCHEDULE_TICK_MS = 30_000;

/**
 * Starts scheduled councils at their time and notifies «ذكّرني» users through
 * the existing notifications service. Same in-process interval + Redis claim
 * pattern as the worker crons (no new queue, BullMQ untouched). Off in tests
 * and when COUNCIL_SCHEDULER_DISABLED=true; the council lists also trigger it.
 */
@Injectable()
export class CouncilScheduleService implements OnModuleInit, OnModuleDestroy {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly councils: CouncilsService,
    private readonly logger: LoggerService,
  ) {}

  onModuleInit() {
    if (
      process.env.NODE_ENV === 'test' ||
      process.env.COUNCIL_SCHEDULER_DISABLED === 'true'
    ) {
      return;
    }
    this.timer = setInterval(() => void this.tick(), COUNCIL_SCHEDULE_TICK_MS);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick() {
    try {
      await this.councils.startDueScheduled();
    } catch (err) {
      this.logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'Council schedule tick failed',
      );
    }
  }
}
