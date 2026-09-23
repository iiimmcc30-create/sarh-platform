/**
 * Tenant-prefixed cache keys for a later Redis layer.
 * Not wired to Redis yet — correctness and isolation come first.
 */
export function daftraReadCacheKey(
  butcherId: string,
  resource: 'status' | 'products' | 'product' | 'inventory',
  extra = '',
): string {
  return ['daftra', butcherId, resource, extra].filter(Boolean).join(':');
}
