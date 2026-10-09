import { createPrivateKey, sign } from 'crypto';
import {
  TEST_LEAF_PRIVATE_KEY_PEM,
  TEST_X5C,
} from './apple-test-chain.fixture';

export function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/** Signs a JWS with the test chain (shape identical to Apple's). */
export function signTestJws(
  payload: Record<string, unknown>,
  opts: { x5c?: string[]; alg?: string } = {},
): string {
  const header = b64url(
    JSON.stringify({ alg: opts.alg ?? 'ES256', x5c: opts.x5c ?? TEST_X5C }),
  );
  const body = b64url(JSON.stringify(payload));
  const sig = sign('sha256', Buffer.from(`${header}.${body}`), {
    key: createPrivateKey(TEST_LEAF_PRIVATE_KEY_PEM),
    dsaEncoding: 'ieee-p1363',
  });
  return `${header}.${body}.${b64url(sig)}`;
}
