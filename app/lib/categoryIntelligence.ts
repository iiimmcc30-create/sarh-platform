import type { MarketCategory } from '@/services/categories';
import { includesNormalized, normalizeArabic, tokenizeArabic } from '@/lib/arabicNormalize';

export type CategorySuggestion = {
  parentSlug: string;
  childSlug?: string;
  confidence: number;
  matchedKeywords: string[];
  alternatives: Array<{
    parentSlug: string;
    childSlug?: string;
    confidence: number;
  }>;
};

export type ClassifyTitleOptions = {
  categories: MarketCategory[];
  /** Extra user-provided aliases per slug (optional, extensible). */
  extraAliases?: Record<string, string[]>;
};

type TermRule = {
  term: string;
  weight: number;
};

type ContextRule = {
  id: string;
  /** If any of these match, apply boosts/suppressions. */
  triggers: string[];
  boostSlugs: Record<string, number>;
  suppressSlugs?: string[];
};

const PARENT_ALIASES: Record<string, TermRule[]> = {
  livestock: [
    { term: 'مواشي', weight: 1 },
    { term: 'ماشية', weight: 1 },
    { term: 'حلال', weight: 0.92 },
    { term: 'غنم', weight: 0.95 },
    { term: 'اغنام', weight: 0.98 },
    { term: 'خروف', weight: 0.95 },
    { term: 'خرفان', weight: 0.95 },
    { term: 'نعجه', weight: 0.95 },
    { term: 'نعاج', weight: 0.98 },
    { term: 'ضان', weight: 0.9 },
    { term: 'حريه', weight: 0.72 },
    { term: 'حريات', weight: 0.78 },
    { term: 'تيس', weight: 0.95 },
    { term: 'تيوس', weight: 0.98 },
    { term: 'ماعز', weight: 0.98 },
    { term: 'معزا', weight: 0.9 },
    { term: 'جمل', weight: 0.98 },
    { term: 'جمال', weight: 0.95 },
    { term: 'ناقه', weight: 0.98 },
    { term: 'ناقه', weight: 0.98 },
    { term: 'نوق', weight: 0.95 },
    { term: 'ابل', weight: 0.98 },
    { term: 'بعير', weight: 0.9 },
    { term: 'بقر', weight: 0.95 },
    { term: 'بقره', weight: 0.95 },
    { term: 'ابقار', weight: 0.98 },
    { term: 'عجل', weight: 0.88 },
    { term: 'حصان', weight: 0.95 },
    { term: 'خيول', weight: 0.98 },
    { term: 'فرس', weight: 0.9 },
    { term: 'دجاج', weight: 0.9 },
    { term: 'دواجن', weight: 0.95 },
    { term: 'حمام', weight: 0.75 },
  ],
  feed: [
    { term: 'علف', weight: 1 },
    { term: 'اعلاف', weight: 1 },
    { term: 'شعير', weight: 1 },
    { term: 'برسيم', weight: 1 },
    { term: 'تبن', weight: 1 },
    { term: 'دريس', weight: 0.9 },
    { term: 'سيلاج', weight: 0.9 },
    { term: 'مركز', weight: 0.55 },
    { term: 'مكمل', weight: 0.55 },
    { term: 'نخاله', weight: 0.85 },
  ],
  equipment: [
    { term: 'معلف', weight: 1 },
    { term: 'معالف', weight: 1 },
    { term: 'مشرب', weight: 0.95 },
    { term: 'مشارب', weight: 0.95 },
    { term: 'حظيره', weight: 0.95 },
    { term: 'حظائر', weight: 0.95 },
    { term: 'شبك', weight: 0.7 },
    { term: 'معده', weight: 0.85 },
    { term: 'معدات', weight: 0.95 },
    { term: 'ثلاجه', weight: 0.88 },
    { term: 'ثلاجات', weight: 0.88 },
    { term: 'عرض', weight: 0.2 },
    { term: 'ميزان', weight: 0.7 },
    { term: 'مقص', weight: 0.55 },
    { term: 'صوف', weight: 0.4 },
  ],
  transport: [
    { term: 'نقل', weight: 1 },
    { term: 'دينا', weight: 0.95 },
    { term: 'وايت', weight: 0.7 },
    { term: 'سطحه', weight: 0.95 },
    { term: 'ونش', weight: 0.9 },
    { term: 'شاحنه', weight: 0.95 },
    { term: 'سياره', weight: 0.72 },
    { term: 'سيارات', weight: 0.72 },
    { term: 'تريله', weight: 0.9 },
  ],
  slaughter: [
    { term: 'ذبيحه', weight: 1 },
    { term: 'ذبائح', weight: 1 },
    { term: 'مذبوح', weight: 0.95 },
    { term: 'مذبوحه', weight: 0.95 },
    { term: 'لحم', weight: 0.7 },
    { term: 'مسلوخ', weight: 0.9 },
    { term: 'تقطيع', weight: 0.55 },
  ],
};

