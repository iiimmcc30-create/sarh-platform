/** Relative age on a review card, matching the marketplace list: «٣ أسابيع»، «شهرين»، «٤ شهور». */

const ARABIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

function toArabicDigits(n: number): string {
  return String(n).replace(/\d/g, (d) => ARABIC_DIGITS[Number(d)] ?? d);
}

function phrase(n: number, one: string, two: string, few: string, many: string): string {
  if (n <= 1) return one;
  if (n === 2) return two;
  if (n <= 10) return `${toArabicDigits(n)} ${few}`;
  return `${toArabicDigits(n)} ${many}`;
}

export function formatReviewAgeAr(input?: string | Date | null, nowMs: number = Date.now()): string {
  if (!input) return '';
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return '';

  const diffMs = nowMs - date.getTime();
  if (diffMs < 60_000) return 'الآن';

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return phrase(minutes, 'دقيقة', 'دقيقتين', 'دقائق', 'دقيقة');

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return phrase(hours, 'ساعة', 'ساعتين', 'ساعات', 'ساعة');

  const days = Math.floor(hours / 24);
  if (days < 7) return phrase(days, 'يوم', 'يومين', 'أيام', 'يوم');

  if (days < 30) {
    const weeks = Math.max(1, Math.floor(days / 7));
    return phrase(weeks, 'أسبوع', 'أسبوعين', 'أسابيع', 'أسبوع');
  }

  const months = Math.floor(days / 30);
  if (months < 12) return phrase(months, 'شهر', 'شهرين', 'شهور', 'شهر');

  const years = Math.max(1, Math.floor(days / 365));
  return phrase(years, 'سنة', 'سنتين', 'سنوات', 'سنة');
}
