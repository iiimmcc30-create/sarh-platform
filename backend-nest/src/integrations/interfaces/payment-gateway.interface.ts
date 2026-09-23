export type HostedCheckoutResult = {
  checkoutUrl: string;
  /** NI system order UUID — never a Sarh FTR-/SFAT- merchant ref. */
  externalOrderId: string;
  merchantOrderReference: string;
  reused: boolean;
  mock: boolean;
};

export type PaymentGatewayCreateInput = {
  merchantOrderReference: string;
  amount: number;
  currency: string;
  description: string;
  redirectUrl: string;
  cancelUrl: string;
  firstName?: string;
  email?: string;
  customData?: Record<string, unknown>;
};

export type PaymentGatewayCreateResult = {
  checkoutUrl: string;
  externalOrderId: string;
  raw: Record<string, unknown>;
};

export interface PaymentGateway {
  readonly provider: 'ni';
  createCheckout(
    input: PaymentGatewayCreateInput,
  ): Promise<PaymentGatewayCreateResult>;
  fetchOrder(externalOrderId: string): Promise<Record<string, unknown>>;
}

export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');
