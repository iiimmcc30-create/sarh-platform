/** BullMQ custom ids cannot contain `:`. Hyphens keep the id unique and idempotent. */
export function feeCheckJobId(listingFeeId: string): string {
  return `fee-${listingFeeId}`;
}
