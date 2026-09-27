import { readFileSync } from 'fs';
import path from 'path';

describe('admin support ticket UI hardening', () => {
  const detail = readFileSync(
    path.join(__dirname, '../src/app/(dashboard)/support/tickets/[id]/page.tsx'),
    'utf8',
  );
  const hook = readFileSync(
    path.join(__dirname, '../src/hooks/useAdminSupportTicketSocket.ts'),
    'utf8',
  );

  it('has no order actions and wires support socket rooms', () => {
    expect(detail).not.toMatch(/updateOrder|refund|تعديل الطلب|إلغاء الطلب/);
    expect(detail).toContain('useAdminSupportTicketSocket');
    expect(hook).toContain("support:join");
    expect(hook).toContain('support:message');
  });
});
