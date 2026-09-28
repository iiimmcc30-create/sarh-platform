import { normalizeArabicSearchText } from '../lib/arabic-search.util';
import type {
  AnimalType,
  Confidence,
  Gender,
  LivestockTermEntry,
  TermCategory,
  TermMeaning,
  TermSource,
} from './livestock-terms.types';

/**
 * In-memory livestock dictionary: data-driven index (no switch/case per term).
 * Built once from the data modules; every lookup is a Map hit.
 */

export const CONFIDENCE_WEIGHT: Record<Confidence, number> = {
  high: 1,
  medium: 0.7,
  low: 0.35,
};

export type IndexedMeaning = TermMeaning & {
  entryId: string;
  canonical: string;
  aliases: string[];
};

export type TermAlternative = { term: string; weight: number };

export type TokenExpansion = {
  token: string;
  alternatives: TermAlternative[];
  /** true when the token has several contexts and the query gave none. */
  ambiguous: boolean;
};

export type MetadataField<T extends string = string> = {
  value: T;
  /** The word in the text that produced this interpretation. */
  term: string;
  /** 0..1 - probabilistic; below 0.5 treat as uncertain. */
  confidence: number;
  sourceId: string;
  uncertain: boolean;
};

/** Internal, probabilistic interpretation of a listing / query text. */
export type TermMetadata = {
  animalType: MetadataField<AnimalType> | null;
  breed: MetadataField | null;
  gender: MetadataField<Gender> | null;
  ageStage: MetadataField | null;
  reproductiveStatus: MetadataField | null;
  traits: MetadataField[];
  /** Detected dictionary terms (normalized), for ranking/debug. */
  terms: string[];
};

const MAX_ALTERNATIVES_PER_TOKEN = 6;
const MAX_NGRAM = 3;
/** Categories whose `related` list may be used for (low-weight) expansion. */
const RELATED_EXPANSION: ReadonlySet<TermCategory> = new Set([
  'animal_type',
  'animal_group',
  'breed',
]);
/** Categories that only make sense with an animal in context. */
const NEEDS_ANIMAL_CONTEXT: ReadonlySet<TermCategory> = new Set([
  'age_stage',
  'reproductive_status',
  'trait',
  'condition',
  'behaviour',
  'herd_role',
]);
const ANIMAL_DEFINING: ReadonlySet<TermCategory> = new Set([
  'animal_type',
  'gender',
]);

export function normalizeTermKey(text: string): string {
  return normalizeArabicSearchText(text ?? '');
}

/** Key forms stored for a term: as-is, and without the definite article. */
function termKeys(text: string): string[] {
  const key = normalizeTermKey(text);
  if (!key) return [];
  const out = [key];
  if (key.startsWith('ال') && key.length > 4) out.push(key.slice(2));
  return out;
}

/** Lookup forms for a query token: as-is, then common clitic-stripped forms. */
function lookupForms(token: string): string[] {
  const key = normalizeTermKey(token);
  if (!key) return [];
  const forms = [key];
  for (const prefix of ['وال', 'بال', 'فال', 'كال', 'لل', 'ال']) {
    if (key.startsWith(prefix) && key.length - prefix.length >= 2) {
      forms.push(key.slice(prefix.length));
    }
  }
  return forms;
}

function sameAnimals(a?: AnimalType[], b?: AnimalType[]): boolean {
  const x = [...(a ?? [])].sort().join(',');
  const y = [...(b ?? [])].sort().join(',');
  return x === y;
}

function intersects(a?: AnimalType[], b?: ReadonlySet<AnimalType>): boolean {
  if (!a?.length || !b?.size) return false;
  return a.some((t) => b.has(t));
}

export class LivestockDictionary {
  private readonly byKey = new Map<string, IndexedMeaning[]>();
  private readonly keys: string[] = [];
  private readonly sources = new Map<string, TermSource>();
  private maxTermWords = 1;

  constructor(
    readonly entries: readonly LivestockTermEntry[],
    sources: readonly TermSource[],
    readonly version: string,
  ) {
    for (const s of sources) this.sources.set(s.id, s);
    for (const entry of entries) {
      const aliases = entry.aliases ?? [];
      for (const meaning of entry.meanings) {
        const indexed: IndexedMeaning = {
          ...meaning,
          entryId: entry.id,
          canonical: entry.canonical,
          aliases,
        };
        for (const form of [entry.canonical, ...aliases]) {
          for (const key of termKeys(form)) {
            const list = this.byKey.get(key);
            if (list) {
              if (!list.includes(indexed)) list.push(indexed);
            } else {
              this.byKey.set(key, [indexed]);
              this.keys.push(key);
            }
            this.maxTermWords = Math.max(
              this.maxTermWords,
              key.split(' ').length,
            );
          }
        }
      }
    }
    this.keys.sort();
  }

