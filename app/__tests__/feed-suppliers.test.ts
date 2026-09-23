import { readFileSync } from 'fs';
import path from 'path';
import {
  mailtoUrl,
  mapsUrl,
  telUrl,
  websiteUrl,
  whatsappUrl,
} from '../lib/feedSuppliers';

const root = path.join(__dirname, '..');

function src(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8');
}

describe('feed supplier directory helpers', () => {
  it('builds WhatsApp, phone, email, website, and map links from supplier data', () => {
    expect(whatsappUrl('+966 55 123 4567')).toBe('https://wa.me/966551234567');
    expect(telUrl('+966551234567')).toBe('tel:+966551234567');
    expect(mailtoUrl('info@example.com')).toBe('mailto:info@example.com');
    expect(websiteUrl('sarhsa.online')).toBe('https://sarhsa.online');
    expect(websiteUrl('https://sarhsa.online')).toBe('https://sarhsa.online');
    expect(mapsUrl({ lat: 24.7, lng: 46.7 })).toBe('https://maps.google.com/?q=24.7,46.7');
    expect(mapsUrl({ addressAr: 'الرياض' })).toBe(
      `https://maps.google.com/?q=${encodeURIComponent('الرياض')}`,
    );
    expect(whatsappUrl('')).toBeNull();
    expect(mailtoUrl('')).toBeNull();
    expect(websiteUrl('')).toBeNull();
    expect(mapsUrl({})).toBeNull();
  });
});

describe('feed supplier screens stay a public directory', () => {
  const list = src('app/feed-suppliers/index.tsx');
  const details = src('app/feed-suppliers/[id].tsx');
  const contacts = src('components/feed-suppliers/FeedSupplierContactActions.tsx');
  const sidebar = src('components/feature/AppSidebar.tsx');
  const explore = src('components/feature/ExploreSarhSection.tsx');
  const exploreFallback = src('lib/exploreSarhBanners.ts');

  it('keeps the sidebar item after favorites and before ministry services', () => {
    const favoritesAt = sidebar.indexOf("label: 'المفضلة'");
    const feedAt = sidebar.indexOf("label: 'موردو الأعلاف'");
    const ministryAt = sidebar.indexOf("label: 'خدمات الوزارة'");
    expect(favoritesAt).toBeGreaterThan(-1);
    expect(feedAt).toBeGreaterThan(favoritesAt);
    expect(ministryAt).toBeGreaterThan(feedAt);
    expect(sidebar).toContain("route: '/feed-suppliers'");
  });

  it('opens the directory from home quick access and keeps CMS banners', () => {
    expect(exploreFallback.indexOf("href: '/feed-suppliers'")).toBeLessThan(
      exploreFallback.indexOf("href: '/ministry'"),
    );
    expect(explore).toContain('fetchExploreSarhBanners');
    expect(exploreFallback).toContain('explore-sarh-feed-suppliers.jpg');
    expect(src('lib/homeQuickAccess.ts')).toContain("href: '/feed-suppliers'");
    expect(explore).not.toContain('تصفح واستكشف أبرز الموردين');
  });

  it('uses the official warehouse hero and lists suppliers without marketplace chrome', () => {
    expect(list).toContain('feed-suppliers-hero.jpg');
    expect(list).toContain('تعرّف على موردي الأعلاف في سرح');
    expect(list).toContain('الموردون');
    expect(list).toContain('/feed-suppliers/[id]');
    expect(list).toContain('لا يوجد موردون متاحون حالياً');
    expect(list).not.toContain('متابعة');
    expect(list).not.toContain('سلة');
    expect(list).not.toContain('شراء');
    expect(list).not.toContain('ابحث عن مورد أو منتج');
    expect(list).not.toContain('منتجات');
    expect(list).not.toContain('FEED_CATEGORY_FILTERS');
  });

  it('exposes contact actions and hides products on the supplier page', () => {
    expect(details).toContain('FeedSupplierContactActions');
    expect(contacts).toContain('whatsappUrl');
    expect(contacts).toContain('telUrl');
    expect(contacts).toContain('mailtoUrl');
    expect(contacts).toContain('websiteUrl');
    expect(contacts).toContain('mapsUrl');
    expect(contacts).toContain('اتصال');
    expect(contacts).toContain('WhatsApp');
    expect(contacts).toContain('البريد');
    expect(contacts).toContain('الموقع الإلكتروني ↗');
    expect(details).not.toContain('المنتجات');
    expect(details).not.toContain('لا توجد منتجات متاحة حالياً');
    expect(details).not.toContain('شراء');
    expect(details).not.toContain('سلة');
    expect(details).not.toContain('متابعة');
    expect(details).not.toContain('FeedProduct');
  });
});
