import { readFileSync } from 'fs';
import { join } from 'path';

describe('admin nginx route', () => {
  const conf = readFileSync(
    join(__dirname, '../../nginx/admin-location.conf'),
    'utf8',
  );

  it('proxies /admin without forcing a trailing slash (avoids Next.js 308 loop)', () => {
    expect(conf).toContain('location = /admin');
    expect(conf).toContain('location /admin/');
    expect(conf).toContain('proxy_pass http://$admin_upstream');
    expect(conf).not.toMatch(
      /location\s*=\s*\/admin\s*\{[\s\S]*?return\s+302\s+\/admin\//,
    );
  });

  it('keeps Next basePath /admin as the canonical entry (no slash redirect war)', () => {
    expect(conf).not.toContain('return 302 /admin/');
    expect(conf).not.toContain('return 301 /admin/');
    expect(conf).not.toContain('rewrite ^/admin$');
  });
});
