import { readFileSync } from 'fs';
import path from 'path';
import { showToast, type ToastType } from '@/lib/toast';

const root = path.join(__dirname, '..');

function src(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8');
}

describe('design-system unification — allowed redesigns only', () => {
  it('Feed header uses design-system text and does not touch PostItem', () => {
    const feed = src('app/(tabs)/posts.tsx');
    const post = src('components/feature/PostItem.tsx');
    expect(feed).toContain("from '@/design-system/components'");
    expect(feed).not.toContain('>المنشورات<');
    expect(feed).not.toContain('screenTitle');
    expect(feed).toContain("tab === 'for_you' ? 'لك' : 'متابعة'");
    expect(feed).not.toContain('PostItem layout');
    expect(post).toContain("from '@/components/ui/AppText'");
    expect(post).toContain('ellipsis-vertical');
    expect(post).not.toContain("from '@/design-system/components'");
  });

  it('bottom nav keeps Add Listing with Search then Chat then Community', () => {
    const tabs = src('components/navigation/FloatingTabBar.tsx');
    expect(tabs).toContain("route: 'index'");
    expect(tabs).toContain("route: 'search'");
    expect(tabs).toContain("route: 'messages'");
    expect(tabs).toContain("route: 'posts'");
    expect(tabs).toContain("label: 'مجتمع سرح'");
    expect(tabs).toContain("label: 'البحث'");
    expect(tabs).toContain('navigateToCreateListing');
    expect(tabs).toContain('addBox');
    expect(tabs).not.toContain("route: 'market'");
    expect(tabs).not.toContain("route: 'profile'");
  });

  it('profile keeps share in the more menu and drops the header share arrow', () => {
    const layout = src('components/feature/ProfileScreenLayout.tsx');
    const visitor = src('app/users/[id].tsx');
    expect(layout).not.toContain('share-arrow');
    expect(layout).not.toContain('accessibilityLabel="مشاركة"');
    expect(layout).toContain('accessibilityLabel="المزيد"');
    expect(layout).toContain('SarhButton');
    expect(layout).toContain('متابعة');
    expect(layout).toContain('مراسلة');
    expect(visitor).toContain("key: 'share'");
    expect(visitor).toContain('مشاركة الملف');
  });

  it('sidebar keeps the same sections and adds two hairline separators', () => {
    const panel = src('components/feature/AppSidebar.tsx');
    expect(panel).toContain('الملف الشخصي');
    expect(panel).toContain("label: 'إضافة عرض'");
    expect(panel).toContain("route: '/create/listing'");
    expect(panel).toContain("label: 'خدمات الوزارة'");
    expect(panel).toContain("route: '/ministry?tab=services'");
    expect(panel).toContain('مركز المعلومات');
    expect(panel).toContain('مركز المساعدة');
    expect(panel).toContain('الإعدادات والخصوصية');
    expect(panel).toContain("route: '/settings/info'");
    expect(panel).toContain("route: '/support'");
    expect(panel).toContain("route: '/profile/settings'");
    expect((panel.match(/SarhDivider/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(panel).toContain('secondaryLabel');
    expect(panel).toContain('variant="bodySmall"');
    expect(panel.indexOf("label: 'مركز المعلومات'")).toBeLessThan(
      panel.indexOf("label: 'الإعدادات والخصوصية'"),
    );
    expect(panel.indexOf("label: 'الإعدادات والخصوصية'")).toBeLessThan(
      panel.indexOf("label: 'مركز المساعدة'"),
    );
  });

  it('does not keep a butcher storefront after malahem removal', () => {
    expect(() => src('app/butchers/[id].tsx')).toThrow();
    expect(() => src('components/butcher/ButcherCategoryBar.tsx')).toThrow();
  });

  it('removes the unused PrimaryButton adapter', () => {
    expect(() => src('components/ui/PrimaryButton.tsx')).toThrow();
  });

  it('toast host supports success/error/warning/info', () => {
    const toast = src('lib/toast.ts');
    const host = src('components/ui/ToastHost.tsx');
    expect(toast).toContain("'warning'");
    expect(host).toContain('warning');
    expect(host).toContain('AppText');
    expect(host).toContain('SarhSurface');
    const types: ToastType[] = ['success', 'error', 'warning', 'info'];
    expect(types).toHaveLength(4);
    expect(typeof showToast).toBe('function');
  });
});
