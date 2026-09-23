import type { DaftraFailureReason } from './daftra.constants';

export class DaftraRequestError extends Error {
  constructor(
    public readonly reason: DaftraFailureReason,
    public readonly safeMessage: string,
    public readonly httpStatus: number | null = null,
  ) {
    super(safeMessage);
    this.name = 'DaftraRequestError';
  }
}

export function isDaftraRequestError(err: unknown): err is DaftraRequestError {
  return err instanceof DaftraRequestError;
}
