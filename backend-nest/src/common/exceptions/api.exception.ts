export class ApiException extends Error {
  constructor(
    public readonly status: number,
    public readonly error: string,
    public readonly messageAr: string,
    public readonly details?: unknown,
  ) {
    super(messageAr);
    this.name = 'ApiException';
  }

  toJSON() {
    return {
      success: false as const,
      error: this.error,
      messageAr: this.messageAr,
      ...(this.details !== undefined ? { details: this.details } : {}),
      timestamp: new Date().toISOString(),
    };
  }
}

export function throwApi(
  status: number,
  error: string,
  messageAr: string,
  details?: unknown,
): never {
  throw new ApiException(status, error, messageAr, details);
}
