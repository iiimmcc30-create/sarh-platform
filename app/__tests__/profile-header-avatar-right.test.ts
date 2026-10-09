import { readFileSync } from 'fs';
import path from 'path';

const root = path.join(__dirname, '..');
const src = (rel: string) => readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');

function styleBlock(file: string, name: string): string {
  const start = file.indexOf(`    ${name}: {`);
  expect(start).toBeGreaterThan(-1);
  return file.slice(start, file.indexOf('\n    },', start));
}

describe('Profile header: avatar right, name under it, rating inline with the handle', () => {
  const layout = src('components/feature/ProfileScreenLayout.tsx');
  const avatarRow = layout.indexOf('testID="profile-avatar-row"');
  const avatar = layout.indexOf('testID="profile-avatar"');
  const nameRow = layout.indexOf('testID="profile-name-row"');
  const name = layout.indexOf('{displayName}');
  const rating = layout.indexOf('testID="profile-rating"');
  const username = layout.indexOf('testID="profile-username"');
  const stats = layout.indexOf('style={styles.statsRow}');

  it('avatar sits alone at the inline start (right in RTL) above the name', () => {
    expect(avatarRow).toBeGreaterThan(-1);
    expect(layout).toContain('<Row align="end" justify="start" style={styles.avatarRow} testID="profile-avatar-row">');
    // First (and only) child of the avatar row is the avatar → RTL start = right.
    expect(avatar).toBeGreaterThan(avatarRow);
    expect(avatar).toBeLessThan(nameRow);
    // Overlap with the cover kept.
    expect(styleBlock(layout, 'avatarCol')).toContain('marginTop: -PROFILE_AVATAR_COVER_OVERLAP');
  });

  it('name is under the avatar and @username under the name', () => {
    expect(name).toBeGreaterThan(nameRow);
    expect(username).toBeGreaterThan(name);
    expect(username).toBeLessThan(stats);
  });

  it('one star + average + count on the @handle line (single line, handle truncates)', () => {
    const handleRow = layout.indexOf('testID="profile-handle-row"');
    expect(handleRow).toBeGreaterThan(name);
    expect(username).toBeGreaterThan(handleRow);
    expect(rating).toBeGreaterThan(username);
    expect(rating).toBeLessThan(stats);
    const ratingBlock = layout.slice(rating, layout.indexOf('</Pressable>', rating));
    // Exactly one star glyph (no five-star row), monochrome textPrimary when rated.
    expect(ratingBlock.match(/<AppIcon/g)).toHaveLength(1);
    expect(ratingBlock).toContain("name={rating ? 'star' : 'star-outline'}");
    expect(ratingBlock).toContain('color={rating ? themeColors.textPrimary : themeColors.textSecondary}');
    expect(ratingBlock).toContain('{rating.average}');
    expect(ratingBlock).toContain('{rating.count}');
    expect(layout).not.toContain('[1, 2, 3, 4, 5].map');
    expect(layout).not.toContain('testID="profile-since"');
    expect(styleBlock(layout, 'handleRow')).toContain("flexWrap: 'nowrap'");
    expect(styleBlock(layout, 'ratingRow')).toContain('flexShrink: 0');
    expect(styleBlock(layout, 'usernamePress')).toContain('flexShrink: 1');
    expect(styleBlock(layout, 'nameCluster')).toContain('flexShrink: 1');
  });

  it('name and @handle open «عن هذا الحساب»', () => {
    const nameAt = layout.indexOf('testID="profile-name"');
    expect(layout.slice(nameAt, layout.indexOf('style={styles.nameCluster}', nameAt))).toContain('onPress={openAbout}');
    const handleAt = layout.indexOf('testID="profile-username-press"');
    expect(layout.slice(layout.lastIndexOf('<Pressable', handleAt), handleAt)).toContain('onPress={openAbout}');
    expect(layout).toContain('router.push({ pathname: ABOUT_ACCOUNT_ROUTE, params: { id: user.id } } as never)');
  });

  it('username is larger and clearer than the old caption/muted, still lighter than the name', () => {
    const tag = layout.slice(layout.lastIndexOf('<AppText', username), username);
    expect(tag).toContain('variant="label"');
    expect(tag).toContain('color="textSecondary"');
    expect(layout).not.toContain('<AppText variant="caption" color="textMuted" numberOfLines={1}>\n                    @{user.username}');
    const typo = src('design-system/tokens/typography.ts');
    expect(typo).toMatch(/label: \{[^}]*fontSize: 15/);
    expect(typo).toMatch(/caption: \{[^}]*fontSize: 12/);
    expect(typo).toMatch(/heading3: \{[^}]*fontSize: 18/);
  });

  it('keeps stats, bio, own pills and visitor follow/message actions', () => {
    expect(layout).toContain('{user.bio ? (');
    expect(layout).toContain('title={PROFILE_SHARE_LABEL}');
    expect(layout).toContain('title={PROFILE_EDIT_LABEL}');
    expect(layout).toContain("title={isFollowing ? 'متابَع' : followsYou ? 'رد المتابعة' : 'تابِع'}");
    expect(layout).toContain('title="رسالة"');
    expect(layout).toContain('onPress={onRatePress}');
    // Camera shortcut on the avatar removed: the avatar is changed from Edit profile.
    expect(layout).not.toContain('onEditAvatar');
    expect(layout).not.toContain('camera-outline');
  });
});
