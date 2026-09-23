import { readFileSync } from 'fs';
import path from 'path';

const root = path.join(__dirname, '..');

function src(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8');
}

describe('Sidebar + bottom nav + profile/settings flatten', () => {
  it('uses Search beside Home and keeps Community after Chat, with Profile off the tab bar', () => {
    const tabs = src('components/navigation/FloatingTabBar.tsx');
    const layout = src('app/(tabs)/_layout.tsx');
    expect(tabs).toContain("label: 'البحث'");
    expect(tabs).toContain("route: 'search'");
    expect(tabs).toContain("label: 'مجتمع سرح'");
    expect(tabs).toContain("route: 'posts'");
    expect(tabs).not.toContain("route: 'profile'");
    expect(tabs).not.toContain("route: 'market'");
    expect(tabs).not.toContain("label: 'المزيد'");
    expect(layout).toContain("title: 'البحث'");
    expect(layout).toContain("title: 'مجتمع سرح'");
    expect(layout).toContain('name="more"');
    expect(layout).toContain('name="profile"');
    expect(layout).toMatch(/name="more"[\s\S]*href: null/);
    expect(layout).toMatch(/name="market"[\s\S]*href: null/);
    expect(layout).toMatch(/name="profile"[\s\S]*href: null/);
  });

  it('opens the existing sidebar route from the home avatar', () => {
    const home = src('app/(tabs)/index.tsx');
    const sidebar = src('app/sidebar.tsx');
    const panel = src('components/feature/AppSidebar.tsx');
    expect(home).toContain("safePush('/sidebar'");
    expect(sidebar).toContain('AppSidebar');
    expect(panel).toContain('الملف الشخصي');
    expect(panel).toContain("label: 'إضافة عرض'");
    expect(panel).toContain("route: '/create/listing'");
    expect(panel).toContain('المفضلة');
    expect(panel).toContain('موردو الأعلاف');
    expect(panel).toContain("label: 'خدمات الوزارة'");
    expect(panel).toContain("route: '/ministry?tab=services'");
    expect(panel).toContain('قطاع الأخبار');
    expect(panel).toContain("label: 'الترويج'");
    expect(panel).toContain('مركز المعلومات');
    expect(panel).toContain("route: '/settings/info'");
    expect(panel).toContain("route: '/support'");
    expect(panel).toContain("route: '/profile/settings'");
    expect(panel).toContain('weather-night');
    expect(panel).toContain('يتابع');
    expect(panel).toContain('متابعون');
    expect(panel).toContain('marginBottom: spacing.lg');
    expect(panel).not.toContain('menuCardStyle');
    expect(panel).not.toContain('/sarh-services');
    expect(panel).not.toContain("label: 'الإشعارات'");
    expect(panel).not.toContain("label: 'ملاحم سرح'");
    expect(panel).toContain('navigateToCreateListing');
    expect(panel).toContain('requireCovenant: true');
    expect(panel).toContain('closeThen');
  });

  it('orders primary rows then the quieter help section, and keeps the theme icon', () => {
    const panel = src('components/feature/AppSidebar.tsx');
    const profileAt = panel.indexOf("label: 'الملف الشخصي'");
    const createAt = panel.indexOf("label: 'إضافة عرض'");
    const favoritesAt = panel.indexOf("label: 'المفضلة'");
    const feedAt = panel.indexOf("label: 'موردو الأعلاف'");
    const ministryAt = panel.indexOf("label: 'خدمات الوزارة'");
    const newsAt = panel.indexOf("label: 'قطاع الأخبار'");
    const promoteAt = panel.indexOf("label: 'الترويج'");
    const infoAt = panel.indexOf("label: 'مركز المعلومات'");
    const settingsAt = panel.indexOf("label: 'الإعدادات والخصوصية'");
    const helpAt = panel.indexOf("label: 'مركز المساعدة'");
    expect(profileAt).toBeGreaterThan(-1);
    expect(createAt).toBeGreaterThan(profileAt);
    expect(favoritesAt).toBeGreaterThan(createAt);
    expect(feedAt).toBeGreaterThan(favoritesAt);
    expect(ministryAt).toBeGreaterThan(feedAt);
    expect(newsAt).toBeGreaterThan(ministryAt);
    expect(promoteAt).toBeGreaterThan(newsAt);
    expect(infoAt).toBeGreaterThan(promoteAt);
    expect(settingsAt).toBeGreaterThan(infoAt);
    expect(helpAt).toBeGreaterThan(settingsAt);
    expect(panel).toContain('variant="bodySmall"');
    expect(panel).toContain('color="textSecondary"');
    expect(panel).toContain('size={20}');
    expect(panel).toContain('size={24}');
    expect(panel).toContain('accessibilityLabel="المظهر"');
    expect(panel).toContain('weather-night');
    expect(src('lib/navigateToCreateListing.ts')).toContain('requireCovenant');
    expect(src('lib/navigateToCreateListing.ts')).toContain('requestListingCovenant');
    expect(src('lib/safeNavigate.ts')).toContain('export function closeThen(');
  });

  it('slides the app sidebar in from the RTL start edge (right)', () => {
    const layout = src('app/_layout.tsx');
    const sidebarScreen = layout.match(
      /<Stack\.Screen\s+name="sidebar"[\s\S]*?\/>/,
    )?.[0];
    expect(sidebarScreen).toBeTruthy();
    expect(sidebarScreen).toContain("animation: 'none'");
    expect(sidebarScreen).toContain("presentation: 'transparentModal'");
    expect(sidebarScreen).not.toContain('stackSlideBackAnimation()');
    expect(src('lib/rtl.ts')).toContain(
      "return isAppRtl() ? 'slide_from_right' : 'slide_from_left'",
    );

    const sidebar = src('app/sidebar.tsx');
    expect(sidebar).toContain('new Animated.Value(0)');
    expect(sidebar).toContain('{ opacity: progress }');
    expect(sidebar).toContain('transform: [{ translateX }]');
    expect(sidebar).toContain('progress.interpolate');
    expect(sidebar).toContain("rgba(0,0,0,0.28)");
    expect(sidebar).toContain('isAppRtl() ? slideDistance : -slideDistance');
    expect(sidebar).not.toContain('LayoutAnimation');
  });

  it('flattens own-profile stats/tabs and removes settings icon entry', () => {
    const profile = src('app/(tabs)/profile.tsx');
    const layout = src('components/feature/ProfileScreenLayout.tsx');
    expect(profile).not.toContain('onSettings=');
    expect(layout).toContain("backgroundColor: 'transparent'");
    expect(layout).not.toContain('MENU_CARD');
  });

  it('uses flat settings sections', () => {
    const settings = src('components/feature/ProfileSettingsMenuScreen.tsx');
    expect(settings).toContain('SarhSettingsSection');
    expect(settings).toContain('SarhSettingsRow');
    expect(settings).not.toContain('menuCardStyle');
    expect(settings).not.toContain('variant="card"');
  });
});
