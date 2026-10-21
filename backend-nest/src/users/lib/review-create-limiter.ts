import { Injectable } from '@nestjs/common';
import { throwApi } from '../../common/exceptions/api.exception';

/** Per-account cap on new reviews, independent of the global API limiter. */
export const REVIEW_CREATE_LIMIT = 8;
export const REVIEW_CREATE_WINDOW_MS = 60 * 60 * 1000;

@Injectable()
export class ReviewCreateLimiter {
  private readonly hits = new Map<string, number[]>();

  assert(userId: string, now = Date.now()) {
    const recent = (this.hits.get(userId) ?? []).filter(
      (at) => now - at < REVIEW_CREATE_WINDOW_MS,
    );
    if (recent.length >= REVIEW_CREATE_LIMIT) {
      throwApi(
        429,
        'rate_limited',
        'تجاوزت الحد المسموح لإرسال التقييمات، حاول لاحقاً',
      );
    }
    recent.push(now);
    this.hits.set(userId, recent);
  }
}
