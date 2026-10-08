import {
  MAX_PROFILE_LINKS,
  normalizeProfileLinkUrl,
  normalizeProfileLinks,
  readProfileLinks,
} from './profile-links';

describe('profile links', () => {
  it('normalizes urls (adds https, keeps http/https only)', () => {
    expect(normalizeProfileLinkUrl(' sarh.app/u/salem ')).toBe('https://sarh.app/u/salem');
    expect(normalizeProfileLinkUrl('http://example.com')).toBe('http://example.com');
    expect(normalizeProfileLinkUrl('https://x.com/sarh')).toBe('https://x.com/sarh');
    expect(normalizeProfileLinkUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeProfileLinkUrl('ftp://example.com')).toBeNull();
    expect(normalizeProfileLinkUrl('mailto:a@b.com')).toBeNull();
    expect(normalizeProfileLinkUrl('https://localhost')).toBeNull();
    expect(normalizeProfileLinkUrl('https://user:pw@example.com')).toBeNull();
    expect(normalizeProfileLinkUrl('exa mple.com')).toBeNull();
    expect(normalizeProfileLinkUrl('')).toBeNull();
    expect(normalizeProfileLinkUrl(42)).toBeNull();
    expect(normalizeProfileLinkUrl(`https://a.com/${'x'.repeat(250)}`)).toBeNull();
  });

  it('validates the list, drops empty rows and duplicates', () => {
    const res = normalizeProfileLinks([
      { url: 'sarh.app', label: '  متجري  ' },
      { url: '   ' },
      { url: 'https://sarh.app' },
      { url: 'https://youtube.com/@sarh' },
    ]);
    expect(res).toEqual({
      ok: true,
      links: [
        { url: 'https://sarh.app', label: 'متجري' },
        { url: 'https://youtube.com/@sarh' },
      ],
    });
    expect(normalizeProfileLinks(null)).toEqual({ ok: true, links: [] });
    expect(normalizeProfileLinks([])).toEqual({ ok: true, links: [] });
  });

  it('rejects invalid urls, long labels, too many links', () => {
    expect(normalizeProfileLinks([{ url: 'javascript:alert(1)' }]).ok).toBe(false);
    expect(normalizeProfileLinks([{ url: 'a.com', label: 'x'.repeat(31) }]).ok).toBe(false);
    expect(normalizeProfileLinks('a.com').ok).toBe(false);
    const many = Array.from({ length: MAX_PROFILE_LINKS + 1 }, (_, i) => ({
      url: `https://a${i}.com`,
    }));
    expect(normalizeProfileLinks(many).ok).toBe(false);
  });

  it('reads stored links, falling back to the legacy website only when never set', () => {
    expect(readProfileLinks(null, 'https://www.mewa.gov.sa')).toEqual([
      { url: 'https://www.mewa.gov.sa' },
    ]);
    expect(readProfileLinks([], 'https://www.mewa.gov.sa')).toEqual([]);
    expect(
      readProfileLinks([{ url: 'https://a.com', label: 'أ' }, { url: 'javascript:x' }], null),
    ).toEqual([{ url: 'https://a.com', label: 'أ' }]);
    expect(readProfileLinks(undefined, null)).toEqual([]);
  });
});
