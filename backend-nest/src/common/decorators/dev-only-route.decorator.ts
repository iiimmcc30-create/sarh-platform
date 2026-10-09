import { Post } from '@nestjs/common';
import { throwApi } from '../exceptions/api.exception';
import { isNiSandboxMockMode } from '../../payments/ni-client';

/**
 * Hard production guard for payment shortcuts (dev-complete).
 *
 * The production image sets NODE_ENV=production (Dockerfile + compose), so:
 *  - `DevOnlyPost` registers NO route at all in production (the decorator is a
 *    no-op when the controller class is loaded), so the path 404s.
 *  - `assertDevPaymentShortcutAllowed` refuses at call time in production even
 *    if a route were somehow reached, and also outside NI mock mode.
 * Neither depends on the NI keys alone any more.
 */
export function isProductionRuntime(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return (env.NODE_ENV ?? '').trim().toLowerCase() === 'production';
}

export function DevOnlyPost(path: string): MethodDecorator {
  if (isProductionRuntime()) {
    return () => undefined;
  }
  return Post(path);
}

export function assertDevPaymentShortcutAllowed(): void {
  if (isProductionRuntime()) {
    throwApi(404, 'not_found', 'غير موجود');
  }
  if (!isNiSandboxMockMode()) {
    throwApi(403, 'forbidden', 'غير متاح في الإنتاج');
  }
}
