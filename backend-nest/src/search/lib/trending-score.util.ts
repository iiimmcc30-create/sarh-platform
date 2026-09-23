/** Deterministic trending score — volume alone never dominates. */

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
  tag: string;
  kind: 'hashtag' | 'topic' | 'phrase';
  count: number;
  score: number;
  uniqueAuthors: number;
  engagement: number;
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

/** Soft anti-domination: after top item, dampen near-duplicates sharing a stem. */
export function applyAntiDomination(
  items: ScoredTrendingItem[],
  limit: number,
): ScoredTrendingItem[] {
  const out: ScoredTrendingItem[] = [];
  const seenStems = new Set<string>();

  for (const item of [...items].sort(
    (a, b) => b.score - a.score || b.count - a.count,
  )) {
    const bare = item.tag.replace(/^#/, '');
    const stem = bare.slice(0, Math.min(3, bare.length));
    if (stem && seenStems.has(stem) && out.length > 0) {
      continue;
    }
    if (stem) seenStems.add(stem);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
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
  'the',
  'and',
  'for',
  'with',
]);

export function extractHashtags(text: string): string[] {
  const matches = text.match(/#[\u0600-\u06FF\w_]+/g) ?? [];
  return matches.map((t) => t.toLowerCase());
}

/** Simple Arabic/Latin keyword phrases (2–24 chars) for topic surfacing. */
export function extractTopicTokens(text: string): string[] {
  const cleaned = text
    .replace(/#[\u0600-\u06FF\w_]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('ar');
  if (!cleaned) return [];
  return cleaned
    .split(' ')
    .filter((t) => t.length >= 3 && t.length <= 24 && !STOP_WORDS.has(t))
    .slice(0, 12);
}
