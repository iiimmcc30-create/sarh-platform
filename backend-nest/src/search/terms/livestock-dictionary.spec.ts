import { readdirSync, readFileSync } from 'fs';
import path from 'path';
import { LIVESTOCK_TERM_ENTRIES, TERM_SOURCES } from './data';
import {
  getLivestockDictionary,
  LivestockDictionaryService,
} from './livestock-dictionary.service';
import {
  scoreAliasMatch,
  scoreMetadataMatch,
  scoreSearchMatch,
} from '../lib/search-ranking.util';
import { mergeSuggestions } from '../lib/search-suggest.util';

const dict = getLivestockDictionary();

describe('livestock dictionary - data & sources', () => {
  it('stores the reference source as COMMUNITY metadata (no link in code)', () => {
    const src = TERM_SOURCES.find((s) => s.id === 'badia-sham-2024');
    expect(src).toMatchObject({
      type: 'COMMUNITY',
      name: 'بادية الشام',
      date: '2024-02-16',
    });
    expect(src?.url).toBeUndefined();
    for (const s of TERM_SOURCES) {
      expect(s.url ?? '').not.toMatch(/facebook|fb\.com/i);
    }
  });

  it('keeps URLs out of search logic (only the sources data module has them)', () => {
    const root = path.join(__dirname, '..');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const f of readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, f.name);
        if (f.isDirectory()) walk(p);
        else if (f.name.endsWith('.ts') && !f.name.endsWith('.spec.ts'))
          files.push(p);
      }
    };
    walk(root);
    for (const f of files) {
      if (f.endsWith(`${path.sep}sources.ts`)) continue;
      expect(readFileSync(f, 'utf8')).not.toMatch(/https?:\/\/|facebook/i);
    }
  });

  it('every meaning cites a known source; undefined meanings are low confidence', () => {
    const ids = new Set(TERM_SOURCES.map((s) => s.id));
    for (const e of LIVESTOCK_TERM_ENTRIES) {
      for (const m of e.meanings) {
        expect(ids.has(m.sourceId)).toBe(true);
        if (m.sourceId.startsWith('badia') && m.meaning === null) {
          expect(m.confidence).toBe('low');
        }
      }
    }
  });

  it('ingests the reference terms with exact meanings and region unspecified', () => {
    const halal = dict
      .lookup('الحلال')
      .find((m) => m.sourceId === 'badia-sham-2024');
    expect(halal?.meaning).toBe(
      'تسمية تطلق على الأغنام والماعز بشكل عام، ويقال للسوق الذي تباع به المواشي سوق الحلال.',
    );
    expect(halal?.region).toBe('unspecified');
    expect(dict.lookup('متلي')[0].meaning).toBe('على وشك الولادة.');
    expect(dict.lookup('متالي')[0].canonical).toBe('متلي');
    expect(dict.lookup('المطافيل')[0].sourceId).toBe('badia-sham-2024-comment');
    const ragh = dict.lookup('رغوث')[0];
    expect(ragh.meaning).toBeNull();
    expect(ragh.confidence).toBe('low');
    for (const age of [
      'طلي',
      'عكش',
      'دغلي',
      'ثني',
      'جذع',
      'قحم',
      'فطيمة',
      'قرقورة',
      'هرمة',
    ]) {
      const m = dict
        .lookup(age)
        .find(
          (x) => x.category === 'age_stage' && x.sourceId === 'badia-sham-2024',
        );
      expect(m?.meaning).toBeNull();
      expect(m?.confidence).toBe('low');
    }
  });

  it('stores shepherding terms but keeps them out of search', () => {
    for (const t of ['الشرط', 'الزهاب', 'الزوادة', 'صنع', 'شكارة', 'مطلعة']) {
      const meanings = dict.lookup(t);
      expect(meanings.length).toBeGreaterThan(0);
      expect(meanings.every((m) => m.searchable === false)).toBe(true);
    }
    expect(dict.lookup('الشرط')[0].meaning).toBe(
      'راتب الراعي السنوي النقدي المحدد، وقد تضاف إليه منافع عينية.',
    );
    expect(dict.suggest('الشر')).toEqual([]);
  });

  it('is data-driven: the service exposes a versioned singleton index', () => {
    const svc = new LivestockDictionaryService();
    expect(svc.get()).toBe(dict);
    expect(svc.version).toBe(dict.version);
    const stats = dict.stats();
    expect(stats.entries).toBe(LIVESTOCK_TERM_ENTRIES.length);
    expect(stats.meanings).toBeGreaterThanOrEqual(stats.entries);
    expect(stats.byConfidence.low).toBeGreaterThan(0);
  });
});

