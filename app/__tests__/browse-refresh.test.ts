import { readFileSync } from 'fs';
import path from 'path';

const browse = readFileSync(path.join(__dirname, '../app/market/browse.tsx'), 'utf8');

describe('P0-2 browse keeps results while filter/search revalidates', () => {
  it('shows a blocking spinner only on the initial empty load', () => {
    expect(browse).toContain('useState(true)');
    expect(browse).toContain('if (!hasItemsRef.current) setLoading(true)');
    expect(browse).toContain('(loading || loadFailed) && items.length === 0');
    expect(browse).not.toMatch(/^\s*setLoading\(true\);/m);
  });

  it('does not unmount existing rows for a filter or search refetch', () => {
    expect(browse).toContain('hasItemsRef.current = items.length > 0');
    expect(browse).toContain('if (!hasItemsRef.current) setLoading(true)');
    expect(browse).toContain('debouncedSearch');
    expect(browse).toContain('activeCountry');
    expect(browse).toContain('showFeaturedOnly');
    expect(browse).toContain('[loadFirstPage]');
  });

  it('keeps the current page visible until the in-flight first page resolves', () => {
    expect(browse).not.toMatch(/setLoading\(true\);\s*setItems\(\[\]\)/);
    expect(browse).toContain('setItems(await applyClientFilters(page.listings))');
    expect(browse).toContain('loadingMore ? <ActivityIndicator');
  });

  it('replaces results on success and keeps them on failure', () => {
    expect(browse).toContain('setItems(await applyClientFilters(page.listings))');
    expect(browse).toContain('setLoadFailed(true)');
    expect(browse).toContain('Keep the last good page');
    expect(browse).not.toMatch(/catch \{[\s\S]*setItems\(\[\]\)/);
  });

  it('lets a successful empty page show the empty state instead of a stuck spinner', () => {
    expect(browse).toContain("لا توجد إعلانات في هذا التصنيف");
    expect(browse).toContain('if (gen === loadGenRef.current) setLoading(false)');
    expect(browse).toContain('setItems(await applyClientFilters(page.listings))');
  });

  it('drops stale first-page results when a newer filter/search request wins', () => {
    expect(browse).toContain('const gen = ++loadGenRef.current');
    expect(browse).toContain('if (gen !== loadGenRef.current) return');
    expect(browse).toContain('if (gen === loadGenRef.current) setLoading(false)');
  });

  it('does not add pull-to-refresh or change pagination wiring', () => {
    expect(browse).not.toContain('RefreshControl');
    expect(browse).not.toContain('onRefresh');
    expect(browse).toContain('shouldFetchNextListingPage');
    expect(browse).toContain('onEndReached');
    expect(browse).toContain('setLoadingMore(true)');
  });
});
