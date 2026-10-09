/**
 * Settings search: filters rows by title, group title, current value and
 * keywords. Arabic-aware normalization (hamza forms, taa marbuta, alef maqsura,
 * tatweel, diacritics) so «اشعارات» finds «الإشعارات».
 */
export type SearchableSettingsRow = {
  key: string;
  title: string;
  value?: string;
  keywords?: string[];
};

export type SearchableSettingsGroup<R extends SearchableSettingsRow> = {
  key: string;
  title: string;
  rows: R[];
};

export function normalizeArabic(input: string): string {
  return input
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0670\u0640]/g, '')
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/^ال/, '')
    .replace(/\sال/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function filterSettingsGroups<G extends SearchableSettingsGroup<SearchableSettingsRow>>(
  groups: G[],
  query: string,
): G[] {
  const q = normalizeArabic(query);
  if (!q) return groups;
  const terms = q.split(' ').filter(Boolean);
  const out: G[] = [];
  for (const group of groups) {
    const groupText = normalizeArabic(group.title);
    const rows = group.rows.filter((row) => {
      const hay = normalizeArabic(
        [row.title, row.value ?? '', ...(row.keywords ?? []), groupText].join(' '),
      );
      return terms.every((t) => hay.includes(t));
    });
    if (rows.length > 0) out.push({ ...group, rows } as G);
  }
  return out;
}
