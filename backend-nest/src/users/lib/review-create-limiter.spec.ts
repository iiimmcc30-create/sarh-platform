import {
  REVIEW_CREATE_LIMIT,
  REVIEW_CREATE_WINDOW_MS,
  ReviewCreateLimiter,
} from './review-create-limiter';

describe('ReviewCreateLimiter', () => {
  it('allows the budget then rejects the next create inside the window', () => {
    const limiter = new ReviewCreateLimiter();
    const now = 1_700_000_000_000;
    for (let i = 0; i < REVIEW_CREATE_LIMIT; i += 1) {
      limiter.assert('user-1', now + i);
    }
    expect(() => limiter.assert('user-1', now + 10)).toThrow(
      expect.objectContaining({ status: 429, error: 'rate_limited' }),
    );
  });

  it('does not share the budget across accounts and resets after the window', () => {
    const limiter = new ReviewCreateLimiter();
    const now = 1_700_000_000_000;
    for (let i = 0; i < REVIEW_CREATE_LIMIT; i += 1) limiter.assert('user-1', now);
    expect(() => limiter.assert('user-2', now)).not.toThrow();
    expect(() =>
      limiter.assert('user-1', now + REVIEW_CREATE_WINDOW_MS),
    ).not.toThrow();
  });
});