  source(id: string): TermSource | undefined {
    return this.sources.get(id);
  }

  /** Every meaning (all contexts) of a term, including non-searchable ones. */
  lookup(term: string): IndexedMeaning[] {
    for (const form of lookupForms(term)) {
      const hit = this.byKey.get(form);
      if (hit?.length) return hit;
    }
    return [];
  }

  /** Meanings of a term ordered by fit to an animal context, then confidence. */
  meaningsFor(
    term: string,
    context?: { animalTypes?: AnimalType[] },
  ): IndexedMeaning[] {
    const ctx = new Set(context?.animalTypes ?? []);
    return [...this.lookup(term)].sort((a, b) => {
      const fa = intersects(a.animalTypes, ctx) ? 1 : 0;
      const fb = intersects(b.animalTypes, ctx) ? 1 : 0;
      if (fa !== fb) return fb - fa;
      if (a.searchable !== b.searchable) return a.searchable ? -1 : 1;
      return CONFIDENCE_WEIGHT[b.confidence] - CONFIDENCE_WEIGHT[a.confidence];
    });
  }

  /** Greedy longest-match scan (n-grams up to 3 words) over normalized text. */
  detectTerms(
    text: string,
  ): Array<{ term: string; meanings: IndexedMeaning[] }> {
    const words = normalizeTermKey(text).split(' ').filter(Boolean);
    const found: Array<{ term: string; meanings: IndexedMeaning[] }> = [];
    const maxN = Math.min(MAX_NGRAM, this.maxTermWords);
    for (let i = 0; i < words.length;) {
      let matched = 0;
      for (let n = Math.min(maxN, words.length - i); n >= 1; n -= 1) {
        const phrase = words.slice(i, i + n).join(' ');
        const meanings =
          n === 1 ? this.lookup(phrase) : (this.byKey.get(phrase) ?? []);
        if (meanings.length) {
          found.push({ term: phrase, meanings });
          matched = n;
          break;
        }
      }
      i += matched || 1;
    }
    return found;
  }

  /** Animal types implied by unambiguous animal-defining terms in the tokens. */
  private contextAnimals(tokens: string[]): Set<AnimalType> {
    const ctx = new Set<AnimalType>();
    for (const token of tokens) {
      const defining = this.lookup(token).filter(
        (m) =>
          m.searchable &&
          ANIMAL_DEFINING.has(m.category) &&
          m.animalTypes?.length,
      );
      if (
        defining.length &&
        defining.every((m) =>
          sameAnimals(m.animalTypes, defining[0].animalTypes),
        )
      ) {
        for (const a of defining[0].animalTypes ?? []) ctx.add(a);
      }
    }
    return ctx;
  }

  /**
   * Tight query expansion. Per token: aliases of the SAME term (weighted by
   * confidence) + `related` terms at half weight. A token with several
   * contexts (e.g. "حري" sheep vs goat breed) is only expanded when another
   * query word picks the context; otherwise it stays exact-match only.
   */
  expandQueryTokens(tokens: string[]): TokenExpansion[] {
    const ctx = this.contextAnimals(tokens);
    return tokens.map((token) => {
      const own = new Set(lookupForms(token));
      let meanings = this.lookup(token).filter((m) => m.searchable);
      const contexts = new Set(
        meanings.map((m) => [...(m.animalTypes ?? [])].sort().join(',')),
      );
      let ambiguous = false;
      if (contexts.size > 1) {
        const fitting = meanings.filter((m) => intersects(m.animalTypes, ctx));
        if (fitting.length) meanings = fitting;
        else {
          ambiguous = true;
          meanings = [];
        }
      }

      const best = new Map<string, TermAlternative>();
      const add = (term: string, weight: number) => {
        const key = normalizeTermKey(term);
        if (!key || own.has(key)) return;
        const prev = best.get(key);
        if (!prev || prev.weight < weight) best.set(key, { term, weight });
      };
      for (const m of meanings) {
        const w = CONFIDENCE_WEIGHT[m.confidence];
        for (const alias of [m.canonical, ...m.aliases]) add(alias, w);
        if (RELATED_EXPANSION.has(m.category)) {
          for (const rel of m.related ?? []) add(rel, Math.round(w * 50) / 100);
        }
      }
      const alternatives = [...best.values()]
        .sort((a, b) => b.weight - a.weight)
        .slice(0, MAX_ALTERNATIVES_PER_TOKEN);
      return { token, alternatives, ambiguous };
    });
  }

