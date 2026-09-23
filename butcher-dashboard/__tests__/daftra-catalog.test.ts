import { readFileSync } from 'fs';
import path from 'path';

describe('butcher dashboard Daftra catalog panel', () => {
  it('reads owner-scoped Daftra APIs and never asks the browser for an API key', () => {
    const panel = readFileSync(
      path.join(__dirname, '../src/components/products/DaftraCatalogPanel.tsx'),
      'utf8',
    );
    const service = readFileSync(
      path.join(__dirname, '../src/services/daftra.service.ts'),
      'utf8',
    );
    expect(service).toContain('/butchers/daftra/status');
    expect(service).toContain('/butchers/daftra/products');
    expect(service).toContain('/butchers/daftra/inventory');
    expect(service).not.toContain('apiKey:');
    expect(panel).toContain('fetchMyDaftraStatus');
    expect(panel).toContain('apiKeyMasked');
    expect(panel).not.toContain('type="password"');
    expect(panel).not.toContain('startMyDaftraOAuth');
  });
});
