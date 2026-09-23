/** Arabic relative time like Haraj: قبل ٢٤ دقيقة */

const ARABIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

function toArabicDigits(n: number): string {
  return String(n).replace(/\d/g, (d) => ARABIC_DIGITS[Number(d)]);
}

export function formatRelativeTimeAr(input?: string | Date | null): string {
  if (!input) return '';
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) {
    return typeof input === 'string' ? input : '';
  }

  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) return 'الآن';

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 45) return 'الآن';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    if (minutes === 1) return 'قبل دقيقة';
    if (minutes === 2) return 'قبل دقيقتين';
    if (minutes <= 10) return `قبل ${toArabicDigits(minutes)} دقائق`;
    return `قبل ${toArabicDigits(minutes)} دقيقة`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    if (hours === 1) return 'قبل ساعة';
    if (hours === 2) return 'قبل ساعتين';
    if (hours <= 10) return `قبل ${toArabicDigits(hours)} ساعات`;
    return `قبل ${toArabicDigits(hours)} ساعة`;
  }

  const days = Math.floor(hours / 24);
  if (days < 30) {
    if (days === 1) return 'قبل يوم';
    if (days === 2) return 'قبل يومين';
    if (days <= 10) return `قبل ${toArabicDigits(days)} أيام`;
    return `قبل ${toArabicDigits(days)} يوم`;
  }

  const months = Math.floor(days / 30);
  if (months < 12) {
    if (months === 1) return 'قبل شهر';
    if (months === 2) return 'قبل شهرين';
    if (months <= 10) return `قبل ${toArabicDigits(months)} أشهر`;
    return `قبل ${toArabicDigits(months)} شهر`;
  }

  return date.toLocaleDateString('ar-SA');
}

/**
 * Smart post timestamp: relative for the first week ("قبل ساعتين"),
 * then falls back to an explicit date + time ("١٥ يوليو ٢٠٢٦ - ٣:٢٠ م").
 */
export function formatPostTimestampAr(input?: string | Date | null): string {
  if (!input) return '';
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) {
    return typeof input === 'string' ? input : '';
  }

  const diffDays = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays < 7) return formatRelativeTimeAr(date);

  const datePart = date.toLocaleDateString('ar-SA', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const timePart = date.toLocaleTimeString('ar-SA', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return `${datePart} - ${timePart}`;
}

/** Clock only — e.g. ١٠:٣٩ م */
export function formatPostClockAr(input?: string | Date | null): string {
  if (!input) return '';
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('ar-SA', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/** Short calendar date — e.g. ١٠ سبتمبر ٢٦ */
export function formatPostDateShortAr(input?: string | Date | null): string {
  if (!input) return '';
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('ar-SA', {
    day: 'numeric',
    month: 'long',
    year: '2-digit',
  });
}

/**
 * External post card timestamp only (feed / profile rows).
 * < 24h → Nس | 1–7 days → Nيوم | > 7 days → "8 أغسطس" (no year).
 * Internal post detail page uses formatPostClockAr + formatPostDateShortAr instead.
 */
export function formatPostCardTimestampAr(
  input?: string | Date | null,
  nowMs: number = Date.now(),
): string {
  if (!input) return '';
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) {
    return typeof input === 'string' ? input : '';
  }

  const diffMs = nowMs - date.getTime();
  const hourMs = 60 * 60 * 1000;
  const dayMs = 24 * hourMs;
  const totalHours = Math.floor(diffMs / hourMs);
  const totalDays = Math.floor(diffMs / dayMs);

  if (totalDays >= 8) {
    const day = date.getDate();
    const month = date.toLocaleDateString('ar-SA', { month: 'long' });
    return `${day} ${month}`;
  }

  if (totalDays >= 1) {
    return `${totalDays}يوم`;
  }

  if (diffMs < 0) return '1س';

  const hours = Math.max(1, totalHours);
  return `${hours}س`;
}

/** Real view count from API — never a placeholder. */
export function formatViewsLabelAr(views: number): string {
  const n = toArabicDigits(views);
  return views === 1 ? `${n} مشاهدة` : `${n} مشاهدات`;
}