  /**
   * Probabilistic metadata from free text (listing title/description or a
   * query). Never mutates the text; every field carries a confidence and is
   * flagged `uncertain` below 0.5. Context-dependent words (age, status,
   * traits) are only interpreted when an animal is in context.
   */
  extractMetadata(text: string): TermMetadata {
    const detected = this.detectTerms(text).map((d) => ({
      term: d.term,
      meanings: d.meanings.filter((m) => m.searchable),
    }));
    const result: TermMetadata = {
      animalType: null,
      breed: null,
      gender: null,
      ageStage: null,
      reproductiveStatus: null,
      traits: [],
      terms: detected.filter((d) => d.meanings.length).map((d) => d.term),
    };

    // 1) Animal type: vote from animal-defining words, then breeds/groups.
    const votes = new Map<
      AnimalType,
      { score: number; term: string; sourceId: string }
    >();
    const vote = (
      a: AnimalType,
      score: number,
      term: string,
      sourceId: string,
    ) => {
      const prev = votes.get(a);
      if (prev) prev.score += score;
      else votes.set(a, { score, term, sourceId });
    };
    for (const d of detected) {
      for (const m of d.meanings) {
        const types = m.animalTypes ?? [];
        if (!types.length) continue;
        const w = CONFIDENCE_WEIGHT[m.confidence];
        if (ANIMAL_DEFINING.has(m.category)) {
          for (const a of types) vote(a, w / types.length, d.term, m.sourceId);
        } else if (m.category === 'breed') {
          const breedTypes = new Set(
            d.meanings
              .filter((x) => x.category === 'breed')
              .flatMap((x) => x.animalTypes ?? []),
          );
          for (const a of types)
            vote(a, (w * 0.5) / breedTypes.size, d.term, m.sourceId);
        } else if (m.category === 'animal_group') {
          for (const a of types)
            vote(a, (w * 0.3) / types.length, d.term, m.sourceId);
        }
      }
    }
    const ranked = [...votes.entries()].sort((a, b) => b[1].score - a[1].score);
    const animalCtx = new Set<AnimalType>();
    if (
      ranked.length &&
      (ranked.length === 1 || ranked[0][1].score > ranked[1][1].score)
    ) {
      const [animal, info] = ranked[0];
      const total = ranked.reduce((n, [, v]) => n + v.score, 0);
      // Share of the vote x strength of the strongest evidence (capped at 1).
      const share = info.score / Math.max(total, 1e-9);
      const confidence =
        Math.round(share * Math.min(1, info.score) * 100) / 100;
      result.animalType = {
        value: animal,
        term: info.term,
        confidence,
        sourceId: info.sourceId,
        uncertain: confidence < 0.5,
      };
      animalCtx.add(animal);
    }

    const field = <T extends string>(
      value: T,
      term: string,
      m: IndexedMeaning,
      factor = 1,
    ): MetadataField<T> => {
      const confidence =
        Math.round(CONFIDENCE_WEIGHT[m.confidence] * factor * 100) / 100;
      return {
        value,
        term,
        confidence,
        sourceId: m.sourceId,
        uncertain: confidence < 0.5,
      };
    };
    const fits = (m: IndexedMeaning) =>
      !m.animalTypes?.length ||
      !animalCtx.size ||
      intersects(m.animalTypes, animalCtx);
    const better = (cur: MetadataField | null, next: MetadataField) =>
      !cur || next.confidence > cur.confidence;

    for (const d of detected) {
      for (const m of d.meanings) {
        if (!fits(m)) continue;
        if (NEEDS_ANIMAL_CONTEXT.has(m.category) && !animalCtx.size) continue;
        // Very short, undefined words ("جل", "دق") are too noisy to interpret.
        if (m.confidence === 'low' && d.term.length < 3) continue;

        if (m.category === 'breed') {
          const f = field(m.canonical, d.term, m, animalCtx.size ? 1 : 0.6);
          if (better(result.breed, f)) result.breed = f;
        }
        if (
          m.gender &&
          (m.category === 'gender' ||
            m.category === 'age_stage' ||
            m.category === 'reproductive_status')
        ) {
          const f = field(
            m.gender,
            d.term,
            m,
            m.category === 'gender' ? 1 : 0.8,
          );
          if (better(result.gender, f)) result.gender = f;
        }
        if (m.category === 'age_stage' && m.ageStage) {
          const f = field(m.ageStage, d.term, m);
          if (better(result.ageStage, f)) result.ageStage = f;
        } else if (m.category === 'gender' && m.ageStage) {
          const f = field(m.ageStage, d.term, m, 0.8);
          if (better(result.ageStage, f)) result.ageStage = f;
        }
        if (m.category === 'reproductive_status') {
          const f = field(m.canonical, d.term, m);
          if (better(result.reproductiveStatus, f))
            result.reproductiveStatus = f;
        }
        if (m.category === 'trait' || m.category === 'condition') {
          const f = field(m.attribute ?? m.canonical, d.term, m);
          if (!result.traits.some((t) => t.value === f.value))
            result.traits.push(f);
        }
      }
    }
    return result;
  }

