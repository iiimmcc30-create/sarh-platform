/**
 * Network International (N-Genius) API client.
 * Flow: access-token (Basic) → create order (Bearer) → payment page URL.
 */
import axios from 'axios';
import {
  NI_RETRY_ATTEMPTS,
  NI_RETRY_BASE_DELAY_MS,
} from '../integrations/constants/integration.constants';
import { withExponentialBackoff } from '../integrations/utils/retry.util';

function isAxiosTimeout(err: unknown): boolean {
  return (
    axios.isAxiosError(err) &&
    (err.code === 'ECONNABORTED' ||
      err.code === 'ETIMEDOUT' ||
      err.code === 'ECONNRESET')
  );
}

export type NiCheckoutInput = {
  amount: number;
  currency: string;
  orderReference: string;
  description: string;
  redirectUrl: string;
  cancelUrl: string;
  firstName?: string;
  email?: string;
  paymentMethods?: string[];
  customData?: Record<string, unknown>;
};

export type NiLogFn = (event: string, data: Record<string, unknown>) => void;

export type NiOrderVerification = {
  valid: boolean;
  reason?: string;
  state?: string;
  checkoutUrl?: string;
  niOrderReference?: string;
  httpStatus?: number;
  errorBody?: unknown;
};

export class NiGatewayError extends Error {
  readonly httpStatus?: number;
  readonly niBody?: unknown;
  readonly phase: 'config' | 'auth' | 'create_order' | 'fetch_order';

  constructor(
    message: string,
    phase: NiGatewayError['phase'],
    httpStatus?: number,
    niBody?: unknown,
  ) {
    super(message);
    this.name = 'NiGatewayError';
    this.phase = phase;
    this.httpStatus = httpStatus;
    this.niBody = niBody;
  }
}

const NI_SUCCESS_STATES = new Set([
  'CAPTURED',
  'AUTHORISED',
  'PURCHASED',
  'PAID',
  'SUCCESS',
]);

const NI_FAILURE_STATES = new Set([
  'FAILED',
  'REVERSED',
  'CANCELLED',
  'EXPIRED',
  'CLOSED',
]);

/** True only when NI credentials are missing / placeholders — not based on NODE_ENV. */
export function isNiSandboxMockMode(): boolean {
  const key = process.env.NI_API_KEY?.trim() ?? '';
  return !key || key.startsWith('test_') || key === 'change-me';
}

function gatewayBase(): string {
  const raw =
    process.env.NI_BASE_URL?.trim() ||
    'https://api-gateway.ksa.ngenius-payments.com';
  return raw
    .replace(/\/+$/, '')
    .replace(/\/networkapi$/i, '')
    .replace(/\/transactions$/i, '');
}

export function detectNiEnvironment(): 'sandbox' | 'production' {
  const base = gatewayBase().toLowerCase();
  return /sandbox|uat|test/.test(base) ? 'sandbox' : 'production';
}

/**
 * Ensure NI_BASE_URL, NI_OUTLET_ID and NI_API_KEY belong to the same environment.
 */
export function validateNiEnvironment(log?: NiLogFn): void {
  if (isNiSandboxMockMode()) return;

  const baseUrl = gatewayBase();
  const env = detectNiEnvironment();
  const apiKey = process.env.NI_API_KEY?.trim() ?? '';
  const outletId = process.env.NI_OUTLET_ID?.trim() ?? '';

  log?.('environment_check', {
    niBaseUrl: baseUrl,
    niEnvironment: env,
    niOutletId: outletId ? `${outletId.slice(0, 4)}…` : 'missing',
    hasApiKey: Boolean(apiKey),
    niRealm: process.env.NI_REALM?.trim() || 'default',
  });

  if (!outletId) {
    throw new NiGatewayError('NI_OUTLET_ID is not configured', 'config');
  }

  if (!apiKey) {
    throw new NiGatewayError('NI_API_KEY is not configured', 'config');
  }

  const keyLooksSandbox =
    apiKey.startsWith('test_') || apiKey.toLowerCase().includes('sandbox');

  if (env === 'production' && keyLooksSandbox) {
    throw new NiGatewayError(
      'NI environment mismatch: production NI_BASE_URL with sandbox-style NI_API_KEY',
      'config',
    );
  }
}

