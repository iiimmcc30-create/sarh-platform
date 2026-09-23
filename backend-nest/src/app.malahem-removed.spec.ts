import { readFileSync } from 'fs';
import path from 'path';

function src(rel: string) {
  return readFileSync(path.join(__dirname, rel), 'utf8');
}

describe('Sarh main graph no longer mounts malahem HTTP modules', () => {
  it('does not import butcher or Daftra modules into AppModule', () => {
    const mod = src('./app.module.ts');
    expect(mod).not.toContain('ButchersModule');
    expect(mod).not.toContain('ButcherApplicationsModule');
    expect(mod).not.toContain('ButcherBannersModule');
    expect(mod).not.toContain('DaftraModule');
  });

  it('keeps Payment Core and listing boost independent of ButchersModule', () => {
    expect(src('./payments/payments.module.ts')).not.toContain(
      'ButchersModule',
    );
    expect(src('./payments/payments.module.ts')).toContain('payments/webhook');
    expect(src('./listings/boost/listing-boost.service.ts')).toContain(
      'initiateBoost',
    );
    expect(src('./listings/boost/listing-boost.service.ts')).toContain(
      'featured_ad',
    );
  });
});
