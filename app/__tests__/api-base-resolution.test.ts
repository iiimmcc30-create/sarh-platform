import { readdirSync, readFileSync, statSync, existsSync } from 'fs';
import path from 'path';
import {
  LOCAL_API_PROBE_TIMEOUT_MS,
  PRODUCTION_API_BASE,
  apiFallbackMessage,
  rebaseApiUrl,
  resetApiFallbackState,
  resolveReachableApiBase,
  resolveRequestUrl,
  setApiRebase,
  setPendingApiProbe,
  shouldProbeLocalApi,
} from '@/services/apiFallback';

const root = path.join(__dirname, '..');
const src = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

describe('API base resolution (Hostinger only)', () => {
  afterEach(() => resetApiFallbackState());

  it('production fallback is the Hostinger API', () => {
    expect(PRODUCTION_API_BASE).toBe('https://sarhsa.online');
    const eas = JSON.parse(src('eas.json'));
    for (const profile of ['development', 'preview', 'production']) {
      expect(eas.build[profile].env.EXPO_PUBLIC_API_URL).toBe(PRODUCTION_API_BASE);
    }
    expect(src('services/devHost.ts')).toContain('const PRODUCTION_API = PRODUCTION_API_BASE;');
  });

  it('never probes in production builds or on https bases', async () => {
    const probe = jest.fn(async () => false);
    expect(shouldProbeLocalApi('http://192.168.1.5:3001', false)).toBe(false);
    expect(shouldProbeLocalApi('https://sarhsa.online', true)).toBe(false);
    expect(shouldProbeLocalApi('', true)).toBe(false);
    await expect(resolveReachableApiBase('http://192.168.1.5:3001', false, probe)).resolves.toEqual({
      base: 'http://192.168.1.5:3001',
      switched: false,
    });
    await resolveReachableApiBase('https://sarhsa.online', true, probe);
    expect(probe).not.toHaveBeenCalled();
  });

  it('dev keeps a reachable local backend', async () => {
    const probe = jest.fn(async () => true);
    await expect(resolveReachableApiBase('http://10.0.2.2:3001', true, probe)).resolves.toEqual({
      base: 'http://10.0.2.2:3001',
      switched: false,
    });
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it('dev falls back straight to Hostinger with one short local probe (no second probe)', async () => {
    const probe = jest.fn(async () => false);
    await expect(resolveReachableApiBase('http://192.168.1.5:3001', true, probe)).resolves.toEqual({
      base: 'https://sarhsa.online',
      switched: true,
    });
    expect(probe).toHaveBeenCalledTimes(1);
    expect(probe).toHaveBeenCalledWith('http://192.168.1.5:3001', LOCAL_API_PROBE_TIMEOUT_MS);
    expect(LOCAL_API_PROBE_TIMEOUT_MS).toBeLessThanOrEqual(2000);
  });

  it('logs the Hostinger fallback, not Render', () => {
    const msg = apiFallbackMessage();
    expect(msg).toContain('Hostinger');
    expect(msg).toContain('https://sarhsa.online');
    expect(msg).not.toMatch(/render/i);
  });

  it('rebases requests built from the unreachable local base once the probe resolves', async () => {
    let finish: () => void = () => undefined;
    const probe = new Promise<void>((r) => {
      finish = r;
    });
    setPendingApiProbe('http://192.168.1.5:3001', probe);
    const pending = resolveRequestUrl('http://192.168.1.5:3001/api/posts?page=1');
    setApiRebase('http://192.168.1.5:3001', 'https://sarhsa.online');
    finish();
    await expect(pending).resolves.toBe('https://sarhsa.online/api/posts?page=1');
    expect(rebaseApiUrl('https://cdn.example.com/a.jpg')).toBe('https://cdn.example.com/a.jpg');
    expect(rebaseApiUrl('http://192.168.1.5:30010/x')).toBe('http://192.168.1.5:30010/x');
  });

  it('all requests share the services/api resolver (fetchWithTimeout rebases, no Render code)', () => {
    expect(src('services/fetchWithTimeout.ts')).toContain('await resolveRequestUrl(input)');
    const api = src('services/api.ts');
    expect(api).toContain('resolveReachableApiBase(');
    expect(api).not.toMatch(/onrender|Render/);

    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(path.join(root, dir))) {
        if (name === 'node_modules' || name === '__tests__' || name.startsWith('.')) continue;
        const rel = path.join(dir, name);
        if (statSync(path.join(root, rel)).isDirectory()) walk(rel);
        else if (/\.(ts|tsx|js)$/.test(name) && /onrender\.com/i.test(src(rel))) offenders.push(rel);
      }
    };
    ['app', 'components', 'contexts', 'lib', 'services', 'constants', 'hooks', 'scripts'].forEach(
      (d) => existsSync(path.join(root, d)) && walk(d),
    );
    expect(offenders).toEqual([]);
  });
});

describe('profile/edit routes', () => {
  it('root stack declares only profile/edit; its nested layout owns index and [field]', () => {
    const layout = src('app/_layout.tsx');
    expect(layout).toContain('<Stack.Screen name="profile/edit" />');
    expect(layout).not.toContain('name="profile/edit/index"');
    expect(layout).not.toContain('name="profile/edit/[field]"');
    for (const f of ['_layout.tsx', 'index.tsx', '[field].tsx']) {
      expect(existsSync(path.join(root, 'app/profile/edit', f))).toBe(true);
    }
  });
});
