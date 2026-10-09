import type { TicketPriority } from '@prisma/client';

/**
 * Default priority of a new support ticket.
 * - Gold subscribers (`User.verifiedTier === 'gold'`, set only while Gold is
 *   active and approved) get HIGH — read-only use of the tier.
 * - Fraud reports from the help center get HIGH.
 * Everything else stays NORMAL (staff can still change it in the admin panel).
 */
export function ticketPriorityFor(input: {
  verifiedTier?: string | null;
  category?: string | null;
}): TicketPriority {
  if (input.verifiedTier === 'gold') return 'HIGH';
  if (input.category === 'FRAUD') return 'HIGH';
  return 'NORMAL';
}
