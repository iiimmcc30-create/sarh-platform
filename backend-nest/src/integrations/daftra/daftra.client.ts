import { DaftraClient } from './daftra.http-client';
import { DAFTRA_PATHS } from './daftra.constants';
import { DaftraRequestError, isDaftraRequestError } from './daftra.errors';

export type DaftraAccountConfig = {
  accountIdentifier: string;
  apiKey: string;
};

export type DaftraConnectionResult =
  | { connected: true; httpStatus: number; host: string; path: string }
  | {
      connected: false;
      reason:
        | 'INVALID_API_KEY'
        | 'CONNECTION_FAILED'
        | 'NOT_FOUND'
        | 'RATE_LIMITED'
        | 'UPSTREAM_ERROR'
        | 'INVALID_RESPONSE';
      httpStatus: number | null;
      safeReason: string;
      host: string;
      path: string;
    };

const ACCOUNT_ID_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/i;
const CONNECTION_PATH = DAFTRA_PATHS.apiKeyInfo;
const CONNECTION_FALLBACK_PATH = DAFTRA_PATHS.products;

export function normalizeDaftraAccountIdentifier(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return '';
  const withoutProto = trimmed.replace(/^https?:\/\//, '');
  const host = withoutProto.split('/')[0] ?? '';
  if (host.includes('.')) {
    const parts = host.split('.').filter(Boolean);
    if (parts.length >= 2 && parts[parts.length - 2] === 'daftra') {
      return parts[0] ?? '';
    }
    throw new Error('invalid_account_identifier');
  }
  return host;
}

export function assertValidDaftraAccountIdentifier(value: string): string {
  const normalized = normalizeDaftraAccountIdentifier(value);
  if (!ACCOUNT_ID_RE.test(normalized)) {
    throw new Error('invalid_account_identifier');
  }
  return normalized;
}

export function resolveDaftraOrigin(accountIdentifier: string): string {
  const id = assertValidDaftraAccountIdentifier(accountIdentifier);
  const template = process.env.DAFTRA_API_BASE_URL?.trim();
  if (
    template &&
    (template.includes('{account}') || template.includes('{subdomain}'))
  ) {
    return template
      .replaceAll('{account}', id)
      .replaceAll('{subdomain}', id)
      .replace(/\/$/, '');
  }
  return `https://${id}.daftra.com`;
}

export function daftraApiOrigin(accountIdentifier: string): string {
  return resolveDaftraOrigin(accountIdentifier);
}

export function daftraApiKeyInfoUrl(accountIdentifier: string): string {
  return `${resolveDaftraOrigin(accountIdentifier)}/api2${DAFTRA_PATHS.apiKeyInfo}`;
}

export function createDaftraClient(
  config: DaftraAccountConfig,
  fetchImpl?: typeof fetch,
): DaftraClient {
  const apiKey = config.apiKey?.trim() ?? '';
  if (!apiKey) {
    throw new DaftraRequestError(
      'INVALID_API_KEY',
      'بيانات اعتماد دفترة غير صحيحة',
      null,
    );
  }
  return new DaftraClient({
    origin: resolveDaftraOrigin(config.accountIdentifier),
    apiKey,
    fetchImpl,
  });
}

export type DaftraOAuthClientConfig = {
  accountIdentifier: string;
  accessToken: string;
  refreshAccessToken?: () => Promise<string | null>;
};

export function createDaftraOAuthClient(
  config: DaftraOAuthClientConfig,
  fetchImpl?: typeof fetch,
): DaftraClient {
  const accessToken = config.accessToken?.trim() ?? '';
  if (!accessToken) {
    throw new DaftraRequestError(
      'INVALID_API_KEY',
      'بيانات اعتماد دفترة غير صحيحة',
      null,
    );
  }
  return new DaftraClient({
    origin: resolveDaftraOrigin(config.accountIdentifier),
    accessToken,
    refreshAccessToken: config.refreshAccessToken,
    fetchImpl,
  });
}

/** Safe fields for logs/UI — never includes the API key. */
export function daftraConnectionLogFields(
  result: DaftraConnectionResult,
): Record<string, string | number | boolean | null> {
  return {
    connected: result.connected,
    httpStatus: result.httpStatus,
    host: result.host,
    path: result.path,
    ...(result.connected
      ? {}
      : { reason: result.reason, safeReason: result.safeReason }),
  };
}

export async function probeDaftraConnection(
  client: DaftraClient,
): Promise<{ httpStatus: number; path: string }> {
  try {
    const res = await client.get(CONNECTION_PATH);
    return { httpStatus: res.httpStatus, path: CONNECTION_PATH };
  } catch (err) {
    // Some tenants return 404 Invalid Endpoint for api_key_info; products is documented.
    if (isDaftraRequestError(err) && err.reason === 'NOT_FOUND') {
      const res = await client.get(CONNECTION_FALLBACK_PATH, {
        page: 1,
        limit: 1,
      });
      return { httpStatus: res.httpStatus, path: CONNECTION_FALLBACK_PATH };
    }
    throw err;
  }
}

export async function testDaftraConnection(
  config: DaftraAccountConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<DaftraConnectionResult> {
  let host = '';
  try {
    host = new URL(resolveDaftraOrigin(config.accountIdentifier)).host;
  } catch {
    host = 'invalid-account';
  }

  try {
    const client = createDaftraClient(config, fetchImpl);
    const probe = await probeDaftraConnection(client);
    return {
      connected: true,
      httpStatus: probe.httpStatus,
      host,
      path: probe.path,
    };
  } catch (err) {
    if (isDaftraRequestError(err)) {
      const reason =
        err.reason === 'INVALID_API_KEY' ||
        err.reason === 'NOT_FOUND' ||
        err.reason === 'RATE_LIMITED' ||
        err.reason === 'UPSTREAM_ERROR' ||
        err.reason === 'INVALID_RESPONSE' ||
        err.reason === 'CONNECTION_FAILED'
          ? err.reason
          : 'CONNECTION_FAILED';
      return {
        connected: false,
        reason,
        httpStatus: err.httpStatus,
        safeReason: err.safeMessage,
        host,
        path: CONNECTION_PATH,
      };
    }
    return {
      connected: false,
      reason: 'CONNECTION_FAILED',
      httpStatus: null,
      safeReason: 'تعذر الاتصال بحساب دفترة',
      host,
      path: CONNECTION_PATH,
    };
  }
}