  /**
   * Dictionary-side typeahead: terms starting with the prefix, plus ad-style
   * combinations for a matched breed ("حري للبيع", "نعاج حري", "حري ثني").
   * Combination words come from data flags (adCombo), not a static list.
   */
  suggest(prefix: string, limit = 8): string[] {
    const p = normalizeTermKey(prefix);
    if (p.length < 2) return [];
    const matches: Array<{
      text: string;
      score: number;
      meaning: IndexedMeaning;
    }> = [];
    const seen = new Set<string>();
    for (const key of this.keys) {
      if (!key.startsWith(p)) continue;
      for (const m of this.byKey.get(key) ?? []) {
        if (
          !m.searchable ||
          m.category === 'shepherding' ||
          m.category === 'general'
        )
          continue;
        if (m.confidence === 'low' && key !== p) continue;
        const text = m.canonical;
        const nk = normalizeTermKey(text);
        if (seen.has(nk)) continue;
        seen.add(nk);
        const exact = key === p ? 2 : 0;
        const cat =
          m.category === 'breed' || m.category === 'animal_type' ? 1 : 0;
        matches.push({
          text,
          score: exact + cat + CONFIDENCE_WEIGHT[m.confidence],
          meaning: m,
        });
      }
    }
    matches.sort((a, b) => b.score - a.score || a.text.length - b.text.length);

    const out: string[] = [];
    const push = (s: string) => {
      const k = normalizeTermKey(s);
      if (k && !out.some((o) => normalizeTermKey(o) === k)) out.push(s);
    };
    const top = matches[0];
    if (top) {
      push(top.text);
      if (top.meaning.category === 'breed') {
        for (const combo of this.breedCombos(top.text, top.meaning))
          push(combo);
      }
    }
    for (const mt of matches.slice(1)) push(mt.text);
    return out.slice(0, limit);
  }

  private breedCombos(breedName: string, m: IndexedMeaning): string[] {
    const animals = new Set(m.animalTypes ?? []);
    const combos: string[] = [];
    const flagged = this.entries.flatMap((e) =>
      e.meanings
        .filter((x) => x.adCombo && x.searchable)
        .map((x) => ({ e, x })),
    );
    for (const { e } of flagged.filter(({ x }) => x.category === 'trade')) {
      combos.push(`${breedName} ${e.canonical}`);
    }
    for (const { e, x } of flagged.filter(
      ({ x }) => x.category === 'gender' && x.gender === 'female',
    )) {
      if (!intersects(x.animalTypes, animals)) continue;
      combos.push(`${e.aliases?.[0] ?? e.canonical} ${breedName}`);
    }
    const ageFit = flagged.filter(
      ({ x }) =>
        (x.category === 'age_stage' || x.category === 'reproductive_status') &&
        intersects(x.animalTypes, animals),
    );
    // Male age words first, then status words (e.g. حايل), then female ages.
    const order = (x: TermMeaning) =>
      x.category === 'age_stage' ? (x.gender === 'male' ? 0 : 2) : 1;
    for (const { e } of ageFit.sort((a, b) => order(a.x) - order(b.x))) {
      combos.push(`${breedName} ${e.canonical}`);
    }
    return combos;
  }

  stats() {
    const byConfidence: Record<Confidence, number> = {
      high: 0,
      medium: 0,
      low: 0,
    };
    const byCategory: Record<string, number> = {};
    const bySourceType: Record<string, number> = {};
    let meanings = 0;
    let aliases = 0;
    let definedMeanings = 0;
    for (const e of this.entries) {
      aliases += e.aliases?.length ?? 0;
      for (const m of e.meanings) {
        meanings += 1;
        if (m.meaning) definedMeanings += 1;
        byConfidence[m.confidence] += 1;
        byCategory[m.category] = (byCategory[m.category] ?? 0) + 1;
        const t = this.sources.get(m.sourceId)?.type ?? 'UNKNOWN';
        bySourceType[t] = (bySourceType[t] ?? 0) + 1;
      }
    }
    return {
      version: this.version,
      entries: this.entries.length,
      meanings,
      definedMeanings,
      aliases,
      indexKeys: this.keys.length,
      byConfidence,
      byCategory,
      bySourceType,
    };
  }
}

/** ListingCategory enum value for an animal type (for filters / ranking). */
export const ANIMAL_TO_LISTING_CATEGORY: Record<AnimalType, string | null> = {
  sheep: 'sheep',
  goat: 'goats',
  camel: 'camels',
  cattle: 'cows',
  horse: 'horses',
  livestock: 'livestock',
};
