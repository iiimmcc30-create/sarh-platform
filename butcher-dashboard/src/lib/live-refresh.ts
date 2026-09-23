type Handler = () => void;

const listeners = new Map<string, Set<Handler>>();

export type LiveTopic = 'orders' | 'dashboard' | 'products' | 'inventory' | 'customers' | 'reports';

export function subscribeLiveRefresh(topic: LiveTopic, handler: Handler): () => void {
  const set = listeners.get(topic) ?? new Set<Handler>();
  set.add(handler);
  listeners.set(topic, set);
  return () => {
    set.delete(handler);
  };
}

export function notifyLiveRefresh(topic: LiveTopic): void {
  listeners.get(topic)?.forEach((handler) => handler());
}

export function notifyAllLiveRefresh(): void {
  notifyLiveRefresh('orders');
  notifyLiveRefresh('dashboard');
  notifyLiveRefresh('products');
  notifyLiveRefresh('inventory');
  notifyLiveRefresh('customers');
  notifyLiveRefresh('reports');
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

/** Collapses reconnect/duplicate socket bursts into one refetch. */
export function notifyAllLiveRefreshDebounced(ms = 250): void {
  if (debounceTimer) return;
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    notifyAllLiveRefresh();
  }, ms);
}

export function resetLiveRefreshDebounce(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
}

export function eventBelongsToButcher(
  payload: unknown,
  butcherId: string | null,
): boolean {
  if (!payload || typeof payload !== 'object') return true;
  const id = (payload as { butcherId?: unknown }).butcherId;
  if (typeof id !== 'string' || !id) return true;
  if (!butcherId) return true;
  return id === butcherId;
}
