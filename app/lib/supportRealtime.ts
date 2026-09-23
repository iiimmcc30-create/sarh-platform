import type { SupportTicketMessage } from '@/services/support';

export type SupportSocketLike = {
  emit: (event: string, ...args: unknown[]) => void;
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  off: (event: string, handler: (...args: unknown[]) => void) => void;
};

export function attachSupportTicketListener(
  socket: SupportSocketLike,
  ticketId: string,
  onPayload: (payload: unknown) => void,
): () => void {
  socket.emit('support:join', { ticketId });
  const handler = (payload: unknown) => onPayload(payload);
  socket.on('support:message', handler);
  return () => {
    socket.emit('support:leave', { ticketId });
    socket.off('support:message', handler);
  };
}

export function messageAuthorLabel(msg: Pick<SupportTicketMessage, 'authorKind' | 'isStaffReply'>): string {
  if (msg.authorKind === 'SARHAN') return 'سرحان';
  if (msg.authorKind === 'STAFF' || msg.isStaffReply) return 'خدمة العملاء';
  return 'أنت';
}
