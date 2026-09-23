import { OrderStateMachineService } from './order-state-machine.service';
import { OrderStatus } from '@prisma/client';

describe('OrderStateMachineService', () => {
  const sm = new OrderStateMachineService();

  it('allows defined transitions', () => {
    expect(sm.canTransition('pending', 'confirmed')).toBe(true);
    expect(sm.canTransition('pending', 'cancelled')).toBe(true);
    expect(sm.canTransition('confirmed', 'preparing')).toBe(true);
    expect(sm.canTransition('preparing', 'ready')).toBe(true);
    expect(sm.canTransition('ready', 'delivered')).toBe(true);
  });

  it('blocks invalid transitions', () => {
    expect(sm.canTransition('pending', 'delivered')).toBe(false);
    expect(sm.canTransition('preparing', 'cancelled')).toBe(false);
    expect(sm.canTransition('delivered', 'preparing')).toBe(false);
    expect(sm.canTransition('cancelled', 'confirmed')).toBe(false);
  });

  it('treats same status as allowed no-op', () => {
    expect(sm.canTransition('pending', 'pending')).toBe(true);
    expect(() => sm.assertTransition('pending', 'pending')).not.toThrow();
  });

  it('returns allowed next statuses', () => {
    expect(sm.getAllowedNext('pending')).toEqual(['confirmed', 'cancelled']);
    expect(sm.getAllowedNext('delivered')).toEqual([]);
  });

  const allStatuses: OrderStatus[] = [
    'pending',
    'confirmed',
    'preparing',
    'ready',
    'delivered',
    'cancelled',
  ];

  it('blocks every transition not in the matrix', () => {
    for (const from of allStatuses) {
      for (const to of allStatuses) {
        if (from === to) continue;
        const allowed = sm.getAllowedNext(from).includes(to);
        expect(sm.canTransition(from, to)).toBe(allowed);
      }
    }
  });
});
