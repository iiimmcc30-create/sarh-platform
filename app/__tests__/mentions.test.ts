import { activeMentionQuery, insertMention, tokenizeRichText } from '@/lib/mentions';

describe('mentions', () => {
  it('isolates @username inside Arabic and ignores emails', () => {
    const tokens = tokenizeRichText('يا @Sara مرحبا mail@sara.com #إبل');
    const mention = tokens.find((token) => token.kind === 'mention');
    expect(mention).toMatchObject({ username: 'sara' });
    expect(tokens.some((token) => token.kind === 'hashtag')).toBe(true);
    expect(tokenizeRichText('mail@sara.com').some((token) => token.kind === 'mention')).toBe(false);
  });

  it('suggests from the caret and inserts the handle', () => {
    expect(activeMentionQuery('سلام @al', 8)).toEqual({ start: 5, query: 'al' });
    expect(insertMention('سلام @al', 5, 8, 'ali').text).toBe('سلام @ali ');
  });
});
