import { readFileSync } from 'fs';
import path from 'path';
import {
  VERIFIED_CHECK_PATH,
  VERIFIED_SEAL_LOBES,
  VERIFIED_SEAL_PATH,
  VERIFIED_SEAL_VIEWBOX,
  VERIFIED_SHEET_TITLE,
  buildVerifiedSealPath,
  formatVerifiedSince,
  verifiedBadgeColor,
} from '@/lib/verifiedBadge';

const root = path.join(__dirname, '..');
const src = (rel: string) => readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');

describe('X-style verified seal', () => {
  it('is a closed scalloped outline inside the 24 viewBox', () => {
    expect(VERIFIED_SEAL_VIEWBOX).toBe(24);
    expect(VERIFIED_SEAL_LOBES).toBe(8);
    expect(VERIFIED_SEAL_PATH.startsWith('M')).toBe(true);
    expect(VERIFIED_SEAL_PATH.endsWith('Z')).toBe(true);
    const nums = VERIFIED_SEAL_PATH.match(/-?\d+(\.\d+)?/g)!.map(Number);
    expect(nums.length).toBeGreaterThan(100);
    for (const n of nums) {
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(24);
    }
    expect(buildVerifiedSealPath()).toBe(VERIFIED_SEAL_PATH);
    expect(VERIFIED_CHECK_PATH).toMatch(/^M[\d. ]+L[\d. ]+L[\d. ]+$/);
  });

  it('blue #1D9BF0 by default, gold tier kept', () => {
    expect(verifiedBadgeColor('blue')).toBe('#1D9BF0');
    expect(verifiedBadgeColor(null)).toBe('#1D9BF0');
    expect(verifiedBadgeColor('gold')).toBe('#C9A227');
  });

  it('badge component draws the seal + white check with react-native-svg', () => {
    const badge = src('components/ui/VerificationBadge.tsx');
    expect(badge).toContain("from 'react-native-svg'");
    expect(badge).toContain('d={VERIFIED_SEAL_PATH}');
    expect(badge).toContain('d={VERIFIED_CHECK_PATH}');
    expect(badge).toContain('stroke={VERIFIED_CHECK_COLOR}');
  });
});

describe('Verified info sheet', () => {
  it('formats «موثّق منذ <month> <year>» and hides an unknown date', () => {
    expect(formatVerifiedSince('2025-03-14T09:30:00.000Z')).toBe('موثّق منذ مارس 2025');
    expect(formatVerifiedSince(null)).toBeNull();
    expect(formatVerifiedSince(undefined)).toBeNull();
    expect(formatVerifiedSince('not-a-date')).toBeNull();
    expect(VERIFIED_SHEET_TITLE).toBe('هذا الحساب موثّق');
  });

  it('uses the shared SheetModal with the badge, title and optional date', () => {
    const sheet = src('components/ui/VerifiedInfoSheet.tsx');
    expect(sheet).toContain("from '@/components/ui/SheetModal'");
    expect(sheet).toContain('<VerificationBadge');
    expect(sheet).toContain('{VERIFIED_SHEET_TITLE}');
    expect(sheet).toContain('formatVerifiedSince(verifiedSince)');
    expect(sheet).toContain('{since ? (');
  });

  it('opens from the seal next to the name only on verified profiles', () => {
    const layout = src('components/feature/ProfileScreenLayout.tsx');
    expect(layout).toContain('const isVerified = !loading && shouldShowVerifiedBadge(user.verified);');
    expect(layout).toContain('const openVerifiedSheet = isVerified ? () => setVerifiedSheetOpen(true) : undefined;');
    const badgeAt = layout.indexOf('testID="profile-verified-badge"');
    expect(badgeAt).toBeGreaterThan(-1);
    const badge = layout.slice(badgeAt, layout.indexOf('</Pressable>', badgeAt));
    expect(badge).toContain('onPress={openVerifiedSheet}');
    expect(badge).toContain('disabled={!openVerifiedSheet}');
    expect(badge).toContain('<VerificationBadge size={PROFILE_NAME_BADGE_SIZE} tier={user.verifiedTier} />');
    expect(layout).toContain('verifiedSince={user.verifiedSince}');
  });

  it('verifiedSince is plumbed from the API on own and visitor profiles', () => {
    expect(src('app/(tabs)/profile.tsx')).toContain('verifiedSince: me.verifiedSince ?? null');
    expect(src('app/users/[id].tsx')).toContain('verifiedSince: profile.verifiedSince ?? null');
    expect(src('contexts/AppContext.tsx')).toContain(
      "verifiedSince: typeof u.verifiedSince === 'string' ? u.verifiedSince : null",
    );
    expect(src('services/users.ts')).toContain('verifiedSince?: string | null;');
  });
});

describe('Profile header order and bio', () => {
  const layout = src('components/feature/ProfileScreenLayout.tsx');

  it('@handle → bio → stats', () => {
    const handle = layout.indexOf('testID="profile-username"');
    const bio = layout.indexOf('testID="profile-bio"');
    const stats = layout.indexOf('<ProfileStatsRow stats={stats}');
    expect(handle).toBeGreaterThan(-1);
    expect(bio).toBeGreaterThan(handle);
    expect(stats).toBeGreaterThan(bio);
  });

  it('bio is regular-weight standard white (textPrimary), not secondary grey', () => {
    const bio = layout.slice(layout.lastIndexOf('<AppText', layout.indexOf('testID="profile-bio"')), layout.indexOf('testID="profile-bio"'));
    expect(bio).toContain('variant="body"');
    expect(bio).toContain('color="textPrimary"');
    expect(bio).not.toContain('textSecondary');
  });

  it('camera shortcut removed from the avatar', () => {
    expect(layout).not.toContain('cameraBtn');
    expect(layout).not.toContain('onEditAvatar');
    expect(src('app/(tabs)/profile.tsx')).not.toContain('onEditAvatar');
  });
});

describe('Avatar / cover open full screen', () => {
  const layout = src('components/feature/ProfileScreenLayout.tsx');

  it('uses the shared in-app ImageViewerModal', () => {
    expect(layout).toContain("from '@/components/ui/ImageViewerModal'");
    expect(layout).toContain('<ImageViewerModal visible={viewerOpen} images={[viewerUri]}');
  });

  it('avatar: stories when the ring is shown, else the viewer, else nothing', () => {
    expect(layout).toContain(
      'hasStoryRing && onAvatarPress ? onAvatarPress : user.avatar ? () => openImage(user.avatar) : undefined',
    );
    expect(layout).toContain('onPress={avatarPress}');
    expect(layout).toContain('disabled={!avatarPress}');
  });

  it('cover: tappable only when there is a cover image; toolbar lets taps through', () => {
    expect(layout).toContain('const coverPress = user.coverImage ? () => openImage(user.coverImage) : undefined;');
    expect(layout).toContain('testID="profile-cover-press"');
    expect(layout).toContain('pointerEvents="box-none"');
  });

  it('viewer supports swipe-down dismiss (and keeps pinch zoom + close button)', () => {
    const viewer = src('components/ui/ImageViewerModal.tsx');
    expect(viewer).toContain('onDismiss={requestClose}');
    expect(viewer).toContain('VIEWER_DISMISS_DISTANCE');
    expect(viewer).toContain('// Pinch');
    expect(viewer).toContain('accessibilityLabel="إغلاق"');
  });
});