function basicAuthHeader(): string {
  const preencoded = process.env.NI_BASIC_AUTH?.trim();
  if (preencoded) {
    return preencoded.startsWith('Basic ') ? preencoded : `Basic ${preencoded}`;
  }

  const key = process.env.NI_API_KEY?.trim() ?? '';
  const looksBase64 =
    /^[A-Za-z0-9+/]+=*$/.test(key) && key.length >= 40 && !key.includes('-');

  if (looksBase64) return `Basic ${key}`;

  return `Basic ${Buffer.from(`${key}:`).toString('base64')}`;
}

function extractCheckoutUrl(data: Record<string, unknown>): string | undefined {
  const links = (data?._links ?? {}) as Record<string, { href?: string }>;
  return (
    links.payment?.href ||
    links['payment:card']?.href ||
    links['cnp:payment-link']?.href ||
    (data.paymentLink as string | undefined) ||
    (data.url as string | undefined)
  );
}

/** Sarh internal merchant refs (Payment.orderId) — not valid in NI GET /orders/{ref}. */
const INTERNAL_MERCHANT_PREFIXES = [
  'SFAT',
  'FTR',
  'PRM',
  'PIN',
  'BOTH',
] as const;

const NI_ORDER_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isNiOrderUuid(ref: string | null | undefined): boolean {
  const trimmed = ref?.trim();
  return Boolean(trimmed && NI_ORDER_UUID.test(trimmed));
}

export function isInternalMerchantOrderReference(
  ref: string | null | undefined,
): boolean {
  const trimmed = ref?.trim();
  if (!trimmed) return false;
  return INTERNAL_MERCHANT_PREFIXES.some((prefix) =>
    trimmed.startsWith(`${prefix}-`),
  );
}

/** Resolve the NI system order UUID from a create-order or fetch-order payload. */
export function extractNiOrderReference(
  data: Record<string, unknown>,
): string | null {
  const candidates: Array<string | undefined> = [];

  const reference = data.reference as string | undefined;
  if (reference) candidates.push(reference);

  const id = data._id as string | undefined;
  if (id) {
    candidates.push(id.replace(/^urn:order:/i, ''));
    const hrefMatch = id.match(/\/orders\/([0-9a-f-]{36})/i);
    if (hrefMatch?.[1]) candidates.push(hrefMatch[1]);
  }

  const orderReference = data.orderReference as string | undefined;
  if (orderReference) candidates.push(orderReference);

  const selfHref = (
    data._links as Record<string, { href?: string }> | undefined
  )?.self?.href;
  if (selfHref) {
    const hrefMatch = selfHref.match(/\/orders\/([0-9a-f-]{36})/i);
    if (hrefMatch?.[1]) candidates.push(hrefMatch[1]);
  }

  for (const candidate of candidates) {
    if (isNiOrderUuid(candidate)) return candidate!.trim();
  }

  return null;
}

function logHttpError(
  log: NiLogFn | undefined,
  event: string,
  status: number,
  body: unknown,
  extra?: Record<string, unknown>,
) {
  log?.(event, {
    httpStatus: status,
    niResponseBody: body,
    ...extra,
  });
}

async function getAccessToken(log?: NiLogFn): Promise<string> {
  validateNiEnvironment(log);

  const url = `${gatewayBase()}/identity/auth/access-token`;
  const auth = basicAuthHeader();
  const realm =
    process.env.NI_REALM?.trim() ||
    (gatewayBase().includes('sandbox') ? 'ni' : 'ni');

  log?.('auth_request', {
    url,
    realm,
    niEnvironment: detectNiEnvironment(),
  });

  const attempts: Array<{ body: unknown; contentType: string }> = [
    {
      body: { grant_type: 'client_credentials', realm },
      contentType: 'application/vnd.ni-identity.v1+json',
    },
    {
      body: { realmName: realm },
      contentType: 'application/vnd.ni-identity.v1+json',
    },
    {
      body: { grant_type: 'client_credentials', realm: 'networkinternational' },
      contentType: 'application/vnd.ni-identity.v1+json',
    },
    {
      body: { realmName: 'networkinternational' },
      contentType: 'application/vnd.ni-identity.v1+json',
    },
    {
      body: {},
      contentType: 'application/vnd.ni-identity.v1+json',
    },
  ];

  let lastDetail = '';
  let lastStatus = 0;
  let lastBody: unknown = null;

  for (const attempt of attempts) {
    const { data, status } = await axios.post(url, attempt.body, {
      headers: {
        Authorization: auth,
        'Content-Type': attempt.contentType,
        Accept: 'application/vnd.ni-identity.v1+json',
      },
      timeout: 12000,
      validateStatus: () => true,
    });

    log?.('auth_response', {
      httpStatus: status,
      attemptBody: attempt.body,
      niResponseBody: data,
    });

    if (data?.access_token) {
      log?.('auth_success', { httpStatus: status });
      return data.access_token as string;
    }

    lastStatus = status;
    lastBody = data;
    lastDetail =
      data?.errors?.[0]?.message ||
      data?.message ||
      JSON.stringify(data || { status }).slice(0, 300);
  }

  logHttpError(log, 'auth_failed', lastStatus, lastBody);
  throw new NiGatewayError(
    `NI access token failed — تحقق من NI_API_KEY / NI_BASIC_AUTH / NI_REALM. (${lastDetail})`,
    'auth',
    lastStatus,
    lastBody,
  );
}

