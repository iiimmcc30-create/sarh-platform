import { readFileSync } from 'fs';
import path from 'path';

function src(rel: string) {
  return readFileSync(path.join(__dirname, rel), 'utf8');
}

describe('Payment core after legacy marketplace removal', () => {
  it('keeps the payments module wiring', () => {
    const mod = src('./payments.module.ts');
    expect(mod).toContain('PaymentsController');
    expect(mod).toContain('payments/webhook');
    expect(mod).toContain('IntegrationsModule');
  });

  it('keeps listing boost and promotion fulfillment', () => {
    const repo = src('./repositories/payments.repository.ts');
    expect(repo).toContain('featured_ad');
    expect(repo).toContain('pinned_ad');
    expect(repo).toContain('promoted_ad');
    expect(repo).toContain('featuredUntil');
  });

  it('has no legacy marketplace payment branches left', () => {
    const legacy = /butcher|order_commission|capturedAfterCancel/i;
    for (const rel of [
      './payments.service.ts',
      './payments.controller.ts',
      './payment-redirect.controller.ts',
      './dto/payments.dto.ts',
      './repositories/payments.repository.ts',
    ]) {
      expect(src(rel)).not.toMatch(legacy);
    }
  });
});