describe('livestock dictionary - multiple meanings by context', () => {
  it('"حري" is a sheep breed AND a goat breed (two sourced meanings)', () => {
    const meanings = dict.lookup('حري').filter((m) => m.category === 'breed');
    expect(meanings.map((m) => m.animalTypes?.[0]).sort()).toEqual([
      'goat',
      'sheep',
    ]);
    expect(
      dict.meaningsFor('حري', { animalTypes: ['goat'] })[0].animalTypes,
    ).toEqual(['goat']);
    expect(
      dict.meaningsFor('حري', { animalTypes: ['sheep'] })[0].animalTypes,
    ).toEqual(['sheep']);
  });

  it('"حمر" means a camel colour group with camels, a sheep ailment with sheep', () => {
    expect(
      dict.meaningsFor('حمر', { animalTypes: ['camel'] })[0],
    ).toMatchObject({
      category: 'breed',
      canonical: 'حمر',
    });
    expect(
      dict.meaningsFor('الحمر', { animalTypes: ['sheep'] })[0],
    ).toMatchObject({
      category: 'condition',
      canonical: 'البشم',
    });
  });

  it('"حايل" / "حلال" keep a non-livestock sense that is never auto-assumed', () => {
    const hayel = dict.lookup('حايل');
    expect(hayel.some((m) => m.category === 'reproductive_status')).toBe(true);
    expect(hayel.some((m) => m.category === 'general' && !m.searchable)).toBe(
      true,
    );
    const halal = dict.lookup('حلال');
    expect(halal.some((m) => m.category === 'general' && !m.searchable)).toBe(
      true,
    );
  });

  it('"القرطة" is listed both as a face trait and an ear trait', () => {
    const notes = dict.lookup('قرطة').map((m) => m.note ?? '');
    expect(notes.some((n) => n.includes('الوجه'))).toBe(true);
    expect(notes.some((n) => n.includes('الأذن'))).toBe(true);
  });

  it('records regions per meaning (e.g. Saudi breeds vs Levant origin)', () => {
    expect(dict.lookup('نعيمي')[0].region).toBe('saudi');
    expect(dict.lookup('عواسي')[0].region).toBe('levant');
    expect(
      dict.lookup('حايل').find((m) => m.sourceId === 'badia-sham-2024')?.region,
    ).toBe('unspecified');
  });
});

describe('livestock dictionary - query expansion', () => {
  it('"غنم" expands to sheep aliases, with حلال at lower weight and no goats', () => {
    const [e] = dict.expandQueryTokens(['غنم']);
    const terms = e.alternatives.map((a) => a.term);
    expect(terms).toEqual(expect.arrayContaining(['أغنام', 'ضأن', 'خراف']));
    expect(terms).not.toContain('ماعز');
    const w = (t: string) =>
      e.alternatives.find((a) => a.term === t)?.weight ?? 0;
    expect(w('حلال')).toBeGreaterThan(0);
    expect(w('حلال')).toBeLessThan(w('خراف'));
    expect(e.alternatives.length).toBeLessThanOrEqual(6);
  });

  it('"حلال" expands to sheep and goats (community meaning)', () => {
    const [e] = dict.expandQueryTokens(['حلال']);
    expect(e.alternatives.map((a) => a.term)).toEqual(
      expect.arrayContaining(['غنم', 'ماعز']),
    );
  });

  it('an ambiguous term is not expanded without context', () => {
    const [e] = dict.expandQueryTokens(['حري']);
    expect(e.ambiguous).toBe(true);
    expect(e.alternatives).toEqual([]);
    const [, withCtx] = dict.expandQueryTokens(['نعجة', 'حري']);
    expect(withCtx.ambiguous).toBe(false);
  });

  it('local terms expand to their spelling variants only', () => {
    const [e] = dict.expandQueryTokens(['مصغر']);
    expect(e.alternatives.map((a) => a.term)).toEqual(['مصاغير']);
    expect(e.alternatives[0].weight).toBeLessThan(1);
  });

  it('exact match outranks an alias match; low-confidence aliases weigh less', () => {
    const [e] = dict.expandQueryTokens(['غنم']);
    const exact = scoreSearchMatch('غنم', ['غنم'], {
      title: 'غنم نعيمي للبيع',
    });
    const alias =
      scoreSearchMatch('غنم', ['غنم'], { title: 'خراف نعيمي للبيع' }) +
      scoreAliasMatch(['غنم'], [e.alternatives], { title: 'خراف نعيمي للبيع' });
    const related =
      scoreSearchMatch('غنم', ['غنم'], { title: 'حلال طيب للبيع' }) +
      scoreAliasMatch(['غنم'], [e.alternatives], { title: 'حلال طيب للبيع' });
    expect(exact).toBeGreaterThan(alias);
    expect(alias).toBeGreaterThan(related);
    expect(related).toBeGreaterThan(0);
    const unrelated = scoreAliasMatch(['غنم'], [e.alternatives], {
      title: 'ناقة مجاهيم',
    });
    expect(unrelated).toBe(0);
  });
});

