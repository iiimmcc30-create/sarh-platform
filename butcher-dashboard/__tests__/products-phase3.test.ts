import {
  eventBelongsToButcher,
  notifyAllLiveRefreshDebounced,
  resetLiveRefreshDebounce,
  subscribeLiveRefresh,
} from '@/lib/live-refresh';
import { stockLabel } from '@/services/products.service';

describe('socket event tenant filter', () => {
  it('ignores payloads for another butcher when butcherId is present', () => {
    expect(eventBelongsToButcher({ butcherId: 'b-b' }, 'b-a')).toBe(false);
    expect(eventBelongsToButcher({ butcherId: 'b-a' }, 'b-a')).toBe(true);
  });

  it('allows inventory.updated payloads that only include productId', () => {
    expect(eventBelongsToButcher({ productId: 'p1' }, 'b-a')).toBe(true);
  });
});

describe('debounced live refresh', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    resetLiveRefreshDebounce();
  });
  afterEach(() => {
    resetLiveRefreshDebounce();
    jest.useRealTimers();
  });

  it('collapses duplicate socket bursts into one refresh', () => {
    const calls: string[] = [];
    const off = subscribeLiveRefresh('products', () => calls.push('p'));
    notifyAllLiveRefreshDebounced(250);
    notifyAllLiveRefreshDebounced(250);
    notifyAllLiveRefreshDebounced(250);
    expect(calls).toEqual([]);
    jest.advanceTimersByTime(250);
    expect(calls).toEqual(['p']);
    off();
  });
});

describe('inventory labels', () => {
  it('keeps available and reserved conceptually separate', () => {
    expect(stockLabel('ok')).toBe('متوفر');
    expect(stockLabel('low')).toBe('منخفض');
    expect(stockLabel('out')).toBe('نفد');
  });
});
