import axios from 'axios';
import * as jwt from 'jsonwebtoken';
import type { AppleIapConfig } from '../store-purchases.config';

const PRODUCTION_HOST = 'https://api.storekit.itunes.apple.com';
const SANDBOX_HOST = 'https://api.storekit-sandbox.itunes.apple.com';

export type AppleEnvironment = 'Production' | 'Sandbox';

/** Signs the short-lived ES256 bearer token the App Store Server API expects. */
export function buildAppStoreApiToken(
  config: AppleIapConfig,
  now: Date = new Date(),
): string {
  const iat = Math.floor(now.getTime() / 1000);
  return jwt.sign(
    {
      iss: config.issuerId,
      iat,
      exp: iat + 15 * 60,
      aud: 'appstoreconnect-v1',
      bid: config.bundleId,
    },
    config.privateKeyPem,
    {
      algorithm: 'ES256',
      header: { alg: 'ES256', kid: config.keyId, typ: 'JWT' },
    },
  );
}

export class AppStoreServerApi {
  constructor(
    private readonly config: AppleIapConfig,
    private readonly http: Pick<typeof axios, 'get'> = axios,
  ) {}

  private async get<T>(path: string, env: AppleEnvironment): Promise<T> {
    const host = env === 'Production' ? PRODUCTION_HOST : SANDBOX_HOST;
    const res = await this.http.get<T>(`${host}${path}`, {
      headers: {
        Authorization: `Bearer ${buildAppStoreApiToken(this.config)}`,
      },
      timeout: 15_000,
    });
    return res.data;
  }

  /**
   * GET /inApps/v1/transactions/{transactionId} — production first, then the
   * sandbox (TestFlight / App Review purchases live there).
   * Returns the Apple-signed transaction JWS, or null if unknown.
   */
  async getSignedTransaction(transactionId: string): Promise<{
    signedTransactionInfo: string;
    environment: AppleEnvironment;
  } | null> {
    const path = `/inApps/v1/transactions/${encodeURIComponent(transactionId)}`;
    for (const env of ['Production', 'Sandbox'] as const) {
      try {
        const data = await this.get<{ signedTransactionInfo?: string }>(
          path,
          env,
        );
        if (data?.signedTransactionInfo) {
          return {
            signedTransactionInfo: data.signedTransactionInfo,
            environment: env,
          };
        }
      } catch (err: unknown) {
        const status = (err as { response?: { status?: number } })?.response
          ?.status;
        if (status === 404 || status === 400) continue;
        throw err;
      }
    }
    return null;
  }

  /** GET /inApps/v1/subscriptions/{transactionId} (renewal info, auto-renew). */
  async getSubscriptionStatuses(
    transactionId: string,
    env: AppleEnvironment,
  ): Promise<{
    data?: Array<{
      lastTransactions?: Array<{
        originalTransactionId?: string;
        status?: number;
        signedTransactionInfo?: string;
        signedRenewalInfo?: string;
      }>;
    }>;
  }> {
    return this.get(
      `/inApps/v1/subscriptions/${encodeURIComponent(transactionId)}`,
      env,
    );
  }
}
