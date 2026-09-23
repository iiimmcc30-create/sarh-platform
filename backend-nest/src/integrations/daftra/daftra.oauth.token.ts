import { DaftraRequestError } from './daftra.errors';
import { daftraOAuthTokenUrl } from './daftra.oauth.config';
import { redactSensitive } from '../utils/redact.util';

export type DaftraTokenResponse = {
  accessToken: string;
  refreshToken: string | null;
  tokenType: string;
  expiresIn: number;
  scope: string | null;
};

type PasswordGrantInput = {
  origin: string;
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
  fetchImpl?: typeof fetch;
};

type RefreshInput = {
  origin: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  fetchImpl?: typeof fetch;
};

function safeTokenError(httpStatus: number | null): DaftraRequestError {
  return new DaftraRequestError(
    httpStatus === 401 || httpStatus === 403
      ? 'INVALID_API_KEY'
      : httpStatus == null
        ? 'CONNECTION_FAILED'
        : 'UPSTREAM_ERROR',
    httpStatus === 401 || httpStatus === 403
      ? 'بيانات اعتماد دفترة غير صحيحة'
      : httpStatus == null
        ? 'تعذر الاتصال بحساب دفترة'
        : 'خدمة دفترة غير متاحة حالياً',
    httpStatus,
  );
}

function parseTokenBody(parsed: unknown): DaftraTokenResponse {
  const record = (parsed ?? {}) as Record<string, unknown>;
  const accessToken =
    typeof record.access_token === 'string' ? record.access_token.trim() : '';
  if (!accessToken) {
    throw new DaftraRequestError(
      'INVALID_RESPONSE',
      'استجابة دفترة غير صالحة',
      200,
    );
  }
  const refreshToken =
    typeof record.refresh_token === 'string' && record.refresh_token.trim()
      ? record.refresh_token.trim()
      : null;
  const tokenType =
    typeof record.token_type === 'string' && record.token_type.trim()
      ? record.token_type.trim()
      : 'Bearer';
  const expiresInRaw = Number(record.expires_in);
  const expiresIn =
    Number.isFinite(expiresInRaw) && expiresInRaw > 0 ? expiresInRaw : 3600;
  const scope =
    typeof record.scope === 'string' && record.scope.trim()
      ? record.scope.trim()
      : null;
  return { accessToken, refreshToken, tokenType, expiresIn, scope };
}

async function postTokenForm(
  url: string,
  body: Record<string, string>,
  fetchImpl: typeof fetch,
): Promise<DaftraTokenResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(body).toString(),
      signal: controller.signal,
    });

    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch {
      throw new DaftraRequestError(
        'INVALID_RESPONSE',
        'استجابة دفترة غير صالحة',
        response.status,
      );
    }

    void redactSensitive(parsed);

    if (response.status < 200 || response.status >= 300) {
      throw safeTokenError(response.status);
    }

    return parseTokenBody(parsed);
  } catch (err) {
    if (err instanceof DaftraRequestError) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new DaftraRequestError(
        'CONNECTION_FAILED',
        'انتهت مهلة الاتصال بدفترة',
        null,
      );
    }
    throw safeTokenError(null);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Documented Daftra OAuth2 token grant (password).
 * POST /api2/oauth/token
 */
export function exchangeDaftraPasswordGrant(input: PasswordGrantInput) {
  const fetchImpl = input.fetchImpl ?? fetch;
  return postTokenForm(
    daftraOAuthTokenUrl(input.origin),
    {
      grant_type: 'password',
      client_id: input.clientId,
      client_secret: input.clientSecret,
      username: input.username,
      password: input.password,
    },
    fetchImpl,
  );
}

/**
 * Refresh access token (draft Daftra docs).
 */
export function refreshDaftraAccessToken(input: RefreshInput) {
  const fetchImpl = input.fetchImpl ?? fetch;
  return postTokenForm(
    daftraOAuthTokenUrl(input.origin),
    {
      grant_type: 'refresh_token',
      refresh_token: input.refreshToken,
      client_id: input.clientId,
      client_secret: input.clientSecret,
    },
    fetchImpl,
  );
}
