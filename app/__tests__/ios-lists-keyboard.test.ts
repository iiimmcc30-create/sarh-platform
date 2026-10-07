import { readFileSync } from 'fs';
import path from 'path';

const root = path.join(__dirname, '..');
const src = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

describe('iOS lists: pull-to-refresh and keyboard', () => {
  it('every pull-to-refresh uses the one neutral AppRefreshControl', () => {
    const control = src('components/ui/AppRefreshControl.tsx');
    expect(control).toContain('tintColor={colors.textMuted}');
    expect(control).toContain('{...props}');
    for (const file of [
      'app/favorites.tsx',
      'app/collections/index.tsx',
      'app/collections/[id]/index.tsx',
      'app/feed-suppliers/index.tsx',
      'app/(tabs)/posts.tsx',
      'app/councils/index.tsx',
      'app/notifications/index.tsx',
      'app/ministry/index.tsx',
      'components/feature/ProfileScreenLayout.tsx',
      'components/feature/MessagesPanel.tsx',
    ]) {
      const s = src(file);
      expect(s).toContain('<AppRefreshControl');
      expect(s).not.toMatch(/<RefreshControl\b/);
    }
  });

  it('scroll views dismiss the keyboard like iOS (interactive) / Android (on drag)', () => {
    for (const file of ['components/ui/AppScrollView.tsx', 'components/ui/AppFlatList.tsx']) {
      const s = src(file);
      expect(s).toContain("keyboardDismissMode = Platform.OS === 'ios' ? 'interactive' : 'on-drag'");
      expect(s).toContain('keyboardDismissMode={keyboardDismissMode}');
    }
  });
});
