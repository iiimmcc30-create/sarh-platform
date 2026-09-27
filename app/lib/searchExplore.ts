/**
 * Search -> Explore is social discovery, not a marketplace.
 * The API still returns listings / market categories (kept for other screens
 * and for the Ads search); Explore just never renders them.
 */
export type ExploreSectionLike = { type: string; title?: string; items?: unknown[] | null };

/** Render order: trending, suggested accounts, feed suppliers, then content. */
export const EXPLORE_SECTION_ORDER = ['trending_topics', 'accounts', 'feed_suppliers', 'news'] as const;

/** Never shown in Explore (marketplace). */
export const EXPLORE_HIDDEN_SECTIONS = ['listings', 'feed_categories'] as const;

export function isExploreSectionHidden(type: string): boolean {
  return (EXPLORE_HIDDEN_SECTIONS as readonly string[]).includes(type);
}

/** Visible sections in Explore order; empty or unknown sections are dropped. */
export function orderExploreSections<T extends ExploreSectionLike>(sections: readonly T[] | null | undefined): T[] {
  if (!Array.isArray(sections)) return [];
  const order = EXPLORE_SECTION_ORDER as readonly string[];
  return sections
    .filter((s) => s && order.includes(s.type) && !isExploreSectionHidden(s.type))
    .filter((s) => Array.isArray(s.items) && s.items.length > 0)
    .slice()
    .sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
}