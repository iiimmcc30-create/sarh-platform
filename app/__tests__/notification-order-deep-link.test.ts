jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
}));
jest.mock('expo-device', () => ({ isDevice: true }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  multiGet: jest.fn(),
}));

import { handleNotificationNavigation } from '@/lib/notifications';
import { resetNavigationLockForTests, setCurrentPathname } from '@/lib/safeNavigate';

function router() {
  return { push: jest.fn(), replace: jest.fn() };
}

function lastPush(r: { push: jest.Mock }) {
  return r.push.mock.calls[r.push.mock.calls.length - 1]?.[0];
}

describe('order and support notification deep links', () => {
  beforeEach(() => {
    setCurrentPathname('/notifications');
    resetNavigationLockForTests();
  });

  it('does not open removed butcher order screens', () => {
    const r = router();
    const ok = handleNotificationNavigation(
      {
        type: 'order_update',
        data: {
          orderId: 'ord-prep',
          butcherId: 'b1',
          status: 'pending',
          paymentStatus: 'unpaid',
        },
      },
      { router: r as never, isAdmin: false },
    );
    expect(ok).toBe(false);
    expect(r.push).not.toHaveBeenCalled();
  });

  it('opens the support ticket by id and ignores payload snapshot fields', () => {
    const r = router();
    handleNotificationNavigation(
      {
        type: 'system',
        data: {
          event: 'support_ticket_staff_reply',
          ticketId: 'tix-9',
          status: 'OPEN',
          lastMessage: 'old',
        },
      },
      { router: r as never, isAdmin: false },
    );
    const arg = lastPush(r);
    expect(arg.pathname).toBe('/support/tickets/[id]');
    expect(arg.params.id).toBe('tix-9');
    expect(arg.params.fresh).toBeTruthy();
    expect(arg.params.lastMessage).toBeUndefined();
  });

  it('opens listing/user chat from message notifications', () => {
    const r = router();
    handleNotificationNavigation(
      {
        type: 'new_message',
        data: { threadId: 'th-1', senderId: 'u2', threadType: 'DIRECT' },
      },
      { router: r as never, isAdmin: false },
    );
    const arg = lastPush(r);
    expect(arg.pathname).toBe('/chat');
    expect(arg.params.threadId).toBe('th-1');
    expect(arg.params.receiverId).toBe('u2');
  });
});
