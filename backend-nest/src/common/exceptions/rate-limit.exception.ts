export class RateLimitException extends Error {
  constructor(public readonly retryAfter: number) {
    super('too_many_requests');
    this.name = 'RateLimitException';
  }

  toJSON() {
    return {
      error: 'too_many_requests',
      messageAr: 'طلبات كثيرة جداً، حاول لاحقاً',
      message: 'Too many requests, please try again later',
      retryAfter: this.retryAfter,
    };
  }
}
