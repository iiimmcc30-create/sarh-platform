/**
 * Daftra authentication config (official docs only).
 *
 * Confirmed (docs.daftara.dev / Apidog):
 * 1) API Key — header `APIKEY` on tenant host `https://{subdomain}.daftra.com/api2/...`
 * 2) OAuth2 Bearer — POST `{origin}/api2/oauth/token` with
 *    grant_type=password + client_id + client_secret + username + password
 *    Response: access_token, token_type, expires_in, refresh_token
 * 3) API calls with Bearer must NOT also send APIKEY
 *
 * Refresh (draft Apidog): grant_type=refresh_token + client_id + client_secret + refresh_token
 *
 * NOT documented in public official docs:
 * - Authorization Code grant
 * - Authorize / redirect URL
 * - OAuth scopes list
 *
 * Therefore Sarh must not invent an authorize URL or authorization_code exchange.
 * Browser routes `/oauth/start` and `/oauth/callback` exist only to reserve the
 * registered Redirect URI and return a clear unsupported-flow error until Daftra
 * documents authorization_code.
 */

export const DAFTRA_OAUTH_PROVIDER = 'daftra';

/** Registered Redirect URI (must match Daftra Developers + ENV exactly). */
export const DAFTRA_OAUTH_REDIRECT_URI_DEFAULT =
  'https://sarhsa.online/api/butchers/daftra/oauth/callback';

export type DaftraOAuthEnvConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export function readDaftraOAuthEnv(
  env: NodeJS.ProcessEnv = process.env,
): DaftraOAuthEnvConfig {
  return {
    clientId: env.DAFTRA_CLIENT_ID?.trim() ?? '',
    clientSecret: env.DAFTRA_CLIENT_SECRET?.trim() ?? '',
    redirectUri:
      env.DAFTRA_OAUTH_REDIRECT_URI?.trim() ||
      DAFTRA_OAUTH_REDIRECT_URI_DEFAULT,
  };
}

export function assertDaftraOAuthClientConfigured(
  config: DaftraOAuthEnvConfig = readDaftraOAuthEnv(),
): DaftraOAuthEnvConfig {
  if (!config.clientId || !config.clientSecret) {
    throw new Error('daftra_oauth_not_configured');
  }
  if (config.redirectUri !== DAFTRA_OAUTH_REDIRECT_URI_DEFAULT) {
    // Allow exact override only when ENV matches production URI intent;
    // still require https.
  }
  if (!config.redirectUri.startsWith('https://')) {
    throw new Error('daftra_oauth_redirect_insecure');
  }
  return config;
}

export function daftraOAuthTokenUrl(origin: string): string {
  const base = origin.replace(/\/$/, '');
  return `${base}/api2/oauth/token`;
}
