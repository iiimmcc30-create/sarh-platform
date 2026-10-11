import { mergeSupportMessages } from '../lib/supportThread';
import type { SupportTicketMessage } from '../services/support';

function msg(
  partial: Pick<SupportTicketMessage, 'id' | 'createdAt' | 'body'> &
    Partial<SupportTicketMessage>,
): SupportTicketMessage {
  return {
    isStaffReply: partial.authorKind !== 'CUSTOMER',
    authorKind: 'SARHAN',
    ...partial,
  };
}

describe('support thread order', () => {
  it('sorts by createdAt then id, so a same-millisecond user line stays before the reply', () => {
    const at = '2026-10-11T18:15:48.000Z';
    const merged = mergeSupportMessages(
      [
        msg({
          id: 'bbbb',
          createdAt: at,
          authorKind: 'SARHAN',
          body: 'رد',
        }),
        msg({
          id: 'aaaa',
          createdAt: at,
          authorKind: 'CUSTOMER',
          isStaffReply: false,
          body: 'ماهو اشتراكي',
        }),
      ],
      [],
    );
    expect(merged.map((message) => message.id)).toEqual(['aaaa', 'bbbb']);
  });

  it('keeps the optimistic line until the server copy arrives, then drops it', () => {
    const pending = [
      msg({
        id: 'local-1',
        createdAt: '2026-10-11T18:16:00.000Z',
        authorKind: 'CUSTOMER',
        isStaffReply: false,
        body: 'ماهو اشتراكي',
      }),
    ];
    const waiting = mergeSupportMessages(
      [
        msg({
          id: 'welcome',
          createdAt: '2026-10-11T18:15:48.000Z',
          authorKind: 'SARHAN',
          body: 'هلا',
        }),
      ],
      pending,
    );
    expect(waiting.map((message) => message.id)).toEqual(['welcome', 'local-1']);

    const settled = mergeSupportMessages(
      [
        msg({
          id: 'welcome',
          createdAt: '2026-10-11T18:15:48.000Z',
          authorKind: 'SARHAN',
          body: 'هلا',
        }),
        msg({
          id: 'question',
          createdAt: '2026-10-11T18:16:00.100Z',
          authorKind: 'CUSTOMER',
          isStaffReply: false,
          body: 'ماهو اشتراكي',
        }),
        msg({
          id: 'answer',
          createdAt: '2026-10-11T18:16:01.000Z',
          authorKind: 'SARHAN',
          body: 'اشتراكك مجاني',
        }),
      ],
      pending,
    );
    expect(settled.map((message) => message.id)).toEqual([
      'welcome',
      'question',
      'answer',
    ]);
  });
});
