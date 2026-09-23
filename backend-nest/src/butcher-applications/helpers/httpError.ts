import { throwApi } from '../../common/exceptions/api.exception';
import { logger } from '@/lib/logger';
import { isButcherApplicationError } from '../errors';

/**
 * Maps domain errors to the standard Sarouh API envelope (NestJS).
 */
export function handleButcherApplicationError(
  _res: unknown,
  err: unknown,
): never {
  if (isButcherApplicationError(err)) {
    throwApi(err.httpStatus, err.code, err.messageAr, err.details);
  }

  logger.error({ err }, 'Unhandled butcher application error');
  throwApi(500, 'server_error', 'خطأ في الخادم');
}
