import { normalizeArabicSearchText } from './arabic-search.util';

export type SearchRankFields = {
  title?: string | null;
  subtitle?: string | null;
  description?: string | null;
  category?: string | null;
  keywords?: string[];
  /** ISO date for recency tie-break */
  createdAt?: Date | string | null;
  /** Active/featured boost (small, never beats strong text match) */
  boost?: number;
};

const RECENCY_MS = 30 * 24 * 60 * 60 * 1000;

function norm(value: string | null | undefined): string {
  return normalizeArabicSearchText(value ?? '');
}

function containsToken(haystack: string, token: string): boolean {
  if (!haystack || !token) return false;
  return haystack.includes(token);
}

function startsWithToken(haystack: string, token: string): boolean {
  if (!haystack || !token) return false;
  return haystack.startsWith(token);
}

/**
 * Score a candidate against normalized full query + token list.
 * Higher = more relevant. Tuned per content type via optional weights.
 */
export function scoreSearchMatch(
  rawQuery: string,
  tokens: string[],
  fields: SearchRankFields,
  weights: {
    phrase?: number;
    title?: number;
    titleStart?: number;
    titleToken?: number;
    subtitle?: number;
    description?: number;
    category?: number;
    keyword?: number;
    partial?: number;
    allTokensBonus?: number;
    recency?: number;
    boost?: number;
  } = {},
): number {
  const w = {
    phrase: 100,
    title: 40,
    titleStart: 25,
    titleToken: 18,
    subtitle: 12,
    description: 8,
    category: 6,
    keyword: 5,
    partial: 3,
    allTokensBonus: 30,
    recency: 8,
    boost: 5,
    ...weights,
  };

  const queryNorm = norm(rawQuery);
  const title = norm(fields.title);
  const subtitle = norm(fields.subtitle);
  const description = norm(fields.description);
  const category = norm(fields.category);
  const keywords = (fields.keywords ?? []).map((k) => norm(k)).filter(Boolean);

  if (!queryNorm && tokens.length === 0) return 0;

  let score = 0;

  if (queryNorm.length >= 2) {
    if (title === queryNorm) score += w.phrase;
    else if (title.includes(queryNorm)) score += w.phrase * 0.85;
    else if (subtitle.includes(queryNorm) || description.includes(queryNorm)) {
      score += w.phrase * 0.5;
    }
  }

  if (title.startsWith(queryNorm) && queryNorm.length >= 2) {
    score += w.titleStart;
  }

  let matchedTokens = 0;
  for (const token of tokens) {
    if (!token) continue;
    let tokenMatched = false;

    if (title === token) {
      score += w.title;
      tokenMatched = true;
    } else if (startsWithToken(title, token)) {
      score += w.titleStart;
      tokenMatched = true;
    } else if (containsToken(title, token)) {
      score += w.titleToken;
      tokenMatched = true;
    } else if (containsToken(subtitle, token)) {
      score += w.subtitle;
      tokenMatched = true;
    } else if (containsToken(description, token)) {
      score += w.description;
      tokenMatched = true;
    } else if (containsToken(category, token)) {
      score += w.category;
      tokenMatched = true;
    } else if (keywords.some((k) => containsToken(k, token))) {
      score += w.keyword;
      tokenMatched = true;
    } else if (
      queryNorm.length >= 3 &&
      token.length >= 3 &&
      (title.includes(token.slice(0, Math.max(2, token.length - 1))) ||
        description.includes(token.slice(0, Math.max(2, token.length - 1))))
    ) {
      score += w.partial;
      tokenMatched = true;
    }

    if (tokenMatched) matchedTokens += 1;
  }

  if (tokens.length > 1 && matchedTokens === tokens.length) {
    score += w.allTokensBonus;
  }

  if (fields.createdAt) {
    const created =
      fields.createdAt instanceof Date
        ? fields.createdAt.getTime()
        : new Date(fields.createdAt).getTime();
    if (Number.isFinite(created)) {
      const age = Date.now() - created;
      if (age >= 0 && age < RECENCY_MS) {
        score += w.recency * (1 - age / RECENCY_MS);
      }
    }
  }

  if (fields.boost && fields.boost > 0) {
    score += Math.min(w.boost, fields.boost);
  }

  return Math.round(score * 100) / 100;
}

