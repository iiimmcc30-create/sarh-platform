import { GoogleAuth, OAuth2Client } from 'google-auth-library';
import type { GooglePlayConfig } from '../store-purchases.config';

const ANDROID_PUBLISHER_SCOPE =
  'https://www.googleapis.com/auth/androidpublisher';
const BASE =
  'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';

/** purchases.products.get (one-time / consumable). */
export type GoogleProductPurchase = {
  orderId?: string;
  purchaseState?: number; // 0 purchased, 1 cancelled, 2 pending
  consumptionState?: number; // 0 yet to be consumed, 1 consumed
  acknowledgementState?: number;
  purchaseTimeMillis?: string;
  purchaseType?: number; // 0 test (license tester)
  obfuscatedExternalAccountId?: string;
  productId?: string;
  regionCode?: string;
};

/** purchases.subscriptionsv2.get. */
export type GoogleSubscriptionPurchaseV2 = {
  subscriptionState?:
    | 'SUBSCRIPTION_STATE_UNSPECIFIED'
    | 'SUBSCRIPTION_STATE_PENDING'
    | 'SUBSCRIPTION_STATE_ACTIVE'
    | 'SUBSCRIPTION_STATE_PAUSED'
    | 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD'
    | 'SUBSCRIPTION_STATE_ON_HOLD'
    | 'SUBSCRIPTION_STATE_CANCELED'
    | 'SUBSCRIPTION_STATE_EXPIRED'
    | 'SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED';
  latestOrderId?: string;
  linkedPurchaseToken?: string;
  startTime?: string;
  acknowledgementState?: string;
  testPurchase?: Record<string, unknown>;
  externalAccountIdentifiers?: { obfuscatedExternalAccountId?: string };
  lineItems?: Array<{
    productId?: string;
    expiryTime?: string;
    autoRenewingPlan?: { autoRenewEnabled?: boolean };
    offerDetails?: { basePlanId?: string; offerId?: string };
  }>;
};

export class GooglePlayApiNotConfigured extends Error {
  constructor() {
    super('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is not set');
  }
}

export class GooglePlayApi {
  private auth: GoogleAuth | null = null;
  private readonly oidc = new OAuth2Client();

  constructor(private readonly config: GooglePlayConfig) {}

  get configured(): boolean {
    return !!this.config.serviceAccount;
  }

  private async request<T>(
    url: string,
    method: 'GET' | 'POST' = 'GET',
  ): Promise<T> {
    if (!this.config.serviceAccount) throw new GooglePlayApiNotConfigured();
    if (!this.auth) {
      this.auth = new GoogleAuth({
        credentials: this.config.serviceAccount as Record<string, string>,
        scopes: [ANDROID_PUBLISHER_SCOPE],
      });
    }
    const client = await this.auth.getClient();
    const res = await client.request<T>({ url, method, timeout: 15_000 });
    return res.data;
  }

  private base(): string {
    return `${BASE}/${encodeURIComponent(this.config.packageName)}`;
  }

  getProductPurchase(productId: string, token: string) {
    return this.request<GoogleProductPurchase>(
      `${this.base()}/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(token)}`,
    );
  }

  getSubscriptionV2(token: string) {
    return this.request<GoogleSubscriptionPurchaseV2>(
      `${this.base()}/purchases/subscriptionsv2/tokens/${encodeURIComponent(token)}`,
    );
  }

  /**
   * Verifies the Pub/Sub push OIDC token ("Authorization: Bearer ...") —
   * audience = GOOGLE_PLAY_RTDN_AUDIENCE and, when configured, the push
   * service-account email.
   */
  async verifyPubSubPushToken(bearer: string | undefined): Promise<boolean> {
    if (!this.config.rtdnAudience) return false;
    const token = (bearer ?? '').replace(/^Bearer\s+/i, '').trim();
    if (!token) return false;
    try {
      const ticket = await this.oidc.verifyIdToken({
        idToken: token,
        audience: this.config.rtdnAudience,
      });
      const payload = ticket.getPayload();
      if (!payload) return false;
      if (
        this.config.rtdnServiceAccount &&
        (payload.email !== this.config.rtdnServiceAccount ||
          payload.email_verified !== true)
      ) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }
}
