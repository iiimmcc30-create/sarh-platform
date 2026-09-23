import { subscribeLiveRefresh, notifyLiveRefresh } from '@/lib/live-refresh';
import { ORDER_STATUS_LABELS } from '@/constants/orders';

describe('live refresh bus', () => {
  it('notifies subscribers so sockets can refresh later without rewriting pages', () => {
    const calls: string[] = [];
    const off = subscribeLiveRefresh('orders', () => calls.push('orders'));
    notifyLiveRefresh('orders');
    notifyLiveRefresh('dashboard');
    expect(calls).toEqual(['orders']);
    off();
    notifyLiveRefresh('orders');
    expect(calls).toEqual(['orders']);
  });
});

describe('order status labels', () => {
  it('does not invent accepted or in_delivery statuses', () => {
    expect(ORDER_STATUS_LABELS).not.toHaveProperty('accepted');
    expect(ORDER_STATUS_LABELS).not.toHaveProperty('in_delivery');
  });
});
