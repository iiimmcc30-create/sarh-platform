import { normalizeArabicSearchText } from '../../search/lib/arabic-search.util';
import { HELP_CONCEPTS } from './help-synonyms';

/**
 * FAQ retrieval for the help center and «مساعد سرح» (pure, in-memory).
 * Score = concept overlap (synonym dictionary) + token overlap + character
 * trigram similarity, each on a 0..1 scale. ~120 FAQs → trivially fast.
 */

export type RetrievableFaq = {
  id: string;
  questionAr: string;
  answerAr: string;
  keywords?: string[] | null;
};

export type RankedFaq<T extends RetrievableFaq> = { faq: T; score: number };

/** Minimum score for a FAQ to show in search results. */
export const FAQ_SEARCH_MIN_SCORE = 0.18;
/** Minimum score for «مساعد سرح» to answer directly from a FAQ. */
export const FAQ_ANSWER_MIN_SCORE = 0.42;

const STOPWORDS = new Set(
  [
    'كيف',
    'وش',
    'ايش',
    'شو',
    'ابي',
    'ابغي',
    'ابغا',
    'ودي',
    'ليش',
    'لماذا',
    'هل',
    'ما',
    'من',
    'في',
    'على',
    'عن',
    'الي',
    'الى',
    'انا',
    'لي',
    'يا',
    'اللي',
    'التي',
    'الذي',
    'متي',
    'وين',
    'اين',
    'هذا',
    'هذي',
    'هذه',
    'ذا',
    'او',
    'و',
    'ثم',
    'مع',
    'عشان',
    'لان',
    'بس',
    'طيب',
    'السلام',
    'عليكم',
    'مرحبا',
    'هلا',
    'لو',
    'سمحت',
    'الله',
    'يعطيك',
    'العافيه',
    'شي',
    'شيء',
    'اقدر',
    'ممكن',
    'لازم',
    'يقول',
    'عندي',
    'فيه',
    'كل',
    'اذا',
    'ان',
    'انه',
    'قد',
    'لم',
    'لا',
    'تم',
    'the',
    'a',
    'to',
    'how',
    'i',
    'my',
    'is',
    'can',
  ].map((w) => normalizeArabicSearchText(w)),
);

const PREFIXES = ['وال', 'بال', 'فال', 'كال', 'لل', 'ال', 'و', 'ب', 'ف'];
const SUFFIXES = ['هم', 'ها', 'نا', 'ني', 'ات', 'ين', 'ون', 'ي', 'ه', 'ك'];

export function normalizeHelpText(input: string): string {
  return normalizeArabicSearchText(
    (input ?? '').replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))),
  );
}

/** Light Arabic stemming: the word plus clitic-stripped forms (min 3 letters). */
export function stemForms(word: string): string[] {
  const forms = new Set<string>([word]);
  for (const p of PREFIXES) {
    if (word.startsWith(p) && word.length - p.length >= 3) {
      forms.add(word.slice(p.length));
      break;
    }
  }
  for (const base of [...forms]) {
    for (const s of SUFFIXES) {
      if (base.endsWith(s) && base.length - s.length >= 3) {
        forms.add(base.slice(0, -s.length));
        break;
      }
    }
  }
  return [...forms];
}

