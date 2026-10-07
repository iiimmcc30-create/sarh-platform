import { readFileSync } from 'fs';
import path from 'path';
import {
  PROFILE_ACTION_PILL_GAP,
  PROFILE_ACTION_PILL_HEIGHT,
  PROFILE_STATS_HEIGHT,
} from '@/lib/profileHeader';

const root = path.join(__dirname, '..');
const src = (rel: string) => readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');

function styleBlock(file: string, name: string): string {
  const start = file.indexOf(`    ${name}: {`);
  expect(start).toBeGreaterThan(-1);
  return file.slice(start, file.indexOf('\n    },', start));
}

describe('Profile stats: compact, right-aligned, sized like the edit pill', () => {
  const layout = src('components/feature/ProfileScreenLayout.tsx');

  it('stats height equals the edit pill height (44)', () => {
    expect(PROFILE_STATS_HEIGHT).toBe(PROFILE_ACTION_PILL_HEIGHT);
    expect(PROFILE_STATS_HEIGHT).toBe(44);
    expect(styleBlock(layout, 'statsBlock')).toContain('height: PROFILE_STATS_HEIGHT');
  });

  it('stats width follows the pill slot rule: two equal slots split by the pill gap', () => {
    const row = styleBlock(layout, 'statsRow');
    expect(row).toContain('gap: PROFILE_ACTION_PILL_GAP');
    expect(styleBlock(layout, 'ownActionsRow')).toContain('gap: PROFILE_ACTION_PILL_GAP');
    for (const name of ['statsBlock', 'statsSpacer']) {
      const b = styleBlock(layout, name);
      expect(b).toContain('flexGrow: 1');
      expect(b).toContain('flexBasis: 0');
    }
    // Same slot rule as the pills.
    const pill = styleBlock(layout, 'pill');
    expect(pill).toContain('flexGrow: 1');
    expect(pill).toContain('flexBasis: 0');
    // On a 390pt phone (16pt gutter): (390 - 32 - 12) / 2 = 173 for both.
    expect((390 - 32 - PROFILE_ACTION_PILL_GAP) / 2).toBe(173);
  });

  it('block sits at the inline start (right in RTL): block first, spacer second', () => {
    const block = layout.indexOf('testID="profile-stats"');
    const spacer = layout.indexOf('<View style={styles.statsSpacer} />');
    expect(layout.indexOf('testID="profile-stats-row"')).toBeLessThan(block);
    expect(block).toBeGreaterThan(-1);
    expect(spacer).toBeGreaterThan(block);
  });

  it('size of the pill, not its shape: no background, border or radius; no dividers', () => {
    for (const name of ['statsRow', 'statsBlock', 'statItem', 'statPress']) {
      expect(styleBlock(layout, name)).not.toMatch(/backgroundColor|borderWidth|borderColor|borderRadius/);
    }
    expect(layout).not.toContain('statDivider');
  });

  it('smaller numbers and labels that fit the 44 box', () => {
    const block = layout.slice(layout.indexOf('testID="profile-stats"'), layout.indexOf('<View style={styles.statsSpacer} />'));
    expect(block).toContain('variant="label"');
    expect(block).toContain('variant="meta"');
    expect(block).not.toContain('variant="cardTitle"');
    const typo = src('design-system/tokens/typography.ts');
    // 15/20 number + 11/14 label = 34 <= 44.
    expect(typo).toMatch(/label: \{[^}]*lineHeight: 20/);
    expect(typo).toMatch(/micro: \{[^}]*lineHeight: 14/);
  });

  it('keeps order and tap actions (followers, following, posts)', () => {
    const f = layout.indexOf("key: 'followers'");
    const g = layout.indexOf("key: 'following'");
    const p = layout.indexOf("key: 'posts'");
    expect(f).toBeGreaterThan(-1);
    expect(g).toBeGreaterThan(f);
    expect(p).toBeGreaterThan(g);
    expect(layout).toContain('onPress: onFollowersPress');
    expect(layout).toContain('onPress: onFollowingPress');
    expect(layout).toContain('onPress={stat.onPress}');
  });

  it('loading skeleton mirrors the compact stats block', () => {
    const sk = src('components/ui/skeleton/ProfileHeaderSkeleton.tsx');
    expect(sk).toContain('height: PROFILE_STATS_HEIGHT');
    expect(sk).toContain('gap: PROFILE_ACTION_PILL_GAP');
  });
});
