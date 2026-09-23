import { readFileSync } from 'fs';
import path from 'path';
import { TICKET_STATUS_LABEL_AR } from '../services/support';
import { messageAuthorLabel } from '../lib/supportRealtime';

describe('customer support UI phase 3', () => {
  it('labels Sarhan / staff / customer and shows human handoff statuses', () => {
    expect(messageAuthorLabel({ authorKind: 'SARHAN', isStaffReply: true })).toBe('سرحان');
    expect(messageAuthorLabel({ authorKind: 'STAFF', isStaffReply: true })).toBe('خدمة العملاء');
    expect(messageAuthorLabel({ authorKind: 'CUSTOMER', isStaffReply: false })).toBe('أنت');
    expect(TICKET_STATUS_LABEL_AR.WAITING_FOR_SUPPORT).toBeTruthy();
    const ticketScreen = readFileSync(
      path.join(__dirname, '../app/support/tickets/[id].tsx'),
      'utf8',
    );
    expect(ticketScreen).toContain('SUPPORT_CUSTOMER_SERVICE');
    expect(ticketScreen).not.toContain('سرحان لن يرد');
    expect(ticketScreen).toContain("from '@/constants/supportIdentity'");
  });
});
