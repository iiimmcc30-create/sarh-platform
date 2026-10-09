import { readFileSync } from 'fs';
import { join } from 'path';
import { resolveFollowButton, showFollowsYouTag } from '@/lib/followRelation';

const src = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8');

describe('followers / following rows — X-style follow capsule', () => {
  it('shows «رد المتابعة» when they follow me and I do not follow them', () => {
    expect(resolveFollowButton({ isFollowing: false, followsYou: true }, false)).toMatchObject({
      title: 'رد المتابعة',
      variant: 'primary',
    });
  });

  it('shows «متابَع» whenever I follow them (mutual or not)', () => {
    expect(resolveFollowButton({ isFollowing: true, followsYou: true }, false)?.title).toBe('متابَع');
    expect(resolveFollowButton({ isFollowing: true }, false)?.variant).toBe('secondary');
  });

  it('shows «متابعة» otherwise and nothing on my own row', () => {
    expect(resolveFollowButton({ isFollowing: false, followsYou: false }, false)?.title).toBe('متابعة');
    expect(resolveFollowButton({ isFollowing: false }, false)?.title).toBe('متابعة');
    expect(resolveFollowButton({ isFollowing: true, followsYou: true }, true)).toBeNull();
  });

  it('«يتابعك» tag: shown where it adds info, hidden on my own followers tab and my row', () => {
    expect(showFollowsYouTag({ isFollowing: true, followsYou: true }, false, false)).toBe(true);
    expect(showFollowsYouTag({ isFollowing: false, followsYou: true }, false, true)).toBe(false);
    expect(showFollowsYouTag({ isFollowing: false, followsYou: true }, true, false)).toBe(false);
    expect(showFollowsYouTag({ isFollowing: false, followsYou: false }, false, false)).toBe(false);
  });

  it('connections screen toggles optimistically with rollback and uses the pill capsule', () => {
    const screen = src('app/profile/connections.tsx');
    expect(screen).toContain('resolveFollowButton');
    expect(screen).toContain('patchRow(user.id, next)');
    expect(screen).toContain('patchRow(user.id, previous)');
    expect(screen).toContain('shape="pill"');
    expect(screen).toContain('handleAccessory');
  });

  it('follow mutations patch the shared profile cache', () => {
    const svc = src('services/users.ts');
    expect(svc).toContain('patchCachedFollowState(userId, json.data.following)');
    expect(svc).toMatch(/followsYou\?: boolean;\n};\n\nexport type PrivacySettings/);
  });
});
