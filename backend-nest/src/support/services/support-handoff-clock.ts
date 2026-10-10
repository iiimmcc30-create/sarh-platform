/** Second staff alert fires once this long after the AI → human handoff. */
export const HANDOFF_REMINDER_AFTER_MS = 2 * 60 * 60 * 1000;

export function withHandoffAt(
  metadata: Record<string, unknown>,
  at: Date = new Date(),
): Record<string, unknown> {
  return { ...metadata, handoffAt: at.toISOString() };
}

/** Clock written at handoff. `updatedAt` is not used: replies move it. */
export function readHandoffAt(metadata: unknown): Date | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }
  const raw = (metadata as { handoffAt?: unknown }).handoffAt;
  if (typeof raw !== 'string' || !raw) return null;
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms);
}

export function handoffIsDue(
  metadata: unknown,
  now: Date,
  waitMs = HANDOFF_REMINDER_AFTER_MS,
): boolean {
  const at = readHandoffAt(metadata);
  if (!at) return false;
  return now.getTime() - at.getTime() >= waitMs;
}
