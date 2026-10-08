import { getProfileTabs } from '@/lib/profileTabs';
import { readFileSync } from 'fs';
import path from 'path';

const root = path.join(__dirname, '..');
const src = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

describe('profile tabs: X-style icons, label beside the selected tab only', () => {
  const tabs = src('components/feature/ProfileTabs.tsx');

  it('every tab has an icon from the app line set; same order and keys', () => {
    const own = getProfileTabs(true);
    expect(own.map((t) => [t.key, t.icon, t.activeStyle])).toEqual([
      ['posts', 'document-text', 'bold'],
      ['ads', 'pricetag', 'fill'],
      ['replies', 'chatbubble-ellipses-outline', 'fill'],
      ['reposts', 'repeat-2', 'bold'],
      ['likes', 'heart', 'fill'],
    ]);
    expect(own.map((t) => t.label)).toEqual(['المنشورات', 'الإعلانات', 'الردود', 'إعادة النشر', 'الإعجابات']);
    expect(getProfileTabs(false).map((t) => t.key)).toEqual(['posts', 'ads', 'replies', 'reposts']);
  });

  it('icon always rendered; selected = filled / bold accent, idle = textSecondary outline', () => {
    expect(tabs).toContain('<AppIcon');
    expect(tabs).toContain('activeColor={colors.electric}');
    expect(tabs).toContain('idleColor={colors.textSecondary}');
    expect(tabs).toContain("variant={fill ? 'sr' : 'rr'}");
  });

  it('label reveals with RN Animated width + opacity (~200ms), Arabic accessibilityLabel', () => {
    expect(tabs).toContain('PROFILE_TAB_REVEAL_MS = duration.ui');
    expect(tabs).toContain('outputRange: [0, labelWidth > 0 ? labelWidth + PROFILE_TAB_LABEL_GAP : 0]');
    expect(tabs).toContain('opacity: reveal');
    expect(tabs).toContain('accessibilityLabel={label}');
    expect(tabs).toContain('accessibilityRole="tab"');
    expect(tabs).toContain('minWidth: PROFILE_TAB_MIN_TOUCH');
    expect(tabs).not.toMatch(/reanimated|LinearGradient|shadowColor|elevation/);
  });

  it('keeps the bar height (12 + 20 + 10) and the swipe indicator wiring', () => {
    expect(tabs).toContain('paddingTop: 12,');
    expect(tabs).toContain('paddingBottom: 10,');
    expect(tabs).toContain('PROFILE_TAB_ROW_HEIGHT = 20');
    expect(tabs).toContain('<SwipeTabIndicator');
  });
});
