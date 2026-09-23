import * as fs from 'fs';
import * as path from 'path';
import {
  FALLBACK_HOME_EXPLORE,
  partitionExploreSections,
  resolveExploreCard,
  splitExploreRows,
  usesExploreSarhLogoMark,
} from '../lib/homeExplore';

describe('homeExplore catalog', () => {
  it('maps known destinations to real app routes', () => {
    expect(resolveExploreCard({ destination: 'community' })?.route).toBe('/(tabs)/posts');
    expect(resolveExploreCard({ destination: 'community' })?.titleAr).toBe('مجتمع سرح');
    expect(resolveExploreCard({ destination: 'community' })?.descriptionAr).toBe(
      'نقاشات-تجارب-اسئلة-معرفه',
    );
    expect(resolveExploreCard({ destination: 'listings' })?.route).toBe('/(tabs)/market');
    expect(resolveExploreCard({ destination: 'listings' })?.titleAr).toBe('السوق');
    expect(resolveExploreCard({ destination: 'listings' })?.descriptionAr).toBe(
      'اعلانات البيع والشراء والمنتجات',
    );
    expect(resolveExploreCard({ destination: 'butchers' })).toBeNull();
    expect(resolveExploreCard({ destination: 'services' })?.route).toBe('/ministry');
    expect(resolveExploreCard({ destination: 'services' })?.titleAr).toBe(
      'خدمات وزارة البيئة والمياه والزراعة',
    );
    expect(resolveExploreCard({ destination: 'services' })?.descriptionAr).toBe(
      'الخدمات الإلكترونية - التراخيص - التصاريح',
    );
    expect(resolveExploreCard({ destination: 'news' })?.titleAr).toBe('قطاع الأخبار');
    expect(resolveExploreCard({ destination: 'news' })?.descriptionAr).toBe(
      'اخبار الوزارة-القرارات-الفعاليات',
    );
    expect(resolveExploreCard({ destination: 'live' })?.route).toBe('/(tabs)/live');
    expect(resolveExploreCard({ destination: 'promote' })?.route).toBe('/promote');
  });

  it('ignores unknown destinations instead of inventing routes', () => {
    expect(resolveExploreCard({ destination: 'unknown' })).toBeNull();
  });

  it('keeps a fallback row that does not include promote', () => {
    expect(FALLBACK_HOME_EXPLORE.map((item) => item.destination)).toEqual([
      'community',
      'listings',
      'services',
      'news',
    ]);
  });

  it('partitions services into a full-width featured card and orders the 2×2 grid', () => {
    const { grid, featured } = partitionExploreSections(FALLBACK_HOME_EXPLORE);
    expect(featured?.destination).toBe('services');
    expect(featured?.titleAr).toBe('خدمات وزارة البيئة والمياه والزراعة');
    expect(grid.map((item) => item.destination)).toEqual([
      'listings',
      'community',
      'news',
    ]);
  });
});

describe('Explore Sarh logo mark', () => {
  it('uses the official mark on community, listings, services, and news', () => {
    expect(usesExploreSarhLogoMark('community')).toBe(true);
    expect(usesExploreSarhLogoMark('listings')).toBe(true);
    expect(usesExploreSarhLogoMark('services')).toBe(true);
    expect(usesExploreSarhLogoMark('news')).toBe(true);
    expect(usesExploreSarhLogoMark('live')).toBe(false);
    expect(usesExploreSarhLogoMark('promote')).toBe(false);
  });

  it('uses a horizontal explore banner pager instead of stacked heroes', () => {
    const section = fs.readFileSync(
      path.join(__dirname, '../components/feature/ExploreSarhSection.tsx'),
      'utf8',
    );
    const fallback = fs.readFileSync(
      path.join(__dirname, '../lib/exploreSarhBanners.ts'),
      'utf8',
    );
    expect(section).toContain('fetchExploreSarhBanners');
    expect(section).not.toContain('FALLBACK_EXPLORE_SARH_BANNERS');
    expect(section).toContain('HOME_BANNER_CTA_HREF');
    expect(section).toContain('pagingEnabled');
    expect(section).toContain('accessibilityRole="button"');
    expect(fallback).not.toContain('ملاحم سرح');
    expect(fallback).not.toContain("href: '/butchers'");
    expect(fallback).toContain("href: '/feed-suppliers'");
    expect(fallback).toContain('موردو الأعلاف');
    expect(fallback).toContain("href: '/ministry'");
    expect(fallback).toContain('خدمات وزارة البيئة والمياه والزراعة');
    expect(fallback).toContain('explore-sarh-feed-suppliers.jpg');
    expect(fallback).toContain('explore-sarh-ministry.jpg');
    expect(section).toContain('SarhButton');
    expect(section).toContain('HOME_BANNER_CTA_LABEL');
    expect(section).not.toContain('CARD_RADIUS');
    expect(section).not.toContain('partitionExploreSections');
    expect(section).not.toContain('gridRow');
    expect(section).not.toContain('featuredCard');
  });
});

