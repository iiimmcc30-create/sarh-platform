/**
 * Google showed the web site name as «تخطى» (the onboarding skip button text)
 * because the exported HTML had an empty <title> and no site-name signals.
 * Guards the official web name «سرح» in every place Google reads it.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  SITE_ALTERNATE_NAME,
  SITE_NAME,
  SITE_URL,
  websiteJsonLd,
  websiteJsonLdScript,
} from '@/lib/siteSeo';

const root = path.join(__dirname, '..');
const src = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

describe('official web site name (SEO)', () => {
  it('is «سرح» with the brand alternate name and canonical home URL', () => {
    expect(SITE_NAME).toBe('سرح');
    expect(SITE_ALTERNATE_NAME).toBe('Sarh');
    expect(SITE_URL).toBe('https://sarhsa.online/');
  });

  it('emits WebSite JSON-LD with name «سرح»', () => {
    const ld = websiteJsonLd();
    expect(ld['@type']).toBe('WebSite');
    expect(ld.name).toBe('سرح');
    expect(ld.url).toBe('https://sarhsa.online/');
    expect(ld.alternateName).toEqual(['Sarh']);
    expect(JSON.parse(websiteJsonLdScript())).toEqual(ld);
    expect(websiteJsonLdScript()).not.toContain('<');
  });

  it('HTML shell carries application-name, apple title, og:site_name, manifest and JSON-LD', () => {
    const html = src('app/+html.tsx');
    expect(html).toMatch(/name="application-name" content=\{SITE_NAME\}/);
    expect(html).toMatch(/name="apple-mobile-web-app-title" content=\{SITE_NAME\}/);
    expect(html).toMatch(/property="og:site_name" content=\{SITE_NAME\}/);
    expect(html).toContain('rel="manifest" href="/manifest.json"');
    expect(html).toContain('type="application/ld+json"');
    expect(html).toContain('lang="ar" dir="rtl"');
  });

  it('root layout sets the document <title> to the site name on web', () => {
    const layout = src('app/_layout.tsx');
    expect(layout).toContain("import Head from 'expo-router/head'");
    expect(layout).toMatch(/<title>\{SITE_NAME\}<\/title>/);
  });

  it('web manifest name / short_name are «سرح»', () => {
    const manifest = JSON.parse(src('public/manifest.json'));
    expect(manifest.name).toBe('سرح');
    expect(manifest.short_name).toBe('سرح');
    expect(manifest.lang).toBe('ar');
    expect(manifest.dir).toBe('rtl');
  });

  it('never uses the skip label as a site name', () => {
    for (const rel of ['app/+html.tsx', 'lib/siteSeo.ts', 'public/manifest.json']) {
      const text = src(rel).replace(/«تخطي»/g, '');
      expect(text).not.toMatch(/تخط[يى]/);
    }
  });
});
