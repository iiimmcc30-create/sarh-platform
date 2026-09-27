import { existsSync, readFileSync } from 'fs';
import path from 'path';

function src(rel: string) {
  return readFileSync(path.join(__dirname, rel), 'utf8');
}

const LEGACY = /butcher|daftra|malahem/i;

describe('Legacy marketplace is fully removed from the Sarh backend', () => {
  it('has no legacy marketplace module directories', () => {
    for (const dir of [
      'butchers',
      'butcher-applications',
      'butcher-banners',
      'integrations/daftra',
    ]) {
      expect(existsSync(path.join(__dirname, dir))).toBe(false);
    }
  });

  it('does not register legacy marketplace modules in AppModule', () => {
    expect(src('./app.module.ts')).not.toMatch(LEGACY);
  });

  it('keeps Payment Core and listing boost free of legacy marketplace code', () => {
    const payments = src('./payments/payments.module.ts');
    expect(payments).not.toMatch(LEGACY);
    expect(payments).toContain('payments/webhook');
    expect(src('./payments/payments.service.ts')).not.toMatch(LEGACY);
    const boost = src('./listings/boost/listing-boost.service.ts');
    expect(boost).toContain('initiateBoost');
    expect(boost).toContain('featured_ad');
  });

  it('has no legacy marketplace models in the Prisma schema', () => {
    const schema = readFileSync(
      path.join(__dirname, '..', 'prisma', 'schema.prisma'),
      'utf8',
    );
    expect(schema).not.toMatch(LEGACY);
  });
});