describe('login screen layout', () => {
  it('uses minimal Sarh login: phone + password, square logo, locale copy, no country picker', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../app/auth/phone.tsx'),
      'utf8',
    );
    expect(src).toContain('SarhInput');
    expect(src).toContain('<Screen');
    expect(src).toContain('useAuthCopy');
    expect(src).toContain('shape="square"');
    expect(src).toContain('signInWithPassword');
    expect(src).toContain('forgot-password');
    expect(src).not.toContain('countryBtn');
    expect(src).not.toContain('COUNTRY_CODES');
    expect(src).not.toContain('tabBar');
    expect(src).not.toContain('styles.searchBar');
  });
});

describe('auth welcome screen', () => {
  it('shows square brand mark and start / have-account actions', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../app/auth/welcome.tsx'),
      'utf8',
    );
    expect(src).toContain('SarhLogoMark');
    expect(src).toContain('/auth/register');
    expect(src).toContain('/auth/phone');
    expect(src).toContain('useAuthCopy');
  });
});

describe('progressive register screen', () => {
  it('steps phone → name → identity → password → otp without auth API changes', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../app/auth/register.tsx'),
      'utf8',
    );
    expect(src).toContain("step === 'phone'");
    expect(src).toContain("step === 'name'");
    expect(src).toContain("step === 'identity'");
    expect(src).toContain("step === 'password'");
    expect(src).toContain("step === 'otp'");
    expect(src).toContain('sendOtp');
    expect(src).toContain('verifyOtp');
    expect(src).toContain('register(');
    expect(src).toContain('shape="square"');
    expect(src).toContain('updateAccountSettings');
  });
});

