/** Quiet "since" copy from a real timestamp. Never invents a duration. */
export function formatSinceAr(iso: string | null | undefined, now = Date.now()): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return null;
  const diff = now - then;
  if (diff < 0) return null;
  const days = Math.floor(diff / 86_400_000);
  const years = Math.floor(days / 365);
  if (years >= 1) return `منذ ${countAr(years, "سنة", "سنتين", "سنوات")}`;
  const months = Math.floor(days / 30);
  if (months >= 1) return `منذ ${countAr(months, "شهر", "شهرين", "أشهر")}`;
  if (days >= 1) return `منذ ${countAr(days, "يوم", "يومين", "أيام")}`;
  return "منذ اليوم";
}

function countAr(n: number, one: string, two: string, few: string): string {
  if (n <= 1) return one;
  if (n === 2) return two;
  if (n <= 10) return `${n} ${few}`;
  return `${n} ${one}`;
}

/**
 * Under the profile stars: account age when `createdAt` is known,
 * otherwise "موثّق منذ …" from verifiedSince. Null when neither date exists.
 */
export function profileSinceLabel(
  input: { createdAt?: string | null; verifiedSince?: string | null },
  now = Date.now(),
): string | null {
  const joined = formatSinceAr(input.createdAt, now);
  if (joined) return joined;
  const verified = formatSinceAr(input.verifiedSince, now);
  return verified ? `موثّق ${verified}` : null;
}
