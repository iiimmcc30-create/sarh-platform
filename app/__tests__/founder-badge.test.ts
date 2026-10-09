import { readFileSync } from 'fs';
import path from 'path';
import {
  FOUNDER_BADGE_HINT,
  FOUNDER_USERNAME,
  founderBadgeSize,
  isFounderAccount,
  normalizeUsername,
} from '@/lib/founderBadge';

const root = path.join(__dirname, '..');
const src = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

describe('founder badge — shown only for the sarh account', () => {
  it('matches the founder username only', () => {
    expect(FOUNDER_USERNAME).toBe('sarh');
    expect(isFounderAccount('sarh')).toBe(true);
    expect(isFounderAccount('@sarh')).toBe(true);
    expect(isFounderAccount(' SARH ')).toBe(true);
  });

  it('never matches anyone else (look-alikes, display names, empty)', () => {
    for (const u of ['sarh1', 'sarh_', 'xsarh', 'sar', 'sarh.app', 'متعب بن شطي', 'سرح', '', null, undefined, 42]) {
      expect(isFounderAccount(u)).toBe(false);
    }
    expect(normalizeUsername('@@Sarh')).toBe('sarh');
  });

  it('is ~65% of the neighbouring verification badge', () => {
    expect(founderBadgeSize(14)).toBe(9);
    expect(founderBadgeSize(18)).toBe(12);
    expect(founderBadgeSize(13)).toBe(8);
    expect(FOUNDER_BADGE_HINT).toBe('مؤسس سرح');
  });

  it('uses the official Sarh mark, not a verification-style badge', () => {
    const c = src('components/ui/FounderBadge.tsx');
    expect(c).toContain("from '@/components/ui/SarhLogoMark'");
    expect(c).toContain('isFounderAccount(username)');
    expect(c).toContain('showToast(FOUNDER_BADGE_HINT');
    expect(c).toContain('onHoverIn');
    expect(c).not.toContain('VerificationBadge');
    expect(c).not.toMatch(/crown|👑/i);
  });

  it('verification badge is unchanged and the shared name row adds the mark after it', () => {
    const badge = src('components/ui/VerificationBadge.tsx');
    expect(badge).not.toContain('Founder');
    const row = src('components/ui/VerifiedInlineName.tsx');
    const vIdx = row.indexOf('<VerificationBadge');
    const fIdx = row.indexOf('<FounderBadge username={username}');
    expect(vIdx).toBeGreaterThan(-1);
    expect(fIdx).toBeGreaterThan(vIdx);
    expect(src('components/ui/UserIdentityRow.tsx')).toContain('username={username}');
  });

  it('every name surface passes the account username', () => {
    const surfaces: Record<string, string> = {
      'components/feature/PostItem.tsx': '<FounderBadge username={post.author.username}',
      'components/feature/PostCommentsSection.tsx': '<FounderBadge username={c.author.username}',
      'components/feature/ProfileReplyRow.tsx': '<FounderBadge username={reply.author.username}',
      'components/feature/ProfileScreenLayout.tsx': '<FounderBadge username={user.username}',
      'components/ui/MediaViewerModal.tsx': '<FounderBadge username={overlay.username}',
      'components/feature/ListingCard.tsx': '<FounderBadge username={seller?.username}',
      'components/feature/MessagesPanel.tsx': 'username={p.username}',
      'app/chat.tsx': 'username={peerUsername}',
      'components/feature/NewMessageSheet.tsx': 'username={item.username}',
      'components/feature/ListingCommentRow.tsx': 'username={c.author.username}',
      'app/listing/[id].tsx': 'username={listing.seller.username}',
      'components/feature/AppSidebar.tsx': 'username={isAuthenticated ? me.username : null}',
    };
    for (const [file, needle] of Object.entries(surfaces)) {
      expect(`${file}: ${src(file).includes(needle)}`).toBe(`${file}: true`);
    }
  });
});
