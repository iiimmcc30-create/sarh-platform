import { existsSync, readFileSync } from 'fs';
import path from 'path';
import * as homeQuickAccess from '../lib/homeQuickAccess';

const root = path.join(__dirname, '..');
const src = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

describe('Home «الوصول السريع» rail removed', () => {
  it('Home no longer renders the quick-access rail', () => {
    const home = src('app/(tabs)/index.tsx');
    expect(home).not.toContain('HomeQuickAccess');
    expect(home).not.toContain('HOME_QUICK_ACCESS_ITEMS');
    expect(home).toContain('<HomeStoriesRow />');
    expect(home).toContain('extraHeader={homeHeader}');
    expect(existsSync(path.join(root, 'components/feature/HomeQuickAccess.tsx'))).toBe(false);
  });

  it('drops the rail catalog but keeps the constants other code imports', () => {
    expect('HOME_QUICK_ACCESS_ITEMS' in homeQuickAccess).toBe(false);
    expect(homeQuickAccess.HOME_TAB_RESELECT_EVENT).toBe('sarh:homeTabReselect');
    expect(homeQuickAccess.HOME_FEED_SUPPLIERS_PREVIEW_LIMIT).toBe(4);
    expect(homeQuickAccess.HOME_BANNER_CTA_HREF).toBe('/feed-suppliers');
    expect(homeQuickAccess.HOME_QUICK_ACCESS_CHIP_VARIANT).toBe('secondary');
    expect(src('lib/quickAccessSurface.ts')).toContain('HOME_QUICK_ACCESS_CHIP_VARIANT');
  });

  it('councils, bookmarks and settings stay reachable from the sidebar', () => {
    const sidebar = src('components/feature/AppSidebar.tsx');
    expect(sidebar).toContain("route: '/councils'");
    expect(sidebar).toContain("route: '/bookmarks'");
    expect(sidebar).toContain("route: '/profile/settings'");
  });
});