export function rankSearchResults<
  T extends { relevance: number; createdAt?: string | Date | null },
>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (b.relevance !== a.relevance) return b.relevance - a.relevance;
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bTime - aTime;
  });
}

export type RankAlternative = { term: string; weight: number };

/**
 * Score for rows that matched a query token only through a dictionary alias
 * (e.g. query "غنم", row says "خراف"). Capped below a direct title hit
 * (`titleToken` = 18) so an exact match always outranks an alias match, and
 * scaled by the alias weight (low-confidence terms weigh less).
 */
export function scoreAliasMatch(
  tokens: string[],
  expansions: RankAlternative[][],
  fields: Pick<SearchRankFields, 'title' | 'description' | 'keywords'>,
): number {
  if (!expansions.length) return 0;
  const title = norm(fields.title);
  const description = norm(fields.description);
  const keywords = (fields.keywords ?? []).map((k) => norm(k)).join(' ');
  let score = 0;
  tokens.forEach((token, i) => {
    const t = norm(token);
    // Direct hit already scored by scoreSearchMatch.
    if (
      t &&
      (title.includes(t) || description.includes(t) || keywords.includes(t))
    )
      return;
    let best = 0;
    for (const alt of expansions[i] ?? []) {
      const a = norm(alt.term);
      if (!a) continue;
      if (title.includes(a)) best = Math.max(best, 12 * alt.weight);
      else if (keywords.includes(a)) best = Math.max(best, 8 * alt.weight);
      else if (description.includes(a)) best = Math.max(best, 6 * alt.weight);
    }
    score += best;
  });
  return Math.round(score * 100) / 100;
}

export type RankMetadataField = { value: string; confidence: number } | null;

export type RankMetadata = {
  animalType: RankMetadataField;
  breed: RankMetadataField;
  gender: RankMetadataField;
  ageStage: RankMetadataField;
  reproductiveStatus: RankMetadataField;
};

/**
 * Small, confidence-weighted bonus when the query intent (from text or the
 * optional advanced params) agrees with a listing's extracted metadata or its
 * structured category. Max ~12 - never beats a strong text match.
 */
export function scoreMetadataMatch(
  intent: Partial<RankMetadata>,
  row: Partial<RankMetadata>,
  rowCategoryAnimal?: string | null,
): number {
  let score = 0;
  const same = (a?: RankMetadataField, b?: RankMetadataField) =>
    !!a && !!b && norm(a.value) === norm(b.value);
  if (intent.animalType) {
    if (rowCategoryAnimal && rowCategoryAnimal === intent.animalType.value) {
      score += 4 * intent.animalType.confidence;
    } else if (same(intent.animalType, row.animalType)) {
      score +=
        3 * intent.animalType.confidence * (row.animalType?.confidence ?? 0);
    }
  }
  if (same(intent.breed, row.breed)) {
    score += 4 * (intent.breed?.confidence ?? 0) * (row.breed?.confidence ?? 0);
  }
  if (same(intent.gender, row.gender)) {
    score +=
      2 * (intent.gender?.confidence ?? 0) * (row.gender?.confidence ?? 0);
  }
  if (same(intent.ageStage, row.ageStage)) {
    score +=
      1.5 *
        (intent.ageStage?.confidence ?? 0) *
        (row.ageStage?.confidence ?? 0) +
      0.5;
  }
  if (same(intent.reproductiveStatus, row.reproductiveStatus)) {
    score +=
      1.5 *
      (intent.reproductiveStatus?.confidence ?? 0) *
      (row.reproductiveStatus?.confidence ?? 0);
  }
  return Math.round(Math.min(12, score) * 100) / 100;
}
