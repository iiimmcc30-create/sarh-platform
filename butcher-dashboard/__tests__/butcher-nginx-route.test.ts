import { readFileSync } from 'fs';
import { join } from 'path';

describe('butcher nginx route', () => {
  const conf = readFileSync(
    join(__dirname, '../../nginx/butcher-location.conf'),
    'utf8',
  );

  it('proxies /butcher without forcing a trailing slash (avoids Next.js 308 loop)', () => {
    expect(conf).toContain('location = /butcher');
    expect(conf).toContain('location /butcher/');
    expect(conf).toContain('proxy_pass http://$butcher_upstream');
    expect(conf).not.toMatch(
      /location\s*=\s*\/butcher\s*\{[\s\S]*?return\s+302\s+\/butcher\//,
    );
  });

  it('keeps Next basePath /butcher as the canonical entry (no slash redirect war)', () => {
    expect(conf).not.toContain('return 302 /butcher/');
    expect(conf).not.toContain('return 301 /butcher/');
    expect(conf).not.toContain('rewrite ^/butcher$');
  });
});
