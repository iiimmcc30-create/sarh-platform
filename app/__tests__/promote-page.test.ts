import { readFileSync } from 'fs';
import path from 'path';
import {
  PROMOTE_CHECKOUT_CANCELLED_AR,
  PROMOTE_CHECKOUT_FAILED_AR,
  PROMOTE_GATEWAY_ERROR_AR,
  PROMOTE_GENERIC_ERROR_AR,
  PROMOTE_NETWORK_ERROR_AR,
  PROMOTE_SERVICE_COPY,
  PROMOTE_SESSION_ERROR_AR,
  createSubmitGuard,
  durationPhrase,
  formatSar,
  promoteCheckoutOutcomeMessage,
  promotePaymentErrorMessage,
} from '@/lib/promotePage';
import { PromotePaymentError } from '@/services/listingPromote';
import { listPromoteCatalogOptions } from '@/services/promoteCatalog';

const screen = readFileSync(path.join(__dirname, '../app/listing/[id]/promote.tsx'), 'utf8');
const service = readFileSync(path.join(__dirname, '../services/listingPromote.ts'), 'utf8');

describe('promote page helpers', () => {
  it('formats SAR prices and durations', () => {
    expect(formatSar(19)).toBe('19 ر.س');
    expect(formatSar(9.5)).toBe('9.50 ر.س');
    expect(durationPhrase('يوم واحد')).toBe('لمدة يوم واحد');
  });

  it('has copy for exactly the catalog services (no invented services)', () => {
    const goals = PROMOTE_SERVICE_COPY.map((c) => c.goal).sort();
    expect(goals).toEqual(['featured', 'pinned', 'visibility']);
    for (const goal of goals) {
      expect(listPromoteCatalogOptions(goal as 'featured').length).toBeGreaterThan(0);
    }
  });

  it('maps the N-Genius gateway failure (502 payment_gateway_error) to friendly Arabic', () => {
    const raw = 'NI create order failed (422): {error.processing.inactiveOutlet} (422)';
    const err = new PromotePaymentError(raw, 'payment_gateway_error', 502);
    expect(promotePaymentErrorMessage(err)).toBe(PROMOTE_GATEWAY_ERROR_AR);
    // Even without code/status the raw gateway text never reaches users.
    expect(promotePaymentErrorMessage(new Error(raw))).toBe(PROMOTE_GENERIC_ERROR_AR);
    expect(promotePaymentErrorMessage(new Error('تعذّر: {error.x} (422)'))).toBe(PROMOTE_GENERIC_ERROR_AR);
  });

  it('maps session, network and unknown errors', () => {
    expect(promotePaymentErrorMessage(new PromotePaymentError('x', 'unauthorized', 401))).toBe(
      PROMOTE_SESSION_ERROR_AR,
    );
    expect(promotePaymentErrorMessage(new TypeError('Network request failed'))).toBe(
      PROMOTE_NETWORK_ERROR_AR,
    );
    expect(promotePaymentErrorMessage(new Error('TypeError: undefined is not a function'))).toBe(
      PROMOTE_GENERIC_ERROR_AR,
    );
    expect(promotePaymentErrorMessage(undefined)).toBe(PROMOTE_GENERIC_ERROR_AR);
    expect(promotePaymentErrorMessage(new PromotePaymentError('الإعلان غير موجود', 'listing_not_found', 404))).toBe(
      'الإعلان غير موجود',
    );
  });

  it('maps checkout outcomes', () => {
    expect(promoteCheckoutOutcomeMessage('failed')).toEqual({ tone: 'error', text: PROMOTE_CHECKOUT_FAILED_AR });
    expect(promoteCheckoutOutcomeMessage('cancelled')).toEqual({ tone: 'info', text: PROMOTE_CHECKOUT_CANCELLED_AR });
    expect(promoteCheckoutOutcomeMessage('paid')).toBeNull();
    expect(promoteCheckoutOutcomeMessage('opened')).toBeNull();
  });

  it('submit guard ignores a second run while the first is in flight', async () => {
    const guard = createSubmitGuard();
    let release!: () => void;
    const task = jest.fn(() => new Promise<string>((r) => (release = () => r('ok'))));
    const first = guard.run(task);
    expect(guard.busy).toBe(true);
    await expect(guard.run(task)).resolves.toBeUndefined();
    expect(task).toHaveBeenCalledTimes(1);
    release();
    await expect(first).resolves.toBe('ok');
    expect(guard.busy).toBe(false);
    const third = guard.run(task);
    expect(task).toHaveBeenCalledTimes(2);
    release();
    await expect(third).resolves.toBe('ok');
  });

  it('releases the guard after a failure', async () => {
    const guard = createSubmitGuard();
    await expect(guard.run(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    expect(guard.busy).toBe(false);
  });
});

describe('promote page screen', () => {
  it('uses the new header copy', () => {
    expect(screen).toContain('روّج إعلانك');
  });

  it('shows a skeleton while loading and an error state with retry', () => {
    expect(screen).toContain('testID="promote-skeleton"');
    expect(screen).toContain('testID="promote-error"');
    expect(screen).toContain('إعادة المحاولة');
    expect(screen).toContain('onRetry={retryLoad}');
  });

  it('shows the total and guards the CTA during submit', () => {
    expect(screen).toContain("summary={{ label: 'الإجمالي', value: totalLabel }}");
    expect(screen).toContain('disabled={!canPay}');
    expect(screen).toContain('loading={processing}');
    expect(screen).toContain('جاري تجهيز الدفع…');
    expect(screen).toContain('guardRef.current.run(');
    expect(screen).toMatch(/canPay = Boolean\([^)]*!processing/);
  });

  it('never shows raw server/gateway error text', () => {
    expect(screen).toContain('promotePaymentErrorMessage(err)');
    expect(screen).not.toMatch(/setNotice\([^)]*err\.message/);
    expect(screen).not.toContain('setError(err instanceof Error ? err.message');
  });

  it('keeps the existing payment wiring unchanged', () => {
    expect(screen).toContain('initiatePromotePayment(accessToken, checkoutPayload)');
    expect(screen).toContain("context: checkoutPayload.promotionGoal === 'visibility' ? 'promotion' : 'boost'");
    expect(screen).toContain('promotionAmount: String(result.amount)');
    expect(service).toContain('new PromotePaymentError(');
  });

  it('uses RN Animated only and no ListingCard', () => {
    expect(screen).not.toMatch(/react-native-reanimated/);
    expect(screen).not.toContain('ListingCard');
    expect(screen).toMatch(/Animated/);
  });
});
