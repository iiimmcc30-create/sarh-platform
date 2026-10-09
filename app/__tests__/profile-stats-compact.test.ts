import { readFileSync } from 'fs';
import path from 'path';
import { GAP } from '@/design-system/layout/metrics';
import { typography } from '@/design-system/tokens/typography';

const root = path.join(__dirname, '..');
const src = (rel: string) => readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');

function styleBlock(file: string, name: string, indent = '    '): string {
  const start = file.indexOf(`${indent}${name}: {`);
  expect(start).toBeGreaterThan(-1);
  return file.slice(start, file.indexOf(`\n${indent}},`, start));
}

describe('Profile stats: X-style inline («677 المتابعون»), compact, no dividers', () => {
  const layout = src('components/feature/ProfileScreenLayout.tsx');
  const row = src('components/feature/ProfileStatsRow.tsx');
  // Read the tokens from source (importing the component pulls native modules into this node test).
  const tokenOf = (name: string) => row.match(new RegExp(`export const ${name} = '(\\w+)' as const;`))?.[1];
  const PROFILE_STATS_ITEM_GAP = tokenOf('PROFILE_STATS_ITEM_GAP') as keyof typeof GAP;
  const PROFILE_STATS_INNER_GAP = tokenOf('PROFILE_STATS_INNER_GAP') as keyof typeof GAP;
  const PROFILE_STATS_VARIANT = tokenOf('PROFILE_STATS_VARIANT');

  it('the profile shell renders the shared stats row (no pill-sized block / spacer)', () => {
    expect(layout).toContain('<ProfileStatsRow stats={stats} style={styles.statsRow} />');
    expect(layout).not.toContain('styles.statsBlock');
    expect(layout).not.toContain('styles.statsSpacer');
    expect(layout).not.toContain('PROFILE_STATS_HEIGHT');
  });

  it('one right-aligned (inline start) wrapping row, 12pt between items, 4pt number→label', () => {
    expect(row).toContain('justify="start"');
    expect(row).toContain('testID="profile-stats-row"');
    expect(PROFILE_STATS_ITEM_GAP).toBe('md');
    expect(GAP[PROFILE_STATS_ITEM_GAP]).toBe(12);
    expect(PROFILE_STATS_INNER_GAP).toBe('xs');
    expect(GAP[PROFILE_STATS_INNER_GAP]).toBe(4);
  });

  it('number first (right in RTL), label to its left; bold number, regular secondary label', () => {
    const value = row.indexOf('{stat.value}');
    const label = row.indexOf('{stat.label}');
    expect(value).toBeGreaterThan(-1);
    expect(label).toBeGreaterThan(value);
    const valueTag = row.slice(row.lastIndexOf('<AppText', value), value);
    const labelTag = row.slice(row.lastIndexOf('<AppText', label), label);
    expect(valueTag).toContain('color="textPrimary"');
    expect(valueTag).toContain('style={styles.value}');
    expect(labelTag).toContain('color="textSecondary"');
    expect(styleBlock(row, 'value', '  ')).toContain('fontFamily: fontFamily.bold');
  });

  it('smaller: caption (12/18) for number and label, one step under the 14pt bodySmall', () => {
    expect(PROFILE_STATS_VARIANT).toBe('caption');
    expect(typography.caption.fontSize).toBe(12);
    expect(typography.caption.fontSize).toBeLessThan(typography.bodySmall.fontSize);
    expect(row).toContain('variant={PROFILE_STATS_VARIANT}');
    expect(row).not.toMatch(/variant="(label|meta|cardTitle|bodySmall)"/);
  });

  it('12pt under the bio (8 Stack gap + 4), no dividers, backgrounds or borders', () => {
    const block = styleBlock(layout, 'statsRow');
    expect(block).toContain('paddingTop: spacing.xs');
    expect(block).not.toMatch(/backgroundColor|borderWidth|borderColor|borderRadius/);
    expect(layout).not.toContain('statDivider');
    expect(row).not.toContain('Divider');
  });

  it('keeps order and tap actions (followers, following); posts only in the sticky header', () => {
    const f = layout.indexOf("key: 'followers'");
    const g = layout.indexOf("key: 'following'");
    expect(f).toBeGreaterThan(-1);
    expect(g).toBeGreaterThan(f);
    expect(layout).not.toContain("key: 'posts'");
    expect(layout).not.toContain("label: 'المنشورات'");
    const sticky = layout.slice(layout.indexOf('testID="profile-sticky-title"'));
    expect(sticky).toContain('{formatStatCount(user.postsCount)} من المنشورات');
    expect(src('components/ui/skeleton/ProfileHeaderSkeleton.tsx')).toContain('{[0, 1].map((i) => (');
    expect(layout).toContain('onPress: onFollowersPress');
    expect(layout).toContain('onPress: onFollowingPress');
    expect(row).toContain('onPress={stat.onPress}');
  });

  it('loading skeleton mirrors the compact inline row', () => {
    const sk = src('components/ui/skeleton/ProfileHeaderSkeleton.tsx');
    expect(sk).not.toContain('PROFILE_STATS_HEIGHT');
    expect(sk).toContain('ds.caption.fontSize');
    const block = styleBlock(sk, 'statsRow', '  ');
    expect(block).toContain('gap: spacing.md');
    expect(block).toContain('paddingTop: spacing.xs');
  });
});

describe('Profile @handle → bio spacing (clear 16pt)', () => {
  const layout = src('components/feature/ProfileScreenLayout.tsx');
  it('8 (Stack gap) + 8 = 16pt between the @handle and the bio', () => {
    expect(layout).toContain('<Stack gap="sm" style={inset}>');
    expect(GAP.sm + GAP.sm).toBe(16);
    expect(styleBlock(layout, 'bio')).toContain('paddingTop: spacing.sm');
  });
});
