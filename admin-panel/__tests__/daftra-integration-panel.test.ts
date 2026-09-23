import { readFileSync } from 'fs';
import path from 'path';

describe('admin daftra integration UI', () => {
  it('exposes configure + test connection without product sync', () => {
    const panel = readFileSync(
      path.join(__dirname, '../src/components/butchers/DaftraIntegrationPanel.tsx'),
      'utf8',
    );
    expect(panel).toContain('Test Connection');
    expect(panel).toContain('saveDaftraConfig');
    expect(panel).toContain('testDaftraConnection');
    expect(panel).not.toContain('product sync');
    expect(panel).toContain("role === 'ADMIN'");
  });
});
