const DEFAULT_TITLE_MAX = 120;

/** Title shown on story cards — excerpt from the start of the article body. */
export function deriveEditorialStoryTitle(
  bodyAr: string,
  maxLen = DEFAULT_TITLE_MAX,
): string {
  const normalized = bodyAr.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';

  const firstLine = normalized.split(/\n/)[0]?.trim() ?? normalized;
  if (firstLine.length <= maxLen) return firstLine;

  const slice = firstLine.slice(0, maxLen).trim();
  return slice.endsWith('…') ? slice : `${slice}…`;
}