/**
 * Create an NI hosted payment order and return the checkout URL + NI order ref.
 */
export async function createNiCheckout(
  input: NiCheckoutInput,
  log?: NiLogFn,
): Promise<{
  checkoutUrl: string;
  niOrderReference: string;
}> {
  const outletId = process.env.NI_OUTLET_ID?.trim();
  if (!outletId) {
    throw new NiGatewayError('NI_OUTLET_ID is not configured', 'config');
  }

  const token = await getAccessToken(log);
  const url = `${gatewayBase()}/transactions/outlets/${outletId}/orders`;

  const body = {
    action: 'PURCHASE',
    amount: {
      currencyCode: input.currency || 'SAR',
      value: Math.round(input.amount * 100),
    },
    merchantAttributes: {
      redirectUrl: input.redirectUrl,
      cancelUrl: input.cancelUrl,
      merchantOrderReference: input.orderReference,
      skipConfirmationPage: true,
    },
    ...(input.email ? { emailAddress: input.email } : {}),
    ...(input.firstName
      ? {
          billingAddress: {
            firstName: input.firstName,
            lastName: '.',
          },
        }
      : {}),
  };

  log?.('create_order_request', {
    url,
    merchantOrderReference: input.orderReference,
    amount: input.amount,
    currency: input.currency,
    redirectUrl: input.redirectUrl,
    cancelUrl: input.cancelUrl,
    requestBody: body,
  });

  const { data, status } = await withExponentialBackoff(
    () =>
      axios.post(url, body, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/vnd.ni-payment.v2+json',
          Accept: 'application/vnd.ni-payment.v2+json',
        },
        timeout: 15000,
        validateStatus: () => true,
      }),
    {
      attempts: NI_RETRY_ATTEMPTS,
      baseDelayMs: NI_RETRY_BASE_DELAY_MS,
      getStatus: (r) => r.status,
      isTimeout: isAxiosTimeout,
    },
  );

  log?.('create_order_response', {
    httpStatus: status,
    niResponseBody: data,
    merchantOrderReference: input.orderReference,
  });

  if (status >= 400) {
    const detail =
      data?.errors?.[0]?.localizedMessage ||
      data?.errors?.[0]?.message ||
      data?.message ||
      JSON.stringify(data || {}).slice(0, 400);
    throw new NiGatewayError(
      `NI create order failed (${status}): ${detail}`,
      'create_order',
      status,
      data,
    );
  }

  const checkoutUrl = extractCheckoutUrl(
    (data ?? {}) as Record<string, unknown>,
  );
  if (!checkoutUrl) {
    throw new NiGatewayError(
      'NI returned no payment link',
      'create_order',
      status,
      data,
    );
  }

  const niOrderReference = extractNiOrderReference(
    (data ?? {}) as Record<string, unknown>,
  );
  if (!niOrderReference) {
    throw new NiGatewayError(
      'NI create order response missing UUID order reference',
      'create_order',
      status,
      data,
    );
  }

  log?.('create_order_success', {
    httpStatus: status,
    paymentUrl: checkoutUrl,
    orderReference: niOrderReference,
    merchantOrderReference: input.orderReference,
  });

  return { checkoutUrl, niOrderReference };
}

/**
 * Fetch order status from NI (for sync / verification).
 */