export function contentTokens(text: string): string[] {
  return normalizeHelpText(text)
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

type ConceptIndex = {
  words: Map<string, Set<string>>;
  phrases: Array<{ phrase: string; concept: string }>;
};

let conceptIndex: ConceptIndex | null = null;

function getConceptIndex(): ConceptIndex {
  if (conceptIndex) return conceptIndex;
  const words = new Map<string, Set<string>>();
  const phrases: ConceptIndex['phrases'] = [];
  for (const [concept, variants] of Object.entries(HELP_CONCEPTS)) {
    for (const raw of variants) {
      const v = normalizeHelpText(raw);
      if (!v) continue;
      if (v.includes(' ')) {
        phrases.push({ phrase: v, concept });
        continue;
      }
      for (const form of stemForms(v)) {
        if (!words.has(form)) words.set(form, new Set());
        words.get(form)!.add(concept);
      }
    }
  }
  conceptIndex = { words, phrases };
  return conceptIndex;
}

/** Concepts mentioned by a text (phrases + stemmed words). */
export function conceptsOf(text: string): Set<string> {
  const index = getConceptIndex();
  const norm = ` ${normalizeHelpText(text)} `;
  const out = new Set<string>();
  for (const { phrase, concept } of index.phrases) {
    if (norm.includes(` ${phrase} `) || norm.includes(` ${phrase}`))
      out.add(concept);
  }
  for (const token of norm.trim().split(/\s+/)) {
    if (!token) continue;
    for (const form of stemForms(token)) {
      const hit = index.words.get(form);
      if (hit) hit.forEach((c) => out.add(c));
    }
  }
  return out;
}

function stemSet(text: string): Set<string> {
  const out = new Set<string>();
  for (const t of contentTokens(text)) for (const f of stemForms(t)) out.add(f);
  return out;
}

export function trigrams(text: string): Set<string> {
  const norm = normalizeHelpText(text).replace(/\s+/g, ' ');
  const padded = `  ${norm} `;
  const out = new Set<string>();
  for (let i = 0; i + 3 <= padded.length; i += 1)
    out.add(padded.slice(i, i + 3));
  return out;
}

export function trigramSimilarity(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  a.forEach((g) => {
    if (b.has(g)) inter += 1;
  });
  return (2 * inter) / (a.size + b.size);
}

type FaqFeatures = {
  headStems: Set<string>;
  bodyStems: Set<string>;
  headConcepts: Set<string>;
  bodyConcepts: Set<string>;
  phraseTrigrams: Set<string>[];
};

const featureCache = new WeakMap<object, { sig: string; f: FaqFeatures }>();

function featuresOf(faq: RetrievableFaq): FaqFeatures {
  const keywords = (faq.keywords ?? []).filter(Boolean);
  const sig = `${faq.questionAr}\u0001${faq.answerAr}\u0001${keywords.join('\u0002')}`;
  const cached = featureCache.get(faq);
  if (cached && cached.sig === sig) return cached.f;
  const head = [faq.questionAr, ...keywords].join(' ');
  const f: FaqFeatures = {
    headStems: stemSet(head),
    bodyStems: stemSet(faq.answerAr),
    headConcepts: conceptsOf(head),
    bodyConcepts: conceptsOf(faq.answerAr),
    phraseTrigrams: [faq.questionAr, ...keywords].map(trigrams),
  };
  featureCache.set(faq, { sig, f });
  return f;
}

export function scoreFaq(query: string, faq: RetrievableFaq): number {
  const qTokens = contentTokens(query);
  const qConcepts = conceptsOf(query);
  if (!qTokens.length && !qConcepts.size) return 0;
  const f = featuresOf(faq);

  let tokenHits = 0;
  for (const t of qTokens) {
    const forms = stemForms(t);
    if (forms.some((x) => f.headStems.has(x))) tokenHits += 1;
    else if (forms.some((x) => f.bodyStems.has(x))) tokenHits += 0.35;
  }
  const tokenScore = qTokens.length ? tokenHits / qTokens.length : 0;

  let conceptHits = 0;
  qConcepts.forEach((c) => {
    if (f.headConcepts.has(c)) conceptHits += 1;
    else if (f.bodyConcepts.has(c)) conceptHits += 0.4;
  });
  const conceptScore = qConcepts.size ? conceptHits / qConcepts.size : 0;

  const qTri = trigrams(query);
  let triScore = 0;
  for (const tri of f.phraseTrigrams) {
    triScore = Math.max(triScore, trigramSimilarity(qTri, tri));
  }

  const score = qConcepts.size
    ? 0.45 * conceptScore + 0.3 * tokenScore + 0.25 * triScore
    : 0.55 * tokenScore + 0.45 * triScore;
  return Math.round(score * 1000) / 1000;
}

/** Rank FAQs for a natural-language query (best first, ties keep input order). */
export function rankFaqs<T extends RetrievableFaq>(
  query: string,
  faqs: readonly T[],
  options: { limit?: number; minScore?: number } = {},
): RankedFaq<T>[] {
  const { limit = 10, minScore = FAQ_SEARCH_MIN_SCORE } = options;
  if (!normalizeHelpText(query)) return [];
  return faqs
    .map((faq, i) => ({ faq, score: scoreFaq(query, faq), i }))
    .filter((r) => r.score >= minScore)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, limit)
    .map(({ faq, score }) => ({ faq, score }));
}