const CHILD_ALIASES: Record<string, TermRule[]> = {
  sheep: [
    { term: 'غنم', weight: 1 },
    { term: 'اغنام', weight: 1 },
    { term: 'خروف', weight: 1 },
    { term: 'خرفان', weight: 1 },
    { term: 'نعجه', weight: 1 },
    { term: 'نعاج', weight: 1 },
    { term: 'حريه', weight: 0.8 },
    { term: 'حريات', weight: 0.85 },
    { term: 'ضان', weight: 0.9 },
  ],
  goats: [
    { term: 'تيس', weight: 1 },
    { term: 'تيوس', weight: 1 },
    { term: 'ماعز', weight: 1 },
    { term: 'معزا', weight: 0.9 },
    { term: 'عناق', weight: 0.8 },
  ],
  camels: [
    { term: 'جمل', weight: 1 },
    { term: 'جمال', weight: 1 },
    { term: 'ناقه', weight: 1 },
    { term: 'نوق', weight: 1 },
    { term: 'ابل', weight: 1 },
    { term: 'بعير', weight: 0.9 },
  ],
  cows: [
    { term: 'بقر', weight: 1 },
    { term: 'بقره', weight: 1 },
    { term: 'ابقار', weight: 1 },
    { term: 'عجل', weight: 0.9 },
  ],
  horses: [
    { term: 'حصان', weight: 1 },
    { term: 'خيول', weight: 1 },
    { term: 'فرس', weight: 0.95 },
  ],
  birds: [
    { term: 'دجاج', weight: 1 },
    { term: 'دواجن', weight: 1 },
    { term: 'حمام', weight: 0.8 },
  ],
  barley: [{ term: 'شعير', weight: 1 }],
  hay: [{ term: 'تبن', weight: 1 }, { term: 'دريس', weight: 0.85 }],
  clover: [{ term: 'برسيم', weight: 1 }],
  concentrate: [{ term: 'مركز', weight: 0.7 }, { term: 'مركزه', weight: 0.75 }],
  'livestock-feed': [{ term: 'علف اغنام', weight: 0.95 }, { term: 'علف مواشي', weight: 1 }],
  'feeders-drinkers': [
    { term: 'معلف', weight: 1 },
    { term: 'معالف', weight: 1 },
    { term: 'مشرب', weight: 0.95 },
  ],
  pens: [{ term: 'حظيره', weight: 1 }, { term: 'حظائر', weight: 1 }],
  'livestock-transport': [{ term: 'نقل مواشي', weight: 1 }, { term: 'نقل اغنام', weight: 1 }],
  'feed-transport': [{ term: 'نقل اعلاف', weight: 1 }, { term: 'نقل شعير', weight: 0.9 }],
  'flatbed-winch': [{ term: 'سطحه', weight: 1 }, { term: 'ونش', weight: 0.95 }],
  'sheep-carcass': [{ term: 'ذبيحه غنم', weight: 1 }, { term: 'ذبائح اغنام', weight: 1 }],
};

