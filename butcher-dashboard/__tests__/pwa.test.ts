/**
 * @jest-environment jsdom
 */
import fs from 'fs';
import path from 'path';
import manifest from '@/app/manifest';
import {
  isAndroidDevice,
  isIosDevice,
  shouldShowIosInstallHelp,
} from '@/lib/pwa';

describe('butcher dashboard PWA manifest', () => {
  const data = manifest();

  it('declares installable standalone metadata', () => {
    expect(data.name).toBe('Sarh Butcher Dashboard');
    expect(data.short_name).toBe('Sarh');
    expect(data.lang).toBe('ar');
    expect(data.dir).toBe('rtl');
    expect(data.display).toBe('standalone');
    expect(data.start_url).toBe('/dashboard');
    expect(data.scope).toBe('/');
    expect(data.theme_color).toBe('#20B66F');
    expect(data.background_color).toBe('#0B1622');
  });

  it('includes required icon sizes from the official Sarh mark', () => {
    const sizes = (data.icons ?? []).map((icon) => icon.sizes);
    expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512', '180x180']));
  });
});

describe('service worker source', () => {
  const sw = fs.readFileSync(path.join(process.cwd(), 'public/sw.js'), 'utf8');

  it('never intercepts API, sockets, RSC, or navigations', () => {
    expect(sw).toContain("url.pathname.startsWith('/api/')");
    expect(sw).toContain("url.searchParams.has('_rsc')");
    expect(sw).toContain("request.mode === 'navigate'");
    expect(sw).toContain('function shouldBypass');
    expect(sw).toContain("return true");
  });

  it('keeps an offline shell without using it as live dashboard data', () => {
    expect(sw).toContain('/offline.html');
    expect(sw).toMatch(/sarh-butcher-static-v\d+/);
  });
});

describe('install helpers', () => {
  const originalUserAgent = navigator.userAgent;

  afterEach(() => {
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: originalUserAgent,
    });
  });

  it('shows iOS add-to-home instructions only on iPhone Safari, not Android', () => {
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
    });
    expect(isIosDevice()).toBe(true);
    expect(isAndroidDevice()).toBe(false);
    expect(shouldShowIosInstallHelp()).toBe(true);

    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0.0.0',
    });
    expect(isAndroidDevice()).toBe(true);
    expect(isIosDevice()).toBe(false);
    expect(shouldShowIosInstallHelp()).toBe(false);
  });

  it('treats required icon files as present', () => {
    const root = path.join(process.cwd());
    expect(fs.existsSync(path.join(root, 'public/icons/icon-192.png'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'public/icons/icon-512.png'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'public/apple-touch-icon.png'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'public/favicon.ico'))).toBe(true);
  });
});