export async function fetchNiOrder(
  orderRef: string,
  log?: NiLogFn,
): Promise<unknown> {
  const { data, status } = await fetchNiOrderRaw(orderRef, log);
  if (status >= 400) {
    throw new NiGatewayError(
      `NI order fetch failed (${status})`,
      'fetch_order',
      status,
      data,
    );
  }
  return data;
}

async function fetchNiOrderRaw(
  orderRef: string,
  log?: NiLogFn,
): Promise<{ data: unknown; status: number }> {
  const trimmed = orderRef.trim();
  if (!isNiOrderUuid(trimmed)) {
    throw new NiGatewayError(
      isInternalMerchantOrderReference(trimmed)
        ? `Invalid NI order reference: internal merchant ref "${trimmed}" cannot be used in GET /orders/{ref}`
        : `Invalid NI order reference: expected UUID, got "${trimmed}"`,
      'fetch_order',
      400,
    );
  }

  const outletId = process.env.NI_OUTLET_ID?.trim();
  if (!outletId) {
    throw new NiGatewayError('NI_OUTLET_ID is not configured', 'config');
  }

  const token = await getAccessToken(log);
  const url = `${gatewayBase()}/transactions/outlets/${outletId}/orders/${encodeURIComponent(orderRef)}`;

  log?.('fetch_order_request', { url, orderReference: orderRef });

  const { data, status } = await withExponentialBackoff(
    () =>
      axios.get(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.ni-payment.v2+json',
        },
        timeout: 12000,
        validateStatus: () => true,
      }),
    {
      attempts: NI_RETRY_ATTEMPTS,
      baseDelayMs: NI_RETRY_BASE_DELAY_MS,
      getStatus: (r) => r.status,
      isTimeout: isAxiosTimeout,
    },
  );

  log?.('fetch_order_response', {
    httpStatus: status,
    orderReference: orderRef,
    niResponseBody: data,
    orderState: (data as Record<string, unknown>)?.state,
  });

  return { data, status };
}

/**
 * Verify an existing NI order is still valid for hosted checkout reuse.
 */
export async function verifyNiOrderForCheckout(
  params: {
    niOrderRef: string;
    storedCheckoutUrl?: string | null;
    merchantOrderReference?: string | null;
  },
  log?: NiLogFn,
): Promise<NiOrderVerification> {
  const { niOrderRef, storedCheckoutUrl, merchantOrderReference } = params;

  if (!niOrderRef?.trim() || !isNiOrderUuid(niOrderRef)) {
    return { valid: false, reason: 'missing_ni_order_ref' };
  }

  if (!storedCheckoutUrl?.trim()) {
    return { valid: false, reason: 'missing_checkout_url' };
  }

  try {
    validateNiEnvironment(log);
    const { data, status } = await fetchNiOrderRaw(niOrderRef.trim(), log);
    const order = (data ?? {}) as Record<string, unknown>;
    const state = resolveNiOrderState(order);

    if (status === 404) {
      return {
        valid: false,
        reason: 'order_not_found',
        httpStatus: status,
        state,
        errorBody: data,
      };
    }

    if (status === 401 || status === 403) {
      return {
        valid: false,
        reason: 'ni_unauthorized',
        httpStatus: status,
        state,
        errorBody: data,
      };
    }

    if (status >= 400) {
      return {
        valid: false,
        reason: 'ni_fetch_error',
        httpStatus: status,
        state,
        errorBody: data,
      };
    }

    if (NI_SUCCESS_STATES.has(state)) {
      return {
        valid: false,
        reason: 'already_paid',
        state,
        niOrderReference: extractNiOrderReference(order) ?? niOrderRef,
        errorBody: data,
      };
    }

    if (NI_FAILURE_STATES.has(state)) {
      return {
        valid: false,
        reason: 'order_not_usable',
        state,
        niOrderReference: extractNiOrderReference(order) ?? niOrderRef,
        errorBody: data,
      };
    }

    const liveCheckoutUrl = extractCheckoutUrl(order);
    if (!liveCheckoutUrl) {
      return {
        valid: false,
        reason: 'no_payment_url_on_order',
        state,
        niOrderReference: extractNiOrderReference(order) ?? niOrderRef,
        errorBody: data,
      };
    }

    const resolvedRef = extractNiOrderReference(order) ?? niOrderRef;
    log?.('verify_order_success', {
      orderReference: resolvedRef,
      merchantOrderReference,
      paymentUrl: liveCheckoutUrl,
      orderState: state,
      httpStatus: status,
    });

    return {
      valid: true,
      state,
      checkoutUrl: liveCheckoutUrl,
      niOrderReference: resolvedRef,
      httpStatus: status,
    };
  } catch (err: unknown) {
    const axiosErr = axios.isAxiosError(err) ? err : null;
    const status = axiosErr?.response?.status;
    const body = axiosErr?.response?.data;
    log?.('verify_order_error', {
      orderReference: niOrderRef,
      httpStatus: status,
      error: err instanceof Error ? err.message : String(err),
      niResponseBody: body,
    });
    return {
      valid: false,
      reason: 'verification_exception',
      httpStatus: status,
      errorBody: body ?? (err instanceof Error ? err.message : String(err)),
    };
  }
}

