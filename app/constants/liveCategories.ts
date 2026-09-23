export const LIVE_CATEGORY_LABELS: Record<string, string> = {
  camels: 'إبل',
  sheep: 'أغنام',
  goats: 'ماعز',
  cattle: 'أبقار',
  horses: 'خيل',
  falcons: 'طيور',
  feed: 'أعلاف',
  general: 'عام',
};

export function liveCategoryLabel(id: string | undefined): string {
  if (!id) return 'عام';
  return LIVE_CATEGORY_LABELS[id] ?? id;
}