describe('HomeAppBar chrome', () => {
  it('uses flat home header with notifications and profile identity, without a search bar', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../components/ui/HomeAppBar.tsx'),
      'utf8',
    );
    const avatarAt = src.indexOf('accessibilityLabel="القائمة الجانبية"');
    const bellAt = src.indexOf('<NotificationBellButton');
    expect(avatarAt).toBeGreaterThan(-1);
    expect(bellAt).toBeGreaterThan(avatarAt);
    expect(src).toContain('onAvatarPress');
    expect(src).toContain('SarhLogoMark');
    expect(src).toContain('uri={avatarUri}');
    expect(src).not.toContain('styles.searchBar');
    expect(src).not.toContain('HOME_SEARCH_PLACEHOLDER');
    expect(src).not.toContain('accessibilityRole="search"');
    expect(src).not.toContain('HomeProfileMenu');
    expect(src).not.toContain('angle-down');
    expect(src).not.toContain("direction: 'ltr'");
    expect(src).not.toContain('more-vertical');
    expect(src).toContain('bare');
    expect(src).toContain('backgroundColor: \'transparent\'');
    expect(src).toContain('minHeight: BAR_H');
    expect(src).not.toContain('variant="heading3"');
    expect(src).not.toContain('onProfilePress');
    expect(src).toContain('tokens.glass');
    expect(src).toContain('tokens.glassBorder');
    expect(src).not.toContain('ambientShadow');
  });

  it('embeds filter inside market search bar with featured star on the right', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../components/market/MarketAppBar.tsx'),
      'utf8',
    );
    const filterAt = src.indexOf('accessibilityLabel="تصفية"');
    const searchAt = src.indexOf('accessibilityRole="search"');
    const starAt = src.indexOf('accessibilityLabel="الإعلانات المميزة"');
    expect(filterAt).toBeGreaterThan(-1);
    expect(searchAt).toBeGreaterThan(filterAt);
    expect(starAt).toBeGreaterThan(searchAt);
    expect(src).toContain('styles.searchBar');
    expect(src).toContain('styles.searchTap');
    expect(src).toContain('TOOL_ICON');
    expect(src).toContain('ابحث في السوق');
    expect(src).not.toContain('sort-alt');
    expect(src).not.toContain('sortLabel');
    expect(src).not.toContain('HomeAppBar');
    expect(src).not.toContain('المزيد');
    expect(src).not.toContain('NotificationBellButton');
  });

  it('pairs sort and category actions beside nearby in the market filter row', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../components/market/MarketFilterBar.tsx'),
      'utf8',
    );
    const nearbyAt = src.indexOf('accessibilityLabel="القريب"');
    const sortAt = src.indexOf('name="sort-alt"', nearbyAt);
    const categoryAt = src.indexOf('accessibilityLabel="التصنيف"', sortAt);
    expect(nearbyAt).toBeGreaterThan(-1);
    expect(sortAt).toBeGreaterThan(nearbyAt);
    expect(categoryAt).toBeGreaterThan(sortAt);
    expect(src).toContain('name="apps"');
    expect(src).toContain('>القريب</Text>');
    expect(src).toContain('>التصنيف</Text>');
    expect(src).toContain('onNearbyPress');
    expect(src).toContain('onPress={onNearbyPress}');
    expect(src).toContain('onPress={onSortPress}');
    expect(src).toContain('onCategoryPress');
    expect(src).toContain('onSortPress');
    expect(src).toContain('nearbyActive');
    expect(src).toContain('sortActive');
    expect(src).not.toContain('categoryIconBtn');
    expect(src).not.toContain('options-outline');
    expect(src).toContain('borderColor: colors.borderHairline');
    expect(src).toContain('fontSize: MARKET_CHIP.fontSize');
  });

  it('wires nearby and sort chips to live market listing state', () => {
    const feed = fs.readFileSync(
      path.join(__dirname, '../components/market/MarketListingsFeed.tsx'),
      'utf8',
    );
    expect(feed).toContain('onNearbyPress={onNearbyPress}');
    expect(feed).toContain('onSortPress={onSortPress}');
    expect(feed).toContain('resolveNearbyRegionSelection');
    expect(feed).toContain('nextMarketSortMode');
    expect(feed).toContain('listingMatchesRegionSelection');
    expect(feed).toContain('nearbyActive={nearbyActive}');
    expect(feed).toContain("sortActive={sortMode !== 'newest'}");
    expect(feed).not.toContain('searchListingsPage({ ...apiFilters, sort');
    expect(feed).not.toContain("id: 'nearby'");
  });

  it('uses elevated listing-card surface for compact market chips', () => {
    const chipSrc = fs.readFileSync(
      path.join(__dirname, '../components/ui/filterChipAppearance.tsx'),
      'utf8',
    );
    expect(chipSrc).toContain('colors.royal');
    expect(chipSrc).toContain('const idleBorderWidth = compact ? 0');
  });

  it('keeps explore banners aligned to the home gutter', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../components/feature/ExploreSarhSection.tsx'),
      'utf8',
    );
    expect(src).toContain('paddingHorizontal: gutter');
    expect(src).toContain('slideWidth - gutter * 2');
    expect(src).not.toContain('paddingHorizontal: SIDE_PAD');
    expect(src).not.toContain('CARD_RADIUS');
    expect(src).not.toContain('menuCardStyle');
  });

  it('opens ministry services from home quick access, not a new route', () => {
    const home = fs.readFileSync(path.join(__dirname, '../app/(tabs)/index.tsx'), 'utf8');
    const explore = fs.readFileSync(
      path.join(__dirname, '../components/feature/ExploreSarhSection.tsx'),
      'utf8',
    );
    const fallback = fs.readFileSync(
      path.join(__dirname, '../lib/exploreSarhBanners.ts'),
      'utf8',
    );
    const quick = fs.readFileSync(
      path.join(__dirname, '../lib/homeQuickAccess.ts'),
      'utf8',
    );
    expect(home).not.toContain('HomeMinistryOrgCard');
    expect(home).not.toContain('أحدث المنشورات');
    expect(home).toContain('HomeQuickAccess');
    expect(quick).toContain("pathname: '/ministry'");
    expect(quick).toContain("tab: 'services'");
    expect(fallback).toContain("href: '/ministry'");
    expect(fallback).toContain('خدمات وزارة البيئة والمياه والزراعة');
    expect(fallback).toContain('explore-sarh-ministry.jpg');
    expect(explore).toContain('fetchExploreSarhBanners');
  });
});

