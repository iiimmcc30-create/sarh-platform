import { readFileSync } from 'fs';
import path from 'path';

const root = path.join(__dirname, '..');

function src(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8');
}

describe('search architecture', () => {
  it('runs unified search on the tab instead of pushing a second search route', () => {
    const search = src('app/search.tsx');
    expect(search).toContain('unifiedSearch({');
    expect(search).not.toContain('if (isTab) return');
    expect(search).not.toContain("pathname: '/search'");
    expect(search).toContain('center={searchField}');
    expect(search).toContain('size="compact"');
    expect(search).toContain("phase === 'home'");
    expect(search).toContain("phase === 'mode'");
    expect(search).toContain("phase === 'results'");
  });

  it('keeps a single compact field in the identity row between avatar and notifications', () => {
    const search = src('app/search.tsx');
    expect(search).toContain('<HomeAppBar');
    expect(search).toContain('center={searchField}');
    expect(search).toContain('<View style={styles.searchSlot}>{chromeTabs}</View>');
    expect(search).toContain('RESULT_SECTIONS');
    expect(search).toContain('EXPLORE_SECTIONS');
    expect(search).toContain('loading && totalResults === 0');
    expect(search).toContain('error && totalResults === 0');
    expect(search).toContain('!loading && !error && canSearch && totalResults === 0');
  });

  it('renders listings, posts, and services with the native home/community/ministry cards', () => {
    const search = src('app/search.tsx');
    expect(search).toContain('<ListingCard');
    expect(search).toContain('variant="list"');
    expect(search).toContain('listMode="market"');
    expect(search).toContain('<PostItem');
    expect(search).toContain('mapPostFromSearch');
    expect(search).toContain('<MinistryServiceCard');
    expect(search).toContain("if (type === 'listings') return styles.listingResult");
    expect(search).toContain("if (type === 'posts') return styles.postResult");
    expect(search).toContain('styles.insetResult');
    expect(search).toContain('newsCard:');
    expect(search).not.toContain('ListingCard layout');
    expect(search).not.toContain('PostItem layout');
  });

  it('dedupes and caches search requests through the existing coordinator', () => {
    const client = src('services/unifiedSearch.ts');
    expect(client).toContain('dedupeInflight');
    expect(client).toContain('shouldReuseFreshResult');
    expect(client).toContain('searchCacheKey');
    expect(client).toContain('signal: params.signal');
  });

  it('includes people in the mixed latest ranking group', () => {
    const backend = readFileSync(
      path.join(root, '..', 'backend-nest/src/search/unified-search.service.ts'),
      'utf8',
    );
    expect(backend).toContain("'listings', 'posts', 'users'");
    expect(backend).toContain('Promise.all');
  });

  it('loads enough post fields for the native PostItem card', () => {
    const repo = readFileSync(
      path.join(root, '..', 'backend-nest/src/search/repositories/unified-search.repository.ts'),
      'utf8',
    );
    expect(repo).toContain('arabicContent: true');
    expect(repo).toContain('likesCount: true');
    expect(repo).toContain('commentsCount: true');
    expect(repo).toContain('viewsCount: true');
    expect(repo).toContain('repostsCount: true');
    expect(repo).toContain('images: true');
  });

  it('cancels the previous search when the query changes or the screen unmounts', () => {
    const search = src('app/search.tsx');
    expect(search).toContain('abortRef.current?.abort()');
    expect(search).toContain('Keyboard.dismiss()');
    expect(search).toContain('if (seq !== searchSeq.current) return');
    expect(search).toContain('useDebouncedValue(query.trim(), 350)');
  });

  it('collapses identity on scroll and keeps categories sticky without Reanimated', () => {
    const search = src('app/search.tsx');
    const hook = src('hooks/useCollapsibleSearchHeader.ts');
    const tabs = src('components/navigation/FloatingTabBar.tsx');
    const appBar = src('components/ui/HomeAppBar.tsx');
    expect(search).toContain('useCollapsibleSearchHeader(SHELL_IDENTITY_COLLAPSE_H)');
    expect(search).toContain('collapseStyle={collapseStyle}');
    expect(search).toContain('identityStyle={identityStyle}');
    expect(search).toContain('<View style={styles.searchSlot}>{chromeTabs}</View>');
    expect(search).toContain("bottomInset={isTab && phase === 'home' ? 'tabBar' : 'none'}");
    expect(search).toContain('bindChromeScroll={false}');
    expect(search).toContain('onChromeScroll(event)');
    expect(search).toContain('setTabBarForceHidden');
    expect(search).toContain("tabBarStyle: hideTabBar");
    expect(search).toContain('BackHandler.addEventListener');
    expect(search).toContain('hardwareBackPress');
    expect(search).toContain("if (phaseRef.current !== 'results')");
    expect(search).toContain('headerMeasuredRef');
    expect(search).toContain('scrollingRef.current');
    expect(search).toContain('{ height: bodyPaddingTop }');
    expect(search).toContain('styles.chromeClip');
    expect(search).not.toContain('react-native-reanimated');
    expect(hook).toContain('Animated.diffClamp');
    expect(hook).toContain('useNativeDriver: false');
    expect(hook).not.toContain('setState');
    expect(tabs).toContain('if (tabBarForceHidden)');
    expect(tabs).toContain('return null');
    expect(appBar).toContain('SHELL_IDENTITY_COLLAPSE_H');
    expect(appBar).toContain('collapseStyle');
  });

  it('keeps one Search input instance across Home/Mode/Results and does not autofocus Mode', () => {
    const search = src('app/search.tsx');
    expect(search).toContain('center={searchField}');
    expect(search).toContain('leading={phase === \'home\' ? undefined : sessionBack}');
    expect(search).toContain('showNotifications={phase !== \'mode\'}');
    expect(search).toContain('autoFocus={!isTab}');
    expect(search).not.toContain('autoFocus={phase === \'mode\'}');
    expect(search).not.toContain('overlayChrome');
    expect(search).not.toContain('modeChrome');
    expect(search).not.toContain('resultsChrome');
  });
});
