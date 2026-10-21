/** True once the live playlist exists AND lists at least one segment (a viewer could play it). */
export async function playlistHasSegments(
  url: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 3000,
): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${url}?probe=${Date.now()}`, {
      signal: ctrl.signal,
      headers: { 'cache-control': 'no-cache' },
    });
    if (!res.ok) return false;
    const body = await res.text();
    return body.includes('#EXTM3U') && body.includes('#EXTINF');
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
