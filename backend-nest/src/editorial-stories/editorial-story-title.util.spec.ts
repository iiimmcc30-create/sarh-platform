import { deriveEditorialStoryTitle } from './editorial-story-title.util';

describe('deriveEditorialStoryTitle', () => {
  it('returns empty for blank body', () => {
    expect(deriveEditorialStoryTitle('')).toBe('');
    expect(deriveEditorialStoryTitle('   \n\t  ')).toBe('');
  });

  it('collapses whitespace including newlines into a single title line', () => {
    expect(deriveEditorialStoryTitle('  مرحبا   بكم\nسطر ثاني  ')).toBe(
      'مرحبا بكم سطر ثاني',
    );
  });

  it('keeps short titles without ellipsis', () => {
    expect(deriveEditorialStoryTitle('عنوان قصير')).toBe('عنوان قصير');
  });

  it('truncates long first line and appends ellipsis', () => {
    const body = 'أ'.repeat(130);
    const title = deriveEditorialStoryTitle(body, 50);
    expect(title.length).toBe(51);
    expect(title.endsWith('…')).toBe(true);
    expect(title.startsWith('أ'.repeat(50))).toBe(true);
  });

  it('does not double-append ellipsis when slice already ends with it', () => {
    const body = `${'ب'.repeat(49)}…extra`;
    const title = deriveEditorialStoryTitle(body, 50);
    expect(title.endsWith('……')).toBe(false);
    expect(title.endsWith('…')).toBe(true);
  });
});
