import { readFileSync } from 'fs';
import path from 'path';

const root = path.join(__dirname, '..');

function src(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8');
}

describe('home launch layout', () => {
  it('keeps Home section order: stories, then the existing market feed (no quick access)', () => {
    const home = src('app/(tabs)/index.tsx');
    expect(home).not.toContain('ExploreSarhSection');
    expect(home).not.toContain('<HomeFeedSuppliers');
    expect(home).not.toContain('<EditorialStoriesBar');
    expect(home).not.toContain('<HomeCommunityPosts');
    expect(home).not.toContain('HomeLatestListings');
    expect(home).not.toContain('أحدث الإعلانات');
    expect(home).not.toContain('HomeQuickAccess');
    expect(home).toContain('extraHeader={homeHeader}');
    expect(home).toContain('variant="home"');
    expect(home).toContain("safePush('/sidebar'");
  });

  it('keeps the former quick-access destinations and their routes', () => {
    const catalog = src('lib/homeQuickAccess.ts');
    expect(catalog).not.toContain('HOME_QUICK_ACCESS_ITEMS');
    expect(src('app/ministry/index.tsx')).toContain("value === 'posts' || value === 'services'");
    expect(src('app/favorites.tsx')).toContain('export default function FavoritesScreen');
    expect(src('app/feed-suppliers/index.tsx')).toContain('export default function FeedSuppliersScreen');
    expect(src('app/settings/index.tsx')).toContain('export default function SettingsScreen');
  });

  it('does not show the explore banner on Home', () => {
    const home = src('app/(tabs)/index.tsx');
    const banner = src('components/feature/ExploreSarhSection.tsx');
    expect(home).not.toContain('ExploreSarhSection');
    expect(home).not.toContain('HOME_BANNER_CTA_LABEL');
    expect(banner).toContain('fetchExploreSarhBanners');
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
    expect(sidebar).not.toContain("route: '/feed-suppliers'"); // sidebar row removed; screen + routes stay
    expect(sidebar).not.toContain('موردو الأعلاف');
    expect(sidebar).toContain("label: 'التعزيز'");
    expect(sidebar).toContain("route: '/promote'");
    expect(sidebar).not.toContain('تعزيز سرح');
  });

  it('reorders settings account rows onto existing screens and drops the duplicate info hub', () => {
    // Settings (X look): sections and rows are data in lib/settingsRows.ts; «حسابك» → «الملف الشخصي» opens edit profile.
    const settings = src('lib/settingsRows.ts');
    expect(src('app/settings/index.tsx')).toContain('SettingsHomeScreen');
    expect(settings).toContain("route: '/profile/edit'");
    expect(settings).toContain("route: '/profile/settings/account'");
    expect(settings).toContain("title: 'كلمة المرور'");
    expect(settings).toContain("route: '/profile/settings/password'");
    expect(settings).toContain("title: 'الحسابات المحظورة'");
    expect(settings).toContain("route: '/settings/blocked'");
    expect(settings).not.toContain("route: '/settings/info'");
    expect(settings).not.toContain("'مركز المعلومات'");
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

  it('keeps Home, Search, Add, Chat, and Community with no active-tab line', () => {
    const tabs = src('components/navigation/FloatingTabBar.tsx');
    expect(tabs).toContain("route: 'index'");
    expect(tabs).toContain("route: 'search'");
    expect(tabs).toContain("route: 'messages'");
    expect(tabs).toContain("route: 'posts'");
    expect(tabs).not.toContain("route: 'profile'");
    expect(tabs).not.toContain("route: 'market'");
    expect(tabs).toContain('addBox');
    expect(tabs).not.toContain('indicatorX');
    expect(tabs).toContain('useNativeDriver: true');
    expect(tabs).not.toContain('SarhButton');
    expect(tabs).not.toContain('react-native-reanimated');
  });
});
