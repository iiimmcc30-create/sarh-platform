import { readFileSync } from 'fs';
import path from 'path';

function src(rel: string) {
  return readFileSync(path.join(__dirname, rel), 'utf8');
}

describe('Payment core remains independent of malahem removal', () => {
  it('does not import ButchersModule into PaymentsModule', () => {
    const mod = src('./payments.module.ts');
    expect(mod).not.toContain('ButchersModule');
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

  it('keeps historical butcher payment branches for webhook fulfillment', () => {
    const service = src('./payments.service.ts');
    const dto = src('./dto/payments.dto.ts');
    expect(dto).toContain('butcher_order');
    expect(dto).toContain('butcher_checkout');
    expect(service).toContain("type === 'butcher_checkout'");
    expect(service).toContain("type === 'butcher_order'");
  });
});