export function extractNiPaymentStates(
  order: Record<string, unknown>,
): string[] {
  const states: string[] = [];
  const push = (value: unknown) => {
    if (value == null || value === '') return;
    states.push(String(value).toUpperCase());
  };

  push(order.paymentState);
  push(order.state);
  push(order.status);

  const embedded = order._embedded as Record<string, unknown> | undefined;
  const payments = embedded?.payment;
  if (Array.isArray(payments)) {
    for (const row of payments) {
      const payment = row as Record<string, unknown>;
      push(payment.state);
      push(payment.paymentState);
    }
  } else if (payments && typeof payments === 'object') {
    const payment = payments as Record<string, unknown>;
    push(payment.state);
    push(payment.paymentState);
  }

  return states;
}

/**
 * Resolve the effective NI state: prefer payment-level CAPTURED/PURCHASED/PAID/SUCCESS
 * over order-level STARTED/OPEN when NI returns nested payment objects.
 */
export function resolveNiOrderState(order: Record<string, unknown>): string {
  const states = extractNiPaymentStates(order);
  const fulfillmentSuccess = ['CAPTURED', 'PURCHASED', 'PAID', 'SUCCESS'];

  for (const state of states) {
    if (fulfillmentSuccess.includes(state)) return state;
  }
  for (const state of states) {
    if (classifyNiOrderState(state) === 'failed') return state;
  }
  return states[0] ?? '';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch NI order and poll until terminal state or max attempts (post-return-url sync).
 */
export async function fetchNiOrderResolved(
  orderRef: string,
  log?: NiLogFn,
  options?: { maxAttempts?: number; delayMs?: number },
): Promise<{ order: Record<string, unknown>; state: string }> {
  const maxAttempts = options?.maxAttempts ?? 4;
  const delayMs = options?.delayMs ?? 2000;
  let order: Record<string, unknown> = {};
  let state = '';

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    order = (await fetchNiOrder(orderRef, log)) as Record<string, unknown>;
    state = resolveNiOrderState(order);
    const outcome = classifyNiOrderState(state);
    if (outcome !== 'processing' || attempt >= maxAttempts - 1) break;
    log?.('fetch_order_poll', {
      orderReference: orderRef,
      attempt: attempt + 1,
      paymentState: state,
      orderState: order.state,
    });
    await sleep(delayMs);
  }

  return { order, state };
}

export function classifyNiOrderState(
  state: string,
): 'success' | 'failed' | 'processing' {
  const s = state.toUpperCase();
  if (['CAPTURED', 'PURCHASED', 'PAID', 'SUCCESS'].includes(s))
    return 'success';
  if (
    [
      'FAILED',
      'DECLINED',
      'CANCELLED',
      'EXPIRED',
      'REVERSED',
      'CLOSED',
    ].includes(s)
  ) {
    return 'failed';
  }
  return 'processing';
}

export function niOrderStateLabelAr(
  outcome: ReturnType<typeof classifyNiOrderState>,
): string {
  switch (outcome) {
    case 'success':
      return 'تم الدفع بنجاح';
    case 'failed':
      return 'فشلت عملية الدفع';
    default:
      return 'العملية قيد المعالجة';
  }
}

export function formatNiGatewayError(err: unknown): string {
  if (err instanceof NiGatewayError) {
    const statusPart = err.httpStatus ? ` (${err.httpStatus})` : '';
    return `${err.message}${statusPart}`;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}