const CONTEXT_RULES: ContextRule[] = [
  {
    id: 'vehicle-not-livestock',
    triggers: ['سياره', 'سيارات', 'نقل', 'دينا', 'شاحنه', 'تريله', 'سطحه', 'ونش'],
    boostSlugs: { transport: 1.35, 'livestock-transport': 1.2 },
    suppressSlugs: ['livestock', 'sheep', 'goats', 'camels', 'cows'],
  },
  {
    id: 'feeder-not-livestock',
    triggers: ['معلف', 'معالف', 'مشرب', 'مشارب'],
    boostSlugs: { equipment: 1.4, 'feeders-drinkers': 1.35 },
    suppressSlugs: ['livestock', 'feed', 'sheep', 'goats'],
  },
  {
    id: 'slaughter-context',
    triggers: ['ذبيحه', 'ذبائح', 'مذبوح', 'مذبوحه', 'مسلوخ'],
    boostSlugs: { slaughter: 1.45 },
    suppressSlugs: ['livestock'],
  },
  {
    id: 'feed-context',
    triggers: ['شعير', 'برسيم', 'تبن', 'دريس', 'علف', 'اعلاف', 'سيلاج'],
    boostSlugs: { feed: 1.2 },
    suppressSlugs: ['livestock'],
  },
  {
    id: 'fridge-equipment',
    triggers: ['ثلاجه', 'ثلاجات'],
    boostSlugs: { equipment: 1.35 },
    suppressSlugs: ['livestock', 'feed'],
  },
];

const AUTO_SELECT_MIN = 0.78;
const SUGGEST_MIN = 0.52;

function mergeAliases(
  base: Record<string, TermRule[]>,
  extra?: Record<string, string[]>,
): Record<string, TermRule[]> {
  if (!extra) return base;
  const next: Record<string, TermRule[]> = { ...base };
  for (const [slug, terms] of Object.entries(extra)) {
    const existing = next[slug] ?? [];
    next[slug] = [
      ...existing,
      ...terms.map((term) => ({ term: normalizeArabic(term), weight: 0.9 })),
    ];
  }
  return next;
}

function scoreTerms(titleNorm: string, tokens: string[], rules: TermRule[]): {
  score: number;
  matched: string[];
} {
  let score = 0;
  const matched: string[] = [];
  for (const rule of rules) {
    const term = normalizeArabic(rule.term);
    if (!term) continue;
    if (term.includes(' ')) {
      if (titleNorm.includes(term)) {
        score += rule.weight * 1.15;
        matched.push(rule.term);
      }
      continue;
    }
    if (tokens.includes(term) || titleNorm.includes(term)) {
      score += rule.weight;
      matched.push(rule.term);
    }
  }
  return { score, matched };
}

function applyContext(
  titleNorm: string,
  scores: Map<string, number>,
): void {
  for (const rule of CONTEXT_RULES) {
    const hit = rule.triggers.some((t) => titleNorm.includes(normalizeArabic(t)));
    if (!hit) continue;
    for (const [slug, factor] of Object.entries(rule.boostSlugs)) {
      scores.set(slug, (scores.get(slug) ?? 0) * factor + 0.35);
    }
    for (const slug of rule.suppressSlugs ?? []) {
      scores.set(slug, (scores.get(slug) ?? 0) * 0.22);
    }
  }
}

function toConfidence(raw: number, runnerUp = 0): number {
  if (raw <= 0) return 0;
  const dominance = runnerUp <= 0 ? 0.12 : Math.min(0.12, ((raw - runnerUp) / raw) * 0.16);
  return Math.min(0.99, 1 - Math.exp(-raw * 1.85) + dominance);
}

