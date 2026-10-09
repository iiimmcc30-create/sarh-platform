import { existsSync, readFileSync } from 'fs';
import path from 'path';

const repo = path.join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(path.join(repo, rel), 'utf8');

describe('/.well-known App Links + Universal Links (outer nginx)', () => {
  it('serves both files as application/json from real files, exact-match locations', () => {
    const conf = read('nginx/web-location.conf');
    for (const name of ['assetlinks.json', 'apple-app-site-association']) {
      const block = conf.slice(conf.indexOf(`location = /.well-known/${name} {`));
      expect(block).toContain(`alias /etc/nginx/well-known/${name};`);
      expect(block.slice(0, block.indexOf('\n}\n'))).toContain('default_type application/json;');
      expect(existsSync(path.join(repo, 'nginx/well-known', name))).toBe(true);
    }
    expect(conf).toContain('TODO(owner)');
  });

  it('mounts ./nginx/well-known read-only in every production nginx', () => {
    for (const f of ['docker-compose.app.yml', 'docker-compose.prod.yml', 'docker-compose.prod.ssl.yml']) {
      expect(read(f)).toContain('- ./nginx/well-known:/etc/nginx/well-known:ro');
    }
  });

  it('nginx copies match the app/public sources (package, bundle, paths)', () => {
    for (const name of ['assetlinks.json', 'apple-app-site-association']) {
      const served = JSON.parse(read(`nginx/well-known/${name}`));
      const source = JSON.parse(read(`app/public/.well-known/${name}`));
      expect(served).toEqual(source);
    }
    const links = JSON.parse(read('nginx/well-known/assetlinks.json'));
    expect(links[0].target.package_name).toBe('com.sarh.app');
    const aasa = JSON.parse(read('nginx/well-known/apple-app-site-association'));
    expect(aasa.applinks.details[0].appIDs[0]).toMatch(/\.com\.sarh\.app$/);
    const paths = aasa.applinks.details[0].components.map((c: { '/': string }) => c['/']);
    expect(paths).toEqual(['/l/*', '/post/*', '/u/*', '/councils/join/*']);
  });

  it('render script reads APPLE_TEAM_ID / ANDROID_SHA256_CERT_FINGERPRINTS (documented in .env.app.example)', () => {
    const script = read('scripts/app-server/render-well-known.sh');
    expect(script).toContain('env_get APPLE_TEAM_ID');
    expect(script).toContain('env_get ANDROID_SHA256_CERT_FINGERPRINTS');
    const example = read('.env.app.example');
    expect(example).toMatch(/^APPLE_TEAM_ID=$/m);
    expect(example).toMatch(/^ANDROID_SHA256_CERT_FINGERPRINTS=$/m);
  });
});
