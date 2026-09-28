/** Deterministic trending score — volume alone never dominates. */
import { extractHashtagDetails, stripHashtags } from './hashtag.util';

export type TrendingSignalInput = {
  key: string;
  label: string;
  kind: 'hashtag' | 'topic' | 'phrase';
  /** Distinct posts/items carrying this signal in the window */
  volume: number;
  /** Distinct authors/users */
  uniqueAuthors: number;
  /** Sum of likes+comments+reposts (or 0 if unavailable) */
  engagement: number;
  /** Count in the most recent half of the window (velocity proxy) */
  recentHalfVolume: number;
  /** ms since newest occurrence */
  ageMs: number;
};

export type ScoredTrendingItem = {
  /** Display form, exactly as users wrote it (e.g. `#اذكرو_الله`). */
  tag: string;
  kind: 'hashtag' | 'topic' | 'phrase';
  count: number;
  score: number;
  uniqueAuthors: number;
  engagement: number;
  /** Additive fields (older clients ignore them). */
  displayTag?: string;
  normalizedTag?: string;
  rawTag?: string;
  tokenCount?: number;
  /** Posts in the most recent half of the window. */
  velocity?: number;
  /** ISO time of the newest post carrying the signal. */
  lastSeenAt?: string;
};

const WINDOW_MS = {
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
} as const;

export type TrendingWindow = keyof typeof WINDOW_MS;

export function trendingWindowMs(window: TrendingWindow = '24h'): number {
  return WINDOW_MS[window] ?? WINDOW_MS['24h'];
}

/**
 * Score = weighted mix of volume, velocity, unique authors, engagement, recency.
 * Caps any single component so one mega-topic cannot dominate solely on historical count.
 */
export function scoreTrendingSignal(
  input: TrendingSignalInput,
  windowMs: number,
): number {
  const volume = Math.min(40, Math.log2(1 + input.volume) * 8);
  const velocity = Math.min(
    30,
    (input.recentHalfVolume / Math.max(1, input.volume)) * 28 +
      Math.log2(1 + input.recentHalfVolume) * 4,
  );
  const unique = Math.min(20, Math.log2(1 + input.uniqueAuthors) * 7);
  const engagement = Math.min(18, Math.log2(1 + input.engagement) * 4);
  const recency =
    input.ageMs >= 0 && input.ageMs < windowMs
      ? 12 * (1 - input.ageMs / windowMs)
      : 0;

  return (
    Math.round((volume + velocity + unique + engagement + recency) * 100) / 100
  );
}

/**
 * Soft anti-domination: after top item, dampen single-word near-duplicates
 * sharing a stem (#غنم / #غنمي). Multi-word hashtags (#حلال_الطيبين,
 * #ابل_السعودية) are independent topics and are only de-duplicated by their
 * full normalized key - never by a 3-letter stem.
 */
export function applyAntiDomination(
  items: ScoredTrendingItem[],
  limit: number,
): ScoredTrendingItem[] {
  const out: ScoredTrendingItem[] = [];
  const seenStems = new Set<string>();
  const seenKeys = new Set<string>();

  for (const item of [...items].sort(
    (a, b) => b.score - a.score || b.count - a.count,
  )) {
    const key = (item.normalizedTag ?? item.tag).toLowerCase();
    if (seenKeys.has(key)) continue;
    const bare = key.replace(/^#/, '');
    const multiWord = (item.tokenCount ?? 1) > 1 || bare.includes('_');
    if (!multiWord) {
      const stem = bare.slice(0, Math.min(3, bare.length));
      if (stem && seenStems.has(stem) && out.length > 0) continue;
      if (stem) seenStems.add(stem);
    }
    seenKeys.add(key);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

/** Ranking bonus so full hashtags outrank loose single words. */
export function trendingKindBonus(
  kind: ScoredTrendingItem['kind'],
  tokenCount = 1,
): number {
  if (kind === 'hashtag') return 10 + Math.min(2, Math.max(0, tokenCount - 1));
  if (kind === 'phrase') return 4;
  return 0;
}

const STOP_WORDS = new Set([
  'في',
  'من',
  'على',
  'إلى',
  'عن',
  'مع',
  'هذا',
  'هذه',
  'ذلك',
  'التي',
  'الذي',
  'او',
  'أو',
  'ما',
  'لا',
  'لم',
  'بعد',
  'قبل',
  'كل',
  'تم',
  // Generic / devotional words: never a topic on their own (they used to
  // surface as fragments like "الله" / "اذكرو" / "ماشاء").
  'الله',
  'اللهم',
  'لله',
  'بالله',
  'والله',
  'ماشاء',
  'ماشاءالله',
  'شاء',
  'انشاء',
  'إنشاء',
  'سبحان',
  'الحمد',
  'الحمدلله',
  'بسم',
  'يارب',
  'اذكرو',
  'اذكروا',
  'صلوا',
  'النبي',
  'يمكن',
  'كان',
  'يكون',
  'عند',
  'الى',
  'اللي',
  'هذي',
  'كذا',
  'مثل',
  'فيه',
  'فيها',
  'عليه',
  'عليها',
  'منه',
  'لكم',
  'لنا',
  'انا',
  'أنا',
  'نحن',
  'انت',
  'أنت',
  'غير',
  'بين',
  'حتى',
  'ايش',
  'وش',
  'شي',
  'شيء',
  'جدا',
  'كثير',
  'اليوم',
  'the',
  'and',
  'for',
  'with',
]);

/**
 * Whole hashtags in display form (`#اذكرو_الله`), unique per text.
 * See hashtag.util for the tokenization rules.
 */
export function extractHashtags(text: string): string[] {
  return extractHashtagDetails(text ?? '').map((t) =>
    t.displayTag.toLowerCase(),
  );
}

const UNDERSCORE_PHRASE_RE = /[\p{L}\p{N}]+(?:_+[\p{L}\p{N}]+)+/gu;

/**
 * Underscore-joined phrases written without `#` (`اذكرو_الله`) - kept whole
 * as one phrase instead of being split into generic fragments.
 */
export function extractUnderscorePhrases(text: string): string[] {
  const cleaned = stripHashtags(text ?? '');
  const out = new Set<string>();
  for (const m of cleaned.match(UNDERSCORE_PHRASE_RE) ?? []) {
    if (m.length <= 40 && /\p{L}/u.test(m)) out.add(m.replace(/_+/g, '_'));
  }
  return [...out];
}

/** Simple Arabic/Latin keyword phrases (2–24 chars) for topic surfacing. */
export function extractTopicTokens(text: string): string[] {
  const cleaned = stripHashtags(text ?? '')
    .replace(UNDERSCORE_PHRASE_RE, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('ar');
  if (!cleaned) return [];
  return cleaned
    .split(' ')
    .filter((t) => t.length >= 3 && t.length <= 24 && !STOP_WORDS.has(t))
    .filter((t, i, all) => all.indexOf(t) === i)
    .slice(0, 12);
}