describe('livestock dictionary - listing metadata (probabilistic)', () => {
  it('extracts context from "نعجة حري ثنية حايل" with confidences', () => {
    const meta = dict.extractMetadata('نعجة حري ثنية حايل');
    expect(meta.animalType).toMatchObject({ value: 'sheep', uncertain: false });
    expect(meta.breed).toMatchObject({
      value: 'حري',
      sourceId: 'scipub-sheep-2013',
    });
    expect(meta.gender).toMatchObject({ value: 'female' });
    expect(meta.ageStage).toMatchObject({ value: 'ثنية', uncertain: true });
    expect(meta.reproductiveStatus).toMatchObject({
      value: 'حايل',
      sourceId: 'badia-sham-2024',
    });
    for (const f of [
      meta.animalType,
      meta.breed,
      meta.gender,
      meta.ageStage,
      meta.reproductiveStatus,
    ]) {
      expect(f!.confidence).toBeGreaterThan(0);
      expect(f!.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('picks the goat meaning of "حري" in a goat ad', () => {
    const meta = dict.extractMetadata('تيس حري للبيع');
    expect(meta.animalType?.value).toBe('goat');
    expect(meta.gender?.value).toBe('male');
    expect(meta.breed?.sourceId).toBe('idosi-goats-2013');
  });

  it('does not interpret context words without an animal (حايل the city)', () => {
    const meta = dict.extractMetadata('سيارة للبيع في حايل');
    expect(meta.animalType).toBeNull();
    expect(meta.reproductiveStatus).toBeNull();
  });

  it('never mutates the input text', () => {
    const text = 'نعجة حري ثنية حايل';
    dict.extractMetadata(text);
    expect(text).toBe('نعجة حري ثنية حايل');
  });

  it('metadata agreement gives a small, confidence-weighted ranking bonus', () => {
    const intent = {
      animalType: { value: 'sheep', confidence: 1 },
      breed: { value: 'حري', confidence: 1 },
    };
    const hit = scoreMetadataMatch(
      intent,
      { breed: { value: 'حري', confidence: 1 } },
      'sheep',
    );
    const miss = scoreMetadataMatch(
      intent,
      { breed: { value: 'نعيمي', confidence: 1 } },
      'camel',
    );
    expect(hit).toBeGreaterThan(miss);
    expect(hit).toBeLessThanOrEqual(12);
  });
});

describe('livestock dictionary - suggestions', () => {
  it('"حري" suggests ad-style combinations from data flags', () => {
    expect(dict.suggest('حري', 8).slice(0, 6)).toEqual([
      'حري',
      'حري للبيع',
      'نعاج حري',
      'حري ثني',
      'حري جذع',
      'حري حايل',
    ]);
  });

  it('prefix suggestions come from the dictionary (camel breeds)', () => {
    expect(dict.suggest('مجا', 5)[0]).toBe('مجاهيم');
  });

  it('merges listing titles, real queries, hashtags and terms without duplicates', () => {
    const merged = mergeSuggestions(
      [
        { kind: 'listing', weight: 4, items: ['حري للبيع', 'حري ممتاز'] },
        { kind: 'query', weight: 3, items: ['حري ثني', 'حري للبيع'] },
        { kind: 'hashtag', weight: 2.5, items: ['#حري_القصيم'] },
        { kind: 'term', weight: 2, items: dict.suggest('حري', 8) },
      ],
      8,
    );
    const texts = merged.map((s) => s.text);
    expect(new Set(texts).size).toBe(texts.length);
    expect(merged[0]).toEqual({ text: 'حري للبيع', kind: 'listing' });
    expect(merged.map((s) => s.kind)).toEqual(
      expect.arrayContaining(['listing', 'query', 'hashtag', 'term']),
    );
    expect(texts).toHaveLength(8);
  });
});
