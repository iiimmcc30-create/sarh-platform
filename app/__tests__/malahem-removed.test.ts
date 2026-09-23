import { existsSync, readFileSync } from 'fs';
import path from 'path';

const root = path.join(__dirname, '..');

function src(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8');
}

describe('malahem removed from Sarh app', () => {
  it('does not keep butcher marketplace screens or join flow', () => {
    expect(existsSync(path.join(root, 'app/butchers/index.tsx'))).toBe(false);
    expect(existsSync(path.join(root, 'app/butchers/chat.tsx'))).toBe(false);
    expect(existsSync(path.join(root, 'app/join/index.tsx'))).toBe(false);
    expect(existsSync(path.join(root, 'services/butcherOrders.ts'))).toBe(false);
    expect(existsSync(path.join(root, 'contexts/ButcherOwnerContext.tsx'))).toBe(false);
  });

  it('keeps the shared chat screen on /chat', () => {
    const chat = src('app/chat.tsx');
    expect(chat).toContain('useChatThreadSocket');
    expect(chat).not.toContain('/api/butchers/');
    expect(src('app/_layout.tsx')).toContain('name="chat"');
    expect(src('app/_layout.tsx')).not.toContain('name="butchers"');
  });

  it('does not request butcher home destinations', () => {
    expect(src('lib/homeExplore.ts')).not.toContain("route: '/butchers'");
    expect(src('lib/exploreSarhBanners.ts')).not.toContain("href: '/butchers'");
    expect(src('lib/homeQuickAccess.ts')).not.toContain("href: '/butchers'");
  });

  it('preserves paid listing payment client types and screens', () => {
    const payments = src('services/payments.ts');
    expect(payments).toContain("'boost'");
    expect(payments).toContain("'promotion'");
    expect(payments).toContain('syncPaymentStatus');
    expect(payments).toContain('butcher_order');
    expect(src('app/listing/[id]/promote.tsx')).toContain('initiatePromotePayment');
    expect(src('app/payment/result.tsx')).toContain("context === 'boost'");
    expect(src('app/payment/cancel.tsx')).not.toContain('abandonButcherCheckout');
  });
});
