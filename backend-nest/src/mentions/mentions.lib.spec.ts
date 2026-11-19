import {
  activeMentionQuery,
  insertMention,
  parseMentionTexts,
  parseMentions,
  tokenizeRichText,
} from './mentions.lib';

describe('parseMentions', () => {
  it('reads handles in Arabic text, ignores email and self-duplicates, caps at 10', () => {
    const handles = Array.from({ length: 12 }, (_, i) => `@user${i}`);
    const text = `مرحبا ${handles.join(' ')} و mail@user0.com و @user0`;
    expect(parseMentions(text)).toEqual(
      Array.from({ length: 10 }, (_, i) => `user${i}`),
    );
    expect(parseMentions('تواصل عبر a@bc.com')).toEqual([]);
    expect(parseMentions('@Ab_C')).toEqual(['ab_c']);
    expect(parseMentions('@ab')).toEqual([]);
  });

  it('merges fields without duplicating', () => {
    expect(
      parseMentionTexts(['@ali في العنوان', null, 'و @ALI و @sara']),
    ).toEqual(['ali', 'sara']);
  });

  it('finds the query at the caret and inserts a handle', () => {
    expect(activeMentionQuery('يا @sa', 6)).toEqual({ start: 3, query: 'sa' });
    expect(activeMentionQuery('mail@sa', 7)).toBeNull();
    expect(activeMentionQuery('يا @sa ', 7)).toBeNull();
    const inserted = insertMention('يا @sa', 3, 6, 'sara');
    expect(inserted.text).toBe('يا @sara ');
    expect(inserted.caret).toBe(3 + '@sara '.length);
  });

  it('tokenizes mentions and hashtags', () => {
    const tokens = tokenizeRichText('أهلا @Sara #إبل');
    expect(tokens.map((t) => t.kind)).toEqual([
      'text',
      'mention',
      'text',
      'hashtag',
    ]);
    expect(tokens[1]).toMatchObject({ username: 'sara' });
  });
});
