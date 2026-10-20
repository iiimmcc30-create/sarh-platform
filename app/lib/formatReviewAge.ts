/** Review age like the ratings screen: «٣ أسابيع»، «شهرين»، «٤ شهور». */

const ARABIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

function toArabicDigits(n: number): string {
  return String(n).replace(/\d/g, (digit) => ARABIC_DIGITS[Number(digit)] ?? digit);
}

function unit(n: number, one: string, two: string, few: string, many: string): string {
  if (n <= 1) return one;
  if (n === 2) return two;
  return `${toArabicDigits(n)} ${n <= 10 ? few : many}`;
}

export function formatReviewAgeAr(
  input?: string | Date | null,
  now = Date.now(),
): string {
  if (!input) return '';
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return '';

  const diff = now - date.getTime();
  if (diff < 45_000) return 'الآن';

  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return unit(minutes, 'دقيقة', 'دقيقتين', 'دقائق', 'دقيقة');

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return unit(hours, 'ساعة', 'ساعتين', 'ساعات', 'ساعة');

  const days = Math.floor(hours / 24);
  if (days < 7) return unit(days, 'يوم', 'يومين', 'أيام', 'يوم');
  if (days < 30) return unit(Math.floor(days / 7), 'أسبوع', 'أسبوعين', 'أسابيع', 'أسبوع');

  const months = Math.floor(days / 30);
  if (months < 12) return unit(months, 'شهر', 'شهرين', 'شهور', 'شهر');

  return unit(Math.max(1, Math.floor(days / 365)), 'سنة', 'سنتين', 'سنوات', 'سنة');
}
