const WINDOW_MS = 24 * 60 * 60 * 1000;
const memory: Array<{ route: string; at: number }> = [];

export function sanitizeErrorRoute(path: string): string {
  const bare = path.split('?')[0] || '/';
  return bare
    .replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      ':id',
    )
    .replace(/\/\d+(?=\/|$)/g, '/:n')
    .slice(0, 80);
}

/** Count a 5xx by route only. No body, user, or query string. */
export function noteServerError(path: string, at = Date.now()): void {
  memory.push({ route: sanitizeErrorRoute(path), at });
  const cutoff = at - WINDOW_MS;
  while (memory.length && memory[0]!.at < cutoff) memory.shift();
}

export function errorCountsSince(sinceMs: number): Array<{ route: string; count: number }> {
  const totals = new Map<string, number>();
  for (const row of memory) {
    if (row.at < sinceMs) continue;
    totals.set(row.route, (totals.get(row.route) ?? 0) + 1);
  }
  return [...totals.entries()]
    .map(([route, count]) => ({ route, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);
}

export function clearErrorCountsForTests(): void {
  memory.length = 0;
}
