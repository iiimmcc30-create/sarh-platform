// «عن هذا الحساب» (X-style About this account): pure copy + row model.
// Only data the app already stores and shows (createdAt, User.country, verifiedSince):
// no IP geolocation, no new tracking.
import { countries, type Country } from '@/services/types';
import { formatArMonthYear } from '@/lib/verifiedBadge';

export const ABOUT_ACCOUNT_TITLE = 'عن هذا الحساب';
export const ABOUT_ACCOUNT_ROUTE = '/profile/about';

export type AboutAccountRowKey = 'joined' | 'country' | 'verified';

export type AboutAccountRow = {
  key: AboutAccountRowKey;
  /** AppIcon name; the verified row draws the tier seal instead. */
  icon: string | null;
  title: string;
  subtitle: string | null;
};

export type AboutAccountInput = {
  createdAt?: string | null;
  country?: string | null;
  verified?: boolean;
  verifiedSince?: string | null;
};

/** Arabic country name for the stored `User.country` code; null for unknown / absent. */
export function aboutCountryLabel(code: string | null | undefined): string | null {
  if (!code || !(code in countries)) return null;
  return countries[code as Country].ar;
}

/** Rows in X order: joined, located in, verified. A row with no real value is omitted. */
export function aboutAccountRows(input: AboutAccountInput): AboutAccountRow[] {
  const rows: AboutAccountRow[] = [];
  const joined = formatArMonthYear(input.createdAt);
  if (joined) {
    rows.push({ key: 'joined', icon: 'calendar-outline', title: 'تاريخ الانضمام', subtitle: joined });
  }
  const country = aboutCountryLabel(input.country);
  if (country) {
    rows.push({ key: 'country', icon: 'location-outline', title: 'الحساب موجود في', subtitle: country });
  }
  if (input.verified === true) {
    const since = formatArMonthYear(input.verifiedSince);
    rows.push({ key: 'verified', icon: null, title: 'مُوثّق', subtitle: since ? `منذ ${since}` : null });
  }
  return rows;
}

/** Inline profile rating «★ 4.8 (23)»: one decimal average + review count; null with no reviews. */
export function profileRatingInline(
  rating: number | null | undefined,
  reviewCount: number | null | undefined,
): { average: string; count: string } | null {
  const count = reviewCount ?? 0;
  if (rating == null || !Number.isFinite(rating) || count <= 0) return null;
  return { average: rating.toFixed(1), count: `(${count.toLocaleString('en-US')})` };
}