export function classifyListingTitle(
  title: string,
  options: ClassifyTitleOptions,
): CategorySuggestion | null {
  const trimmed = title.trim();
  if (trimmed.length < 2) return null;

  const titleNorm = normalizeArabic(trimmed);
  const tokens = tokenizeArabic(trimmed);
  const parentAliases = mergeAliases(PARENT_ALIASES, options.extraAliases);
  const childAliases = mergeAliases(CHILD_ALIASES, options.extraAliases);

  const scores = new Map<string, number>();
  const matchedBySlug = new Map<string, string[]>();

  const addScore = (slug: string, add: number, matched: string[]) => {
    if (add <= 0) return;
    scores.set(slug, (scores.get(slug) ?? 0) + add);
    if (matched.length) {
      matchedBySlug.set(slug, [...(matchedBySlug.get(slug) ?? []), ...matched]);
    }
  };

  for (const [slug, rules] of Object.entries(parentAliases)) {
    const { score, matched } = scoreTerms(titleNorm, tokens, rules);
    addScore(slug, score, matched);
  }
  for (const [slug, rules] of Object.entries(childAliases)) {
    const { score, matched } = scoreTerms(titleNorm, tokens, rules);
    addScore(slug, score, matched);
  }

  for (const parent of options.categories) {
    if (includesNormalized(title, parent.nameAr) || includesNormalized(title, parent.slug)) {
      addScore(parent.slug, 0.85, [parent.nameAr]);
    }
    for (const child of parent.children ?? []) {
      if (includesNormalized(title, child.nameAr) || includesNormalized(title, child.slug)) {
        addScore(child.slug, 0.95, [child.nameAr]);
        addScore(parent.slug, 0.55, [child.nameAr]);
      }
    }
  }

  applyContext(titleNorm, scores);

  const parentSlugs = new Set(options.categories.map((c) => c.slug));
  const parentScores = [...parentSlugs]
    .map((slug) => ({ slug, score: scores.get(slug) ?? 0 }))
    .sort((a, b) => b.score - a.score);

  const bestParent = parentScores[0];
  if (!bestParent || bestParent.score <= 0) return null;

  const parent = options.categories.find((c) => c.slug === bestParent.slug);
  const children = parent?.children?.filter((c) => c.isActive) ?? [];
  const childScores = children
    .map((c) => ({ slug: c.slug, score: scores.get(c.slug) ?? 0 }))
    .sort((a, b) => b.score - a.score);

  const bestChild = childScores[0]?.score > 0 ? childScores[0] : undefined;
  const raw = bestParent.score + (bestChild?.score ?? 0) * 0.35;
  const runnerUp = parentScores[1]?.score ?? 0;
  const confidence = toConfidence(raw, runnerUp);

  const alternatives = parentScores
    .slice(1, 3)
    .filter((p) => p.score > 0)
    .map((p) => ({
      parentSlug: p.slug,
      confidence: toConfidence(p.score),
    }));

  const matched = [
    ...(matchedBySlug.get(bestParent.slug) ?? []),
    ...(bestChild ? matchedBySlug.get(bestChild.slug) ?? [] : []),
  ].filter((v, i, arr) => arr.indexOf(v) === i);

  return {
    parentSlug: bestParent.slug,
    childSlug: bestChild?.slug,
    confidence,
    matchedKeywords: matched,
    alternatives,
  };
}

export function suggestionMode(
  suggestion: CategorySuggestion | null,
): 'auto' | 'suggest' | 'none' {
  if (!suggestion) return 'none';
  if (suggestion.confidence >= AUTO_SELECT_MIN) return 'auto';
  if (suggestion.confidence >= SUGGEST_MIN) return 'suggest';
  return 'none';
}

export function findCategoryBySlug(
  categories: MarketCategory[],
  parentSlug: string,
  childSlug?: string,
): { parent: MarketCategory; child: MarketCategory | null } | null {
  const parent = categories.find((c) => c.slug === parentSlug && c.isActive) ?? null;
  if (!parent) return null;
  const child =
    (childSlug
      ? parent.children?.find((c) => c.slug === childSlug && c.isActive)
      : undefined) ??
    parent.children?.find((c) => c.isActive && !c.slug.endsWith('-other')) ??
    parent.children?.find((c) => c.isActive) ??
    null;
  return { parent, child };
}