describe('Home design-system adoption', () => {
  const home = fs.readFileSync(path.join(__dirname, '../app/(tabs)/index.tsx'), 'utf8');
  const appBar = fs.readFileSync(path.join(__dirname, '../components/ui/HomeAppBar.tsx'), 'utf8');
  const explore = fs.readFileSync(
    path.join(__dirname, '../components/feature/ExploreSarhSection.tsx'),
    'utf8',
  );
  const exploreFallback = fs.readFileSync(
    path.join(__dirname, '../lib/exploreSarhBanners.ts'),
    'utf8',
  );
  const community = fs.readFileSync(
    path.join(__dirname, '../components/feature/HomeCommunityPosts.tsx'),
    'utf8',
  );
  const stories = fs.readFileSync(
    path.join(__dirname, '../components/feature/EditorialStoriesBar.tsx'),
    'utf8',
  );
  const listingCard = fs.readFileSync(
    path.join(__dirname, '../components/feature/ListingCard.tsx'),
    'utf8',
  );
  const quick = fs.readFileSync(
    path.join(__dirname, '../components/feature/HomeQuickAccess.tsx'),
    'utf8',
  );
  const listings = fs.readFileSync(
    path.join(__dirname, '../components/market/MarketListingsFeed.tsx'),
    'utf8',
  );

  it('uses SarhSurface, AppText, and matching primitives on Home-owned files', () => {
    expect(home).toContain("from '@/design-system/layout'");
    expect(home).toContain('<Screen');
    expect(home).toContain('<ScreenBody');
    expect(appBar).toContain('SarhAvatar');
    expect(appBar).toContain('SarhLogoMark');
    expect(appBar).toContain('NotificationBellButton');
    expect(appBar).not.toContain('variant="heading3"');
    expect(appBar).not.toContain('styles.searchBar');
    expect(explore).toContain('SarhButton');
    expect(explore).toContain('HOME_BANNER_CTA_LABEL');
    expect(quick).toContain('الوصول السريع');
    expect(listings).toContain('listMode="market"');
    expect(listings).not.toContain('أحدث الإعلانات');
    expect(community).toContain('مجتمع سرح');
    expect(community).toContain('pickHomeCommunityPosts');
    expect(community).toContain('PostItem');
    expect(stories).toContain('SarhCard');
    expect(stories).toContain('variant="plain"');
    expect(stories).toContain('variant="caption"');
  });

  it('does not remap Home copy through the legacy Bold AppText path', () => {
    for (const src of [appBar, explore, community, stories, quick, listings]) {
      expect(src).not.toContain("from '@/components/ui/AppText'");
      expect(src).not.toContain('OFFICIAL_APP_FONT');
      expect(src).not.toContain('resolveAppFontFace');
      expect(src).not.toContain("fontWeight: '700'");
    }
  });

  it('does not wrap marketplace listing ads or the edge-to-edge butchers hero in SarhCard', () => {
    expect(explore).not.toContain('SarhCard');
    expect(explore).not.toContain('CARD_RADIUS');
    expect(listingCard).not.toContain('@/design-system');
    expect(listingCard).not.toContain('SarhCard');
  });

  it('keeps Home RTL helpers and button labels', () => {
    expect(appBar).toContain("from '@/design-system/layout'");
    expect(community).toContain("from '@/design-system/layout'");
    expect(stories).toContain("from '@/design-system/layout'");
    expect(appBar).toContain('<Row');
    expect(community).toContain('<Row');
    expect(stories).toContain('<Row');
    expect(appBar).toContain('accessibilityRole="button"');
    expect(appBar).not.toContain('accessibilityRole="search"');
    expect(explore).toContain('accessibilityRole="button"');
    expect(exploreFallback).toContain("accessibilityLabel: 'موردو الأعلاف'");
    expect(community).toContain('مجتمع سرح');
    expect(stories).toContain('accessibilityRole="button"');
  });

  it('does not introduce a second Home-only primitive set', () => {
    expect(home).not.toContain('HomeButton');
    expect(home).not.toContain('HomeCard');
    expect(explore).not.toContain('PrimaryButton');
    expect(community).not.toContain('PrimaryButton');
  });

  it('keeps the launch Home section order', () => {
    const exploreAt = home.indexOf('ExploreSarhSection');
    const quickAt = home.indexOf('<HomeQuickAccess');
    const listingsAt = home.indexOf('extraHeader={quickAccess}');
    expect(exploreAt).toBe(-1);
    expect(quickAt).toBeGreaterThan(-1);
    expect(listingsAt).toBeGreaterThan(quickAt);
    expect(home).not.toContain('<HomeFeedSuppliers');
    expect(home).not.toContain('HomeMinistryOrgCard');
    expect(home).not.toContain('<EditorialStoriesBar');
    expect(home).not.toContain('<HomeCommunityPosts');
    expect(home).not.toContain('أحدث الإعلانات');
    expect(explore).toContain('fetchExploreSarhBanners');
    expect(explore).not.toContain('FALLBACK_EXPLORE_SARH_BANNERS');
    expect(exploreFallback).not.toContain('ملاحم سرح');
    expect(exploreFallback).not.toContain('explore-sarh-butchers.jpg');
    expect(exploreFallback).not.toContain("href: '/butchers'");
    expect(exploreFallback).toContain('موردو الأعلاف');
    expect(exploreFallback).toContain('explore-sarh-feed-suppliers.jpg');
    expect(exploreFallback).toContain("href: '/ministry'");
    expect(exploreFallback.indexOf("href: '/feed-suppliers'")).toBeLessThan(
      exploreFallback.indexOf("href: '/ministry'"),
    );
    expect(community).toContain('pickHomeCommunityPosts');
  });
});

