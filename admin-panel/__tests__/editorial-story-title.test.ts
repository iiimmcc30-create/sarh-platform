import { deriveEditorialStoryTitle } from '@/lib/editorialStoryTitle';

describe('deriveEditorialStoryTitle', () => {
  it('returns empty for blank input', () => {
    expect(deriveEditorialStoryTitle('')).toBe('');
    expect(deriveEditorialStoryTitle('   ')).toBe('');
  });

  it('collapses whitespace including newlines into a single title line', () => {
    expect(deriveEditorialStoryTitle('  مرحبا   بكم\nسطر ثاني  ')).toBe('مرحبا بكم سطر ثاني');
  });

  it('keeps short titles without ellipsis', () => {
    expect(deriveEditorialStoryTitle('عنوان قصير')).toBe('عنوان قصير');
  });

  it('truncates long titles with ellipsis', () => {
    const long = 'أ'.repeat(140);
    const title = deriveEditorialStoryTitle(long, 40);
    expect(title.length).toBeLessThanOrEqual(41);
    expect(title.endsWith('…')).toBe(true);
  });
});
