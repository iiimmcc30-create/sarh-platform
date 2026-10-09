import { readFileSync } from 'fs';
import path from 'path';
import {
  AVATAR_HAIRLINE,
  STORY_RING_GRADIENT,
  STORY_RING_SEEN_STROKE,
  avatarHairlineColor,
  storyRingStroke,
} from '../constants/storyRing';
import { snapshotTheme } from '../constants/theme';

const root = path.join(__dirname, '..');
const src = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

describe('TikTok-style story ring (blue → green gradient)', () => {
  const ring = src('components/ui/StoryRing.tsx');
  const bar = src('components/feature/StoriesBar.tsx');
  const profile = src('components/feature/ProfileScreenLayout.tsx');

  it('uses the colours sampled from the reference, top-left blue → bottom-right green', () => {
    expect(STORY_RING_GRADIENT.map((s) => s.color)).toEqual(['#11A9EA', '#26D4DE', '#13EFA5']);
    expect(STORY_RING_GRADIENT.map((s) => s.offset)).toEqual([0, 0.5, 1]);
    // Axis runs top-left → bottom-right through the ring centre line.
    expect(ring).toContain('x1={c - d}');
    expect(ring).toContain('y1={c - d}');
    expect(ring).toContain('x2={c + d}');
    expect(ring).toContain('y2={c + d}');
  });

  it('gradient colours are scheme-independent (no theme colour feeds the unseen stroke)', () => {
    expect(ring).toContain("stroke={unseen ? `url(#${gradientId})` : colors.borderSoft}");
    expect(ring).toMatch(/stopColor=\{s\.color\}/);
    expect(ring).not.toMatch(/colors\.(electric|glow|cyan)/);
  });

  it('is drawn with the already-installed react-native-svg (no new native library)', () => {
    expect(ring).toContain("from 'react-native-svg'");
    expect(ring).not.toContain('expo-linear-gradient');
    const pkg = JSON.parse(src('package.json'));
    expect(pkg.dependencies['react-native-svg']).toBeDefined();
  });

  it('seen ring is a thin theme grey (#2F3336 Dark / #E6E8EB Light)', () => {
    expect(STORY_RING_SEEN_STROKE).toBe(1.5);
    expect(snapshotTheme('dark').colors.borderSoft.toUpperCase()).toBe('#2F3336');
    expect(snapshotTheme('light').colors.borderSoft.toUpperCase()).toBe('#E6E8EB');
  });

  it('ring thickness follows the reference (~4% of the ring diameter) with a page-bg gap', () => {
    expect(storyRingStroke(56)).toBe(2.25);
    expect(storyRingStroke(64)).toBe(2.5);
    expect(ring).toContain('fill={gapColor ?? colors.bgDeep}');
  });

  it('the old solid white/black ring is gone everywhere a story ring is drawn', () => {
    for (const text of [bar, profile]) {
      expect(text).not.toContain('ringUnseen');
      expect(text).not.toMatch(/avatarRing: \{[^}]*colors\.electric/);
      expect(text).not.toMatch(/#F58529|#DD2A7B|#8134AF|#515BD4/i);
    }
    expect(bar).toContain("state={unseen ? 'unseen' : 'seen'}");
    expect(profile).toContain('<StoryRing');
    expect(profile).toContain('gapColor={themeColors.screenRoot}');
  });

  it('same ring for everyone: no subscriber / tier colours on story rings', () => {
    expect(bar).not.toMatch(/verifiedTier|gold|#C9A227|#1D9BF0/i);
    expect(ring).not.toMatch(/verifiedTier|gold|#C9A227|#1D9BF0/i);
  });

  it('keeps ring geometry, avatar size and the add-story slot unchanged', () => {
    expect(bar).toContain('const DEFAULT_CIRCLE = 64;');
    expect(bar).toContain('const AVATAR_INSET = 6;');
    expect(bar).toContain('width: CIRCLE - AVATAR_INSET * 2,');
    expect(bar).toContain("borderStyle: 'dashed',");
    expect(bar).toContain('<AppIcon name="add" size={13} color={colors.onElectric} />');
  });
});

describe('X-style avatars (no white ring)', () => {
  it('hairline token is barely visible in both schemes', () => {
    expect(AVATAR_HAIRLINE.dark).toBe('rgba(255,255,255,0.10)');
    expect(AVATAR_HAIRLINE.light).toBe('rgba(0,0,0,0.07)');
    expect(avatarHairlineColor('dark')).toBe(AVATAR_HAIRLINE.dark);
    expect(avatarHairlineColor('light')).toBe(AVATAR_HAIRLINE.light);
  });

  it('SarhAvatar draws only a hairline edge', () => {
    const avatar = src('design-system/components/SarhAvatar.tsx');
    expect(avatar).toContain('borderWidth: StyleSheet.hairlineWidth,');
    expect(avatar).toContain('borderColor: avatarHairlineColor(scheme),');
  });

  it('home bar, listing seller and chat-list avatars drop the accent / grey ring', () => {
    const bar = src('components/ui/HomeAppBar.tsx');
    expect(bar).not.toMatch(/avatar: \{[^}]*borderColor: colors\.electric/);
    expect(bar).not.toMatch(/avatar: \{[^}]*borderWidth: 2/);
    const listing = src('app/listing/[id].tsx');
    expect(listing).toMatch(/sellerInlineAvatar: \{[^}]*borderWidth: StyleSheet\.hairlineWidth,[^}]*avatarHairlineColor\(scheme\)/);
    const messages = src('components/feature/MessagesPanel.tsx');
    expect(messages).toMatch(/avatar: \{[^}]*borderWidth: StyleSheet\.hairlineWidth,[^}]*avatarHairlineColor\(scheme\)/);
  });

  it('profile header keeps a page-background cutout (never white) and its sizes', () => {
    const profile = src('components/feature/ProfileScreenLayout.tsx');
    expect(profile).toMatch(/avatarPlain: \{[^}]*width: 88,[^}]*borderColor: colors\.screenRoot,/);
    expect(profile).toContain('export const PROFILE_STORY_RING_SIZE = 92;');
  });
});
