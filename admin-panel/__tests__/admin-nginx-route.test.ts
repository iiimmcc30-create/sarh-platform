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

describe('HTTPS overlay keeps HTTP→HTTPS redirect after git pull', () => {
  const sslCompose = readFileSync(
    join(__dirname, '../../docker-compose.prod.ssl.yml'),
    'utf8',
  );
  const enabledRedirect = readFileSync(
    join(__dirname, '../../nginx/ssl-redirect.conf.disabled'),
    'utf8',
  );
  const sslServer = readFileSync(
    join(__dirname, '../../nginx/nginx.ssl.server.conf'),
    'utf8',
  );

  it('mounts the enabled 301 file, not the empty bootstrap stub', () => {
    expect(enabledRedirect).toMatch(/return\s+301\s+https:\/\/\$host\$request_uri/);
    expect(sslCompose).toContain(
      './nginx/ssl-redirect.conf.disabled:/etc/nginx/includes/ssl-redirect.conf:ro',
    );
    expect(sslCompose).not.toMatch(
      /-\s+\.\/nginx\/ssl-redirect\.conf:\/etc\/nginx\/includes\/ssl-redirect\.conf:ro/,
    );
  });

  it('sets security headers on the TLS server so /admin and / get HSTS', () => {
    expect(sslServer).toContain('Strict-Transport-Security');
    expect(sslServer).toContain('X-Content-Type-Options nosniff');
    expect(sslServer).toContain('X-Frame-Options DENY');
    expect(sslServer).toContain('Referrer-Policy');
  });
});

describe('admin Next config', () => {
  it('hides the X-Powered-By header', () => {
    expect(
      readFileSync(join(__dirname, '../next.config.mjs'), 'utf8'),
    ).toContain('poweredByHeader: false');
  });
});
