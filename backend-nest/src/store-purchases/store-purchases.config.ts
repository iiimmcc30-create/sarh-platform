/**
 * Env-driven configuration for Apple IAP / Google Play Billing verification.
 * Only names are documented in the env templates — never log the values.
 */

export const STORE_IAP_ENV = {
  appleIssuerId: 'APPLE_IAP_ISSUER_ID',
  appleKeyId: 'APPLE_IAP_KEY_ID',
  applePrivateKey: 'APPLE_IAP_PRIVATE_KEY',
  appleBundleId: 'APPLE_IAP_BUNDLE_ID',
  appleAppAppleId: 'APPLE_IAP_APP_APPLE_ID',
  googlePackageName: 'GOOGLE_PLAY_PACKAGE_NAME',
  googleServiceAccountJson: 'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON',
  googleRtdnAudience: 'GOOGLE_PLAY_RTDN_AUDIENCE',
  googleRtdnServiceAccount: 'GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT',
} as const;

export const DEFAULT_BUNDLE_ID = 'com.sarh.app';

export type AppleIapConfig = {
  issuerId: string;
  keyId: string;
  privateKeyPem: string;
  bundleId: string;
  appAppleId: number | null;
};

export type GooglePlayConfig = {
  packageName: string;
  serviceAccount: Record<string, unknown> | null;
  rtdnAudience: string | null;
  rtdnServiceAccount: string | null;
};

function env(name: string, source: NodeJS.ProcessEnv): string {
  return (source[name] ?? '').trim();
}

/** Accepts a PEM with real newlines, escaped "\n", or base64 of the PEM. */
export function normalizePrivateKey(raw: string): string {
  const value = raw.trim().replace(/^"|"$/g, '');
  if (!value) return '';
  if (value.includes('BEGIN')) return value.replace(/\\n/g, '\n');
  try {
    const decoded = Buffer.from(value, 'base64').toString('utf8');
    if (decoded.includes('BEGIN')) return decoded;
  } catch {
    /* fall through */
  }
  return value;
}

/** Accepts raw JSON or base64-encoded JSON. */
export function parseServiceAccountJson(
  raw: string,
): Record<string, unknown> | null {
  const value = raw.trim();
  if (!value) return null;
  const candidates = [value];
  if (!value.startsWith('{')) {
    try {
      candidates.push(Buffer.from(value, 'base64').toString('utf8'));
    } catch {
      /* ignore */
    }
  }
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (parsed && typeof parsed === 'object') {
        return parsed as Record<string, unknown>;
      }
    } catch {
      /* try next */
    }
  }
  return null;
}

/** Bundle id is always known (used to validate JWS even without API keys). */
export function appleBundleId(source: NodeJS.ProcessEnv = process.env): string {
  return env(STORE_IAP_ENV.appleBundleId, source) || DEFAULT_BUNDLE_ID;
}

export function readAppleIapConfig(
  source: NodeJS.ProcessEnv = process.env,
): AppleIapConfig | null {
  const issuerId = env(STORE_IAP_ENV.appleIssuerId, source);
  const keyId = env(STORE_IAP_ENV.appleKeyId, source);
  const privateKeyPem = normalizePrivateKey(
    env(STORE_IAP_ENV.applePrivateKey, source),
  );
  if (!issuerId || !keyId || !privateKeyPem) return null;
  const appAppleIdRaw = env(STORE_IAP_ENV.appleAppAppleId, source);
  const appAppleId = /^\d+$/.test(appAppleIdRaw) ? Number(appAppleIdRaw) : null;
  return {
    issuerId,
    keyId,
    privateKeyPem,
    bundleId: appleBundleId(source),
    appAppleId,
  };
}

export function readGooglePlayConfig(
  source: NodeJS.ProcessEnv = process.env,
): GooglePlayConfig {
  return {
    packageName:
      env(STORE_IAP_ENV.googlePackageName, source) || DEFAULT_BUNDLE_ID,
    serviceAccount: parseServiceAccountJson(
      env(STORE_IAP_ENV.googleServiceAccountJson, source),
    ),
    rtdnAudience: env(STORE_IAP_ENV.googleRtdnAudience, source) || null,
    rtdnServiceAccount:
      env(STORE_IAP_ENV.googleRtdnServiceAccount, source) || null,
  };
}

/** Non-fatal production warnings (IAP is optional until the stores go live). */
export function storeIapEnvWarnings(
  source: NodeJS.ProcessEnv = process.env,
): string[] {
  const warnings: string[] = [];
  const appleKeys = [
    STORE_IAP_ENV.appleIssuerId,
    STORE_IAP_ENV.appleKeyId,
    STORE_IAP_ENV.applePrivateKey,
  ];
  const appleSet = appleKeys.filter((k) => env(k, source));
  if (appleSet.length === 0) {
    warnings.push(
      `Apple IAP disabled: set ${appleKeys.join(', ')} to verify App Store purchases`,
    );
  } else if (appleSet.length < appleKeys.length) {
    warnings.push(
      `Apple IAP partially configured: missing ${appleKeys
        .filter((k) => !env(k, source))
        .join(', ')}`,
    );
  } else if (!readAppleIapConfig(source)) {
    warnings.push(`${STORE_IAP_ENV.applePrivateKey} is not a valid .p8 PEM`);
  }
  const gRaw = env(STORE_IAP_ENV.googleServiceAccountJson, source);
  if (!gRaw) {
    warnings.push(
      `Google Play Billing disabled: set ${STORE_IAP_ENV.googleServiceAccountJson}`,
    );
  } else if (!parseServiceAccountJson(gRaw)) {
    warnings.push(
      `${STORE_IAP_ENV.googleServiceAccountJson} is not valid JSON (raw or base64)`,
    );
  }
  if (gRaw && !env(STORE_IAP_ENV.googleRtdnAudience, source)) {
    warnings.push(
      `${STORE_IAP_ENV.googleRtdnAudience} empty: Google RTDN push endpoint will reject notifications`,
    );
  }
  return warnings;
}
