import type { SupportTicketMessage } from '@/services/support';

export function compareSupportMessages(
  a: Pick<SupportTicketMessage, 'id' | 'createdAt'>,
  b: Pick<SupportTicketMessage, 'id' | 'createdAt'>,
): number {
  const ta = Date.parse(a.createdAt);
  const tb = Date.parse(b.createdAt);
  const aTime = Number.isFinite(ta) ? ta : 0;
  const bTime = Number.isFinite(tb) ? tb : 0;
  if (aTime !== bTime) return aTime - bTime;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

/**
 * Keep a local bubble until the server copy of that same customer line arrives,
 * then drop it. Server order is createdAt then id.
 */
export function mergeSupportMessages(
  server: SupportTicketMessage[],
  pending: SupportTicketMessage[],
): SupportTicketMessage[] {
  const used = new Set<string>();
  const kept: SupportTicketMessage[] = [];
  for (const local of pending) {
    const match = server.find(
      (message) =>
        !used.has(message.id) &&
        message.authorKind === 'CUSTOMER' &&
        message.body.trim() === local.body.trim(),
    );
    if (match) used.add(match.id);
    else kept.push(local);
  }
  return [...server, ...kept].sort(compareSupportMessages);
}
