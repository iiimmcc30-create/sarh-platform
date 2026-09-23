export const FEED_PRODUCT_CATEGORIES = [
  'livestock',
  'sheep',
  'camels',
  'poultry',
  'hay',
  'barley',
] as const;

export type FeedProductCategory = (typeof FEED_PRODUCT_CATEGORIES)[number];

export const FEED_CATEGORY_LABELS: Record<FeedProductCategory, string> = {
  livestock: 'أعلاف مواشي',
  sheep: 'أعلاف أغنام',
  camels: 'أعلاف إبل',
  poultry: 'أعلاف دواجن',
  hay: 'تبن',
  barley: 'شعير',
};

export const FEED_CATEGORY_FILTERS: Array<{
  value: FeedProductCategory | 'all';
  label: string;
}> = [
  { value: 'all', label: 'الكل' },
  ...FEED_PRODUCT_CATEGORIES.map((value) => ({
    value,
    label: FEED_CATEGORY_LABELS[value],
  })),
];

export function feedCategoryLabel(category: string): string {
  return FEED_CATEGORY_LABELS[category as FeedProductCategory] ?? category;
}

export function digitsOnly(value?: string | null): string {
  return (value ?? '').replace(/[^\d]/g, '');
}

export function whatsappUrl(phone?: string | null): string | null {
  const digits = digitsOnly(phone);
  return digits ? `https://wa.me/${digits}` : null;
}

export function telUrl(phone?: string | null): string | null {
  const trimmed = phone?.trim();
  return trimmed ? `tel:${trimmed}` : null;
}

export function mapsUrl(input: {
  lat?: number | null;
  lng?: number | null;
  addressAr?: string | null;
  cityAr?: string | null;
}): string | null {
  if (input.lat != null && input.lng != null) {
    return `https://maps.google.com/?q=${input.lat},${input.lng}`;
  }
  const query = [input.addressAr, input.cityAr].filter(Boolean).join(' ');
  return query ? `https://maps.google.com/?q=${encodeURIComponent(query)}` : null;
}

export function mailtoUrl(email?: string | null): string | null {
  const trimmed = email?.trim();
  return trimmed ? `mailto:${trimmed}` : null;
}

export function websiteUrl(value?: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function supplierPlace(input: {
  cityAr?: string | null;
  districtAr?: string | null;
}): string {
  return [input.districtAr, input.cityAr].filter(Boolean).join('، ');
}
