import { readFileSync } from 'fs';
import path from 'path';

const root = path.join(__dirname, '..');
const src = (rel: string) => readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');

/** Body of a StyleSheet entry `name: { ... }` (first match). */
function styleBlock(file: string, name: string): string {
  const start = file.indexOf(`    ${name}: {`);
  expect(start).toBeGreaterThan(-1);
  return file.slice(start, file.indexOf('\n    },', start));
}

describe('Profile cover: full screen width', () => {
  const layout = src('components/feature/ProfileScreenLayout.tsx');

  it('profile cover band runs edge to edge (no gutter, no side margin, square corners)', () => {
    // Cover lives in a gutter-less body, outside the inset identity block.
    expect(layout).toContain('gutter={false}');
    const coverIdx = layout.indexOf(
      '<View style={[styles.coverBand, { height: PROFILE_COVER_HEIGHT + insets.top }]} testID="profile-cover">',
    );
    expect(coverIdx).toBeGreaterThan(-1);
    const band = styleBlock(layout, 'coverBand');
    expect(band).toContain("width: '100%'");
    expect(band).toContain("alignSelf: 'stretch'");
    expect(band).toContain('marginHorizontal: 0');
    expect(band).toContain('borderRadius: 0');
    expect(band).not.toMatch(/paddingHorizontal|marginStart|marginEnd|marginLeft|marginRight/);
    // Height and avatar overlap unchanged.
    expect(band).toContain('height: PROFILE_COVER_HEIGHT');
    expect(layout).toContain('export const PROFILE_COVER_HEIGHT = 112;');
    expect(layout).toContain('export const PROFILE_AVATAR_COVER_OVERLAP = 44;');
  });

  it('same layout for own and other users profiles', () => {
    expect(src('app/(tabs)/profile.tsx')).toContain('<ProfileScreenLayout');
    expect(src('app/users/[id].tsx')).toContain('<ProfileScreenLayout');
  });

  it('cover toolbar buttons stay inside the gutter and below the top inset', () => {
    expect(layout).toContain('style={[styles.toolbar, inset, { paddingTop: spacing.xs + insets.top }]}');
    expect(layout).not.toContain("chrome={user.coverImage ? 'glass' : 'ghost'}");
  });
});

describe('Edit profile cover: full screen width', () => {
  const edit = src('app/profile/edit/index.tsx');

  it('escapes the form gutter with FullBleed', () => {
    expect(edit).toContain("import { FullBleed, Row, Screen, ScreenBody, Stack } from '@/design-system/layout';");
    const bleed = edit.indexOf('<FullBleed testID="edit-profile-cover">');
    expect(bleed).toBeGreaterThan(-1);
    expect(edit.indexOf('<View style={styles.coverFrame}>')).toBeGreaterThan(bleed);
  });

  it('cover frame has no rounded corners or side borders; height kept', () => {
    const frame = styleBlock(edit, 'coverFrame');
    expect(frame).toContain('height: 104');
    expect(frame).toContain("width: '100%'");
    expect(frame).not.toMatch(/borderRadius|marginHorizontal|paddingHorizontal/);
    expect(frame).not.toMatch(/\bborderWidth\b/);
    expect(frame).toContain('borderTopWidth: StyleSheet.hairlineWidth');
    expect(frame).toContain('borderBottomWidth: StyleSheet.hairlineWidth');
  });

  it('cover change / replace / remove flow untouched', () => {
    expect(edit).toContain('onPress={() => void handleCover()}');
    expect(edit).toContain('updateMe({ coverImage: next })');
    expect(edit).toContain('aspect: [3, 1]');
  });
});
