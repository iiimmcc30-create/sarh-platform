import { readFileSync } from 'fs';
import path from 'path';

const root = path.join(__dirname, '..');

function src(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8');
}

describe('home launch layout', () => {
  it('keeps Home section order: quick access, then the existing market feed', () => {
    const home = src('app/(tabs)/index.tsx');
    expect(home).not.toContain('ExploreSarhSection');
    expect(home).not.toContain('<HomeFeedSuppliers');
    expect(home).not.toContain('<EditorialStoriesBar');
    expect(home).not.toContain('<HomeCommunityPosts');
    expect(home).not.toContain('HomeLatestListings');
    expect(home).not.toContain('أحدث الإعلانات');
    expect(home).toContain('<HomeQuickAccess');
    expect(home).toContain('extraHeader={quickAccess}');
    expect(home).toContain('variant="home"');
    expect(home.indexOf('<HomeQuickAccess')).toBeLessThan(home.indexOf('extraHeader={quickAccess}'));
    expect(home).toContain("safePush('/sidebar'");
  });

  it('wires quick access to existing app routes and stays append-only', () => {
    const catalog = src('lib/homeQuickAccess.ts');
    const quick = src('components/feature/HomeQuickAccess.tsx');
    expect(catalog).toContain("key: 'services'");
    expect(catalog).toContain("key: 'favorites'");
    expect(catalog).toContain("key: 'feed-suppliers'");
    expect(catalog).toContain("label: 'الموردين'");
    expect(catalog).toContain("key: 'settings'");
    expect(catalog).toContain("pathname: '/ministry'");
    expect(catalog).toContain("tab: 'services'");
    expect(catalog).toContain("href: '/favorites'");
    expect(catalog).toContain("href: '/feed-suppliers'");
    expect(catalog).toContain("href: '/settings'");
    expect(catalog).toContain('HOME_QUICK_ACCESS_ITEMS');
    expect(quick).toContain('HOME_QUICK_ACCESS_ITEMS.map');
    expect(quick).toContain('horizontal');
    expect(quick).toContain('borderRadius: radius[12]');
    expect(src('app/ministry/index.tsx')).toContain("value === 'posts' || value === 'services'");
    expect(src('app/favorites.tsx')).toContain('export default function FavoritesScreen');
    expect(src('app/feed-suppliers/index.tsx')).toContain('export default function FeedSuppliersScreen');
    expect(src('app/settings/index.tsx')).toContain('export default function SettingsScreen');
  });

  it('does not show the Malahem banner on Home', () => {
    const home = src('app/(tabs)/index.tsx');
    const banner = src('components/feature/ExploreSarhSection.tsx');
    expect(home).not.toContain('ExploreSarhSection');
    expect(home).not.toContain('HOME_BANNER_CTA_LABEL');
    expect(home).not.toContain("safePush('/butchers'");
    expect(banner).toContain('fetchExploreSarhBanners');
    expect(banner).not.toContain('/butchers');
  });

  it('reuses the market ListingCard feed on Home without a latest-listings title', () => {
    const home = src('app/(tabs)/index.tsx');
    const feed = src('components/market/MarketListingsFeed.tsx');
    expect(home).toContain('MarketListingsFeed');
    expect(home).not.toContain('أحدث الإعلانات');
    expect(feed).toContain('searchListingsPage');
    expect(feed).toContain('getBootstrappedListingsPage');
    expect(feed).toContain('listMode="market"');
    expect(feed).toContain("pathname: '/listing/[id]'");
    expect(feed).not.toContain('أحدث الإعلانات');
    expect(feed).not.toContain('cardShell');
    expect(src('components/feature/ListingCard.tsx')).not.toContain('cardShell');
    expect(src('components/feature/ListingCard.tsx')).not.toContain("from '@/design-system'");
  });

  it('keeps feed suppliers off Home while preserving the existing screen and routes', () => {
    const catalog = src('lib/homeQuickAccess.ts');
    const section = src('components/feature/HomeFeedSuppliers.tsx');
    const sidebar = src('components/feature/AppSidebar.tsx');
    expect(catalog).toContain('HOME_FEED_SUPPLIERS_PREVIEW_LIMIT = 4');
    expect(section).toContain('fetchFeedSuppliers');
    expect(section).toContain('موردين الأعلاف');
    expect(section).toContain("pathname: '/feed-suppliers/[id]'");
    expect(section).toContain("safePush('/feed-suppliers'");
    expect(sidebar).toContain("route: '/feed-suppliers'");
    expect(sidebar).toContain('موردو الأعلاف');
    expect(sidebar).toContain("label: 'الترويج'");
    expect(sidebar).toContain("route: '/promote'");
    expect(sidebar).not.toContain('تعزيز سرح');
  });

  it('reorders settings account rows onto existing screens and drops the duplicate info hub', () => {
    const settings = src('app/settings/index.tsx');
    expect(settings).toContain("label: 'إدارة الملف الشخصي'");
    expect(settings).toContain("route: '/profile/edit'");
    expect(settings).toContain("label: 'التحقق من الحساب والأمان'");
    expect(settings).toContain("route: '/profile/settings'");
    expect(settings).toContain("label: 'تغيير كلمة المرور'");
    expect(settings).toContain("route: '/profile/settings/password'");
    expect(settings).toContain("label: 'المحظورين'");
    expect(settings).toContain("route: '/settings/blocked'");
    expect(settings).not.toContain("route: '/settings/info'");
    expect(settings).not.toContain("label: 'مركز المعلومات'");
    expect(src('app/profile/edit/index.tsx')).toContain('export default function EditProfileScreen');
    expect(src('app/profile/settings/index.tsx')).toContain('export default function ProfileSettingsScreen');
    expect(src('app/profile/settings/password.tsx')).toContain('currentPassword');
    expect(src('app/profile/settings/password.tsx')).toContain('newPassword');
    expect(src('app/settings/info.tsx')).toContain('export default function InfoCenterScreen');
  });

  it('hides Home chrome on scroll using the market feed scroller, not a nested ScrollView', () => {
    const home = src('app/(tabs)/index.tsx');
    const feed = src('components/market/MarketListingsFeed.tsx');
    const layer = src('components/navigation/AppChromeLayer.tsx');
    const list = src('components/ui/AppFlatList.tsx');
    expect(home).toContain('AppChromeLayer');
    expect(home).toContain('useAppChromeScroll');
    expect(home).not.toContain('onScrollEndDrag={onScrollIdle}');
    expect(home).not.toContain('onMomentumScrollEnd={onScrollIdle}');
    expect(layer).toContain('chromeProgress');
    expect(list).toContain('useBindChromeScroll');
    expect(home).toContain('scroll={false}');
    expect(home).not.toContain('AppScrollView');
    expect(home).not.toContain('<ScrollView');
    expect(feed).toContain('AppFlatList');
    expect(feed).toContain('onScroll={onScroll}');
  });

  it('refreshes Home listings on re-press of the focused Home tab without remounting', () => {
    const home = src('app/(tabs)/index.tsx');
    const feed = src('components/market/MarketListingsFeed.tsx');
    const tabs = src('components/navigation/FloatingTabBar.tsx');
    expect(home).toContain('HOME_TAB_RESELECT_EVENT');
    expect(home).toContain('DeviceEventEmitter.addListener');
    expect(home).toContain('refreshBusyRef');
    expect(home).toContain('listingsRef.current?.refresh()');
    expect(home).not.toContain('bannerRef');
    expect(feed).toContain('refresh: () => loadFirstPage()');
    expect(feed).toContain('getBootstrappedListingsPage');
    expect(tabs).toContain("routeName === 'index'");
    expect(tabs).toContain('DeviceEventEmitter.emit(HOME_TAB_RESELECT_EVENT)');
  });

  it('slides the existing tab bar indicator with Home, Search, Add, Chat, and Community', () => {
    const tabs = src('components/navigation/FloatingTabBar.tsx');
    expect(tabs).toContain("route: 'index'");
    expect(tabs).toContain("route: 'search'");
    expect(tabs).toContain("route: 'messages'");
    expect(tabs).toContain("route: 'posts'");
    expect(tabs).not.toContain("route: 'profile'");
    expect(tabs).not.toContain("route: 'market'");
    expect(tabs).toContain('addBox');
    expect(tabs).toContain('indicatorX');
    expect(tabs).toContain('useNativeDriver: true');
    expect(tabs).not.toContain('SarhButton');
    expect(tabs).not.toContain('react-native-reanimated');
  });
});
