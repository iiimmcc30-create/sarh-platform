/**
 * Quiet solid covers for lists that have no image.
 * Stable per id. One solid color, never a blend.
 */
export const COLLECTION_MARK_COLORS = [
  '#5C6B7A',
  '#8A7348',
  '#6B5B95',
  '#8E5A6B',
  '#3E6B62',
  '#A56B45',
  '#4E6294',
  '#6E6258',
] as const;

export const COLLECTION_MARK_SIZE = 48;

export function collectionMarkColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return COLLECTION_MARK_COLORS[hash % COLLECTION_MARK_COLORS.length];
}
