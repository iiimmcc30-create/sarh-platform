import {
  extractHashtagDetails,
  parseHashtagQuery,
  stripHashtags,
  textHasHashtag,
} from './hashtag.util';
import { extractHashtags, extractTopicTokens } from './trending-score.util';

const EXAMPLES = [
  '#اذكرو_الله',
  '#صلوا_على_النبي',
  '#حلال_الطيبين',
  '#ابل_السعودية',
  '#مزاد_الابل',
];

const display = (text: string) =>
  extractHashtagDetails(text).map((t) => t.displayTag);

describe('hashtag.util - whole-tag extraction', () => {
  it.each(EXAMPLES)('keeps %s as ONE tag', (tag) => {
    expect(display(`منشور ${tag} اليوم`)).toEqual([tag]);
  });

  it('extracts all five example tags independently from one text', () => {
    expect(display(EXAMPLES.join(' '))).toEqual(EXAMPLES);
  });

  it('never splits #اذكرو_الله into #اذكرو / #الله', () => {
    const tags = display('ماشاء الله #اذكرو_الله');
    expect(tags).toEqual(['#اذكرو_الله']);
    expect(tags).not.toContain('#اذكرو');
    expect(tags).not.toContain('#الله');
    expect(extractHashtags('#اذكرو_الله')).toEqual(['#اذكرو_الله']);
  });

  it('handles mixed Arabic/Latin text, digits and Arabic-Indic digits', () => {
    expect(display('Sale #Camels_2026 و #مزاد_١٤٤٦ و #ابل2024')).toEqual([
      '#Camels_2026',
      '#مزاد_١٤٤٦',
      '#ابل2024',
    ]);
  });

  it('stops at trailing punctuation (Latin and Arabic)', () => {
    expect(
      display(
        '#حلال_الطيبين، #اذكرو_الله. #صلوا_على_النبي! #ابل_السعودية؟ (#مزاد_الابل)',
      ),
    ).toEqual([
      '#حلال_الطيبين',
      '#اذكرو_الله',
      '#صلوا_على_النبي',
      '#ابل_السعودية',
      '#مزاد_الابل',
    ]);
    expect(display('#غنم_')).toEqual(['#غنم']);
  });

  it('de-duplicates repeated tags (and alef / ta-marbuta variants) per text', () => {
    const tags = extractHashtagDetails(
      '#ابل_السعودية #ابل_السعوديه #إبل_السعودية #ابل_السعودية',
    );
    expect(tags).toHaveLength(1);
    expect(tags[0].displayTag).toBe('#ابل_السعودية');
    expect(tags[0].normalizedTag).toBe('#ابل_السعوديه');
    expect(tags[0].tokenCount).toBe(2);
  });

  it('ignores number-only tags, URL fragments and HTML entities', () => {
    expect(display('#123 #١٢٣ https://x.com/page#section &#123; a#b')).toEqual(
      [],
    );
  });

  it('accepts the full-width ＃ sign', () => {
    expect(display('＃حلال_الطيبين')).toEqual(['#حلال_الطيبين']);
  });

  it('keeps tatweel-joined tags whole', () => {
    expect(display('#مضادـالطفيليات')).toEqual(['#مضادـالطفيليات']);
  });

  it('strips hashtags for plain-word topic extraction without leaking fragments', () => {
    expect(
      stripHashtags('بيع #اذكرو_الله غنم').replace(/\s+/g, ' ').trim(),
    ).toBe('بيع غنم');
    const topics = extractTopicTokens('#اذكرو_الله #صلوا_على_النبي غنم نجدي');
    expect(topics).toEqual(expect.arrayContaining(['غنم', 'نجدي']));
    for (const fragment of ['اذكرو', 'الله', 'صلوا', 'على', 'النبي']) {
      expect(topics).not.toContain(fragment);
    }
  });

  it('keeps underscore phrases written without # out of the topic words', () => {
    const topics = extractTopicTokens('اذكرو_الله يا جماعة');
    expect(topics).not.toContain('اذكرو');
    expect(topics).not.toContain('الله');
  });
});

describe('hashtag.util - hashtag queries', () => {
  it('parses a whole-hashtag query', () => {
    expect(parseHashtagQuery('#اذكرو_الله')?.normalizedTag).toBe('#اذكرو_الله');
    expect(parseHashtagQuery('  #حلال_الطيبين  ')?.displayTag).toBe(
      '#حلال_الطيبين',
    );
    expect(parseHashtagQuery('#اذكرو_الله غنم')).toBeNull();
    expect(parseHashtagQuery('غنم')).toBeNull();
  });

  it('matches the full tag only (not a longer tag or its parts)', () => {
    expect(textHasHashtag('نص #اذكرو_الله', '#اذكرو_الله')).toBe(true);
    expect(textHasHashtag('نص #اذكرو_الله_كثيرا', '#اذكرو_الله')).toBe(false);
    expect(textHasHashtag('اذكرو الله', '#اذكرو_الله')).toBe(false);
    expect(textHasHashtag('#اذكرو_الله', '#الله')).toBe(false);
  });
});
