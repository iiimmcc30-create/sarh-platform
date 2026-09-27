/**
 * Trending topics list (X-style) - pure view mapping over the existing
 * `/api/search/trending` response. No hardcoded topics and no re-ranking:
 * the API order is the rank.
 */
export type TrendingApiItem = {
  tag?: string | null;
  kind?: string | null;
  count?: number | null;
  score?: number | null;
};

export type TrendingRow = {
  key: string;
  rank: number;
  title: string;
  meta: string;
  countLabel: string | null;
  /** What a tap searches for (the existing applyQuery path). */
  query: string;
};

/** Row metrics: plain list, no cards / borders / backgrounds. */
export const TRENDING_ROW = {
  metaFontSize: 13,
  titleFontSize: 16,
  titleFontWeight: '700' as const,
  paddingHorizontal: 16,
  paddingVertical: 16,
  lineGap: 2,
} as const;

export const TRENDING_NEUTRAL_LABEL = 'متداول';
export const TRENDING_META_SEPARATOR = ' • ';
/** How many trends the Explore tab previews (the Trending tab shows all). */
export const EXPLORE_TRENDING_PREVIEW = 5;

/** Context label from the API `kind` (hashtag / topic / phrase); null when unknown. */
export function trendingKindLabel(kind: string | null | undefined): string | null {
  switch (kind) {
    case 'hashtag':
      return 'وسم';
    case 'topic':
      return 'موضوع';
    case 'phrase':
      return 'عبارة';
    default:
      return null;
  }
}

/** "1 • وسم • متداول", or "1 • متداول" when the item has no context. */
export function trendingMetaLine(rank: number, kind?: string | null): string {
  const context = trendingKindLabel(kind);
  return [String(rank), context, TRENDING_NEUTRAL_LABEL]
    .filter(Boolean)
    .join(TRENDING_META_SEPARATOR);
}

/** Post volume from the API (`count`); null when the API gave none. */
export function trendingPostCountLabel(count: number | null | undefined): string | null {
  if (typeof count !== 'number' || !Number.isFinite(count) || count <= 0) return null;
  const n = Math.floor(count);
  if (n === 1) return 'منشور واحد';
  if (n === 2) return 'منشوران';
  if (n <= 10) return `${n} منشورات`;
  return `${n} منشور`;
}

/** API items -> rows, keeping API order; drops empty tags and duplicates. */
export function toTrendingRows(items: readonly TrendingApiItem[] | null | undefined): TrendingRow[] {
  if (!Array.isArray(items)) return [];
  const seen = new Set<string>();
  const rows: TrendingRow[] = [];
  for (const item of items) {
    const title = typeof item?.tag === 'string' ? item.tag.trim() : '';
    if (!title) continue;
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const rank = rows.length + 1;
    rows.push({
      key,
      rank,
      title,
      meta: trendingMetaLine(rank, item.kind),
      countLabel: trendingPostCountLabel(item.count),
      query: title,
    });
  }
  return rows;
}