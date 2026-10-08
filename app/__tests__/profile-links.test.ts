import { readFileSync } from 'fs';
import path from 'path';
import {
  MAX_PROFILE_LINKS,
  displayProfileLinkUrl,
  normalizeProfileLinkUrl,
  parseProfileLinks,
  profileLinkText,
  profileLinksSummary,
  sameProfileLinks,
  validateProfileLinkDrafts,
} from '@/lib/profileLinks';

const root = path.join(__dirname, '..');
const src = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

describe('profile links — helpers', () => {
  it('normalizes to http/https and rejects other schemes', () => {
    expect(normalizeProfileLinkUrl('sarh.app/u/salem')).toBe('https://sarh.app/u/salem');
    expect(normalizeProfileLinkUrl(' http://example.com ')).toBe('http://example.com');
    expect(normalizeProfileLinkUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeProfileLinkUrl('tel:+966500000000')).toBeNull();
    expect(normalizeProfileLinkUrl('https://localhost')).toBeNull();
    expect(normalizeProfileLinkUrl('https://a@b.com')).toBeNull();
    expect(normalizeProfileLinkUrl('exa mple.com')).toBeNull();
    expect(normalizeProfileLinkUrl(undefined)).toBeNull();
  });

  it('displays links like X (no scheme, www or trailing slash)', () => {
    expect(displayProfileLinkUrl('https://www.sarh.app/')).toBe('sarh.app');
    expect(displayProfileLinkUrl('http://youtube.com/@sarh')).toBe('youtube.com/@sarh');
    expect(displayProfileLinkUrl(`https://a.com/${'x'.repeat(60)}`).endsWith('…')).toBe(true);
    expect(profileLinkText({ url: 'https://sarh.app', label: 'متجري' })).toBe('متجري');
    expect(profileLinkText({ url: 'https://sarh.app' })).toBe('sarh.app');
  });

  it('validates the edit form', () => {
    expect(
      validateProfileLinkDrafts([
        { url: 'sarh.app', label: ' متجري ' },
        { url: '', label: '' },
        { url: 'https://sarh.app', label: '' },
      ]),
    ).toEqual({ ok: true, links: [{ url: 'https://sarh.app', label: 'متجري' }] });
    expect(validateProfileLinkDrafts([{ url: 'bad', label: '' }])).toMatchObject({ ok: false, index: 0 });
    expect(validateProfileLinkDrafts([{ url: '', label: 'اسم' }])).toMatchObject({ ok: false, index: 0 });
    expect(validateProfileLinkDrafts([])).toEqual({ ok: true, links: [] });
  });

  it('parses API data defensively and summarizes', () => {
    expect(parseProfileLinks(null)).toEqual([]);
    const many = Array.from({ length: MAX_PROFILE_LINKS + 2 }, (_, i) => ({ url: `https://a${i}.com` }));
    expect(parseProfileLinks(many)).toHaveLength(MAX_PROFILE_LINKS);
    expect(parseProfileLinks([{ url: 'javascript:x' }, { url: 'https://ok.com', label: 2 }])).toEqual([
      { url: 'https://ok.com' },
    ]);
    expect(profileLinksSummary([{ url: 'https://a.com' }, { url: 'https://b.com' }])).toBe('a.com +1');
    expect(profileLinksSummary(undefined)).toBe('');
    expect(sameProfileLinks([{ url: 'https://a.com' }], [{ url: 'https://a.com', label: '' }])).toBe(true);
  });
});

describe('profile links — wiring', () => {
  it('edit hub opens the links editor and shows the summary', () => {
    const hub = src('app/profile/edit/index.tsx');
    expect(hub).toContain("safePush('/profile/edit/links'");
    expect(hub).toContain('profileLinksSummary(me.links)');
    expect(src('app/profile/edit/links.tsx')).toContain('ProfileLinksEditScreen');
  });

  it('editor saves through updateMe and caps the list', () => {
    const editor = src('components/feature/ProfileLinksEditScreen.tsx');
    expect(editor).toContain('updateMe({ links: checked.links })');
    expect(editor).toContain('validateProfileLinkDrafts');
    expect(editor).toContain('drafts.length < MAX_PROFILE_LINKS');
    expect(editor).toContain('keyboardType="url"');
    expect(editor).not.toContain('authFetch');
  });

  it('profile header renders links under the bio and opens them safely', () => {
    const layout = src('components/feature/ProfileScreenLayout.tsx');
    expect(layout).toContain('<ProfileLinksRow links={user.links}');
    expect(layout.indexOf('testID="profile-bio"')).toBeLessThan(layout.indexOf('<ProfileLinksRow'));
    const row = src('components/feature/ProfileLinksRow.tsx');
    expect(row).toContain('Linking.openURL(safe)');
    expect(row).toContain('normalizeProfileLinkUrl(url)');
    expect(row).toContain('colors.textSecondary');
    const ctx = src('contexts/AppContext.tsx');
    expect(ctx).toContain('body.links = updates.links');
    expect(ctx).toContain('parseProfileLinks(u.links)');
    expect(src('app/users/[id].tsx')).toContain('parseProfileLinks(profile.links)');
    expect(src('app/(tabs)/profile.tsx')).toContain('links: me.links');
  });
});
